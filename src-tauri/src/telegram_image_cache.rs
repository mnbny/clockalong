use rand::Rng;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::SystemTime,
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Manager, Runtime,
};

const IMAGE_BYTES: usize = 512 * 1024;
const CACHE_BYTES: u64 = 64 * 1024 * 1024;
const CACHE_FILES: usize = 1024;
const FAILED: &str = "Could not access the Telegram image cache.";
const INACTIVE: &str = "This Telegram image cache is no longer available.";

#[derive(Default)]
pub struct TelegramImageCacheState(Arc<Mutex<ImageCache>>);

#[derive(Default)]
struct ImageCache {
    active: Option<CacheScope>,
}

struct CacheScope {
    group: String,
    token: String,
    directory: PathBuf,
}

fn hash(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn remove_directory(directory: &Path) -> Result<(), String> {
    match fs::remove_dir_all(directory) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(_) => Err(FAILED.into()),
    }
}

fn private_directory(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory).map_err(|_| FAILED)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700)).map_err(|_| FAILED)?;
    }
    Ok(())
}

fn prune(directory: &Path, bytes: u64, count: usize) -> Result<(), String> {
    let mut files = Vec::new();
    let mut total = 0;
    for entry in fs::read_dir(directory).map_err(|_| FAILED)? {
        let entry = entry.map_err(|_| FAILED)?;
        let metadata = entry.metadata().map_err(|_| FAILED)?;
        if entry.path().extension().is_some()
            || !metadata.is_file()
            || metadata.len() > IMAGE_BYTES as u64
        {
            if metadata.is_dir() {
                remove_directory(&entry.path())?;
            } else {
                fs::remove_file(entry.path()).map_err(|_| FAILED)?;
            }
            continue;
        }
        total += metadata.len();
        files.push((
            entry.path(),
            metadata.len(),
            metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
        ));
    }
    files.sort_by_key(|file| file.2);
    let mut remaining = files.len();
    for (path, size, _) in files {
        if total <= bytes && remaining <= count {
            break;
        }
        fs::remove_file(path).map_err(|_| FAILED)?;
        total -= size;
        remaining -= 1;
    }
    Ok(())
}

impl ImageCache {
    fn select(&mut self, root: &Path, group: &str) -> Result<(), String> {
        self.active = None;
        private_directory(root)?;
        let directory = root.join(hash(group));
        for entry in fs::read_dir(root).map_err(|_| FAILED)? {
            let entry = entry.map_err(|_| FAILED)?;
            if entry.path() != directory {
                if entry.file_type().map_err(|_| FAILED)?.is_dir() {
                    remove_directory(&entry.path())?;
                } else {
                    fs::remove_file(entry.path()).map_err(|_| FAILED)?;
                }
            }
        }
        private_directory(&directory)?;
        prune(&directory, CACHE_BYTES, CACHE_FILES)?;
        let mut random = [0u8; 16];
        rand::rng().fill_bytes(&mut random);
        self.active = Some(CacheScope {
            group: group.into(),
            token: random.iter().map(|byte| format!("{byte:02x}")).collect(),
            directory,
        });
        Ok(())
    }

    fn token(&self, group: &str) -> Result<String, String> {
        self.active
            .as_ref()
            .filter(|scope| scope.group == group)
            .map(|scope| scope.token.clone())
            .ok_or_else(|| INACTIVE.into())
    }

    fn path(&self, token: &str, key: &str) -> Result<PathBuf, String> {
        if key.is_empty() || key.len() > 256 {
            return Err(FAILED.into());
        }
        let scope = self
            .active
            .as_ref()
            .filter(|scope| scope.token == token)
            .ok_or(INACTIVE)?;
        Ok(scope.directory.join(hash(key)))
    }

    fn read(&self, token: &str, key: &str) -> Result<Vec<u8>, String> {
        let path = self.path(token, key)?;
        let file = match File::open(&path) {
            Ok(file) => file,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(_) => return Err(FAILED.into()),
        };
        let mut bytes = Vec::new();
        (&file)
            .take(IMAGE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| FAILED)?;
        if bytes.is_empty() || bytes.len() > IMAGE_BYTES {
            fs::remove_file(path).map_err(|_| FAILED)?;
            return Ok(Vec::new());
        }
        let _ = file.set_modified(SystemTime::now());
        Ok(bytes)
    }

    fn write(&self, token: &str, key: &str, bytes: &[u8]) -> Result<(), String> {
        let path = self.path(token, key)?;
        if bytes.is_empty() || bytes.len() > IMAGE_BYTES {
            return Err(FAILED.into());
        }
        let directory = path.parent().ok_or(FAILED)?;
        // The budget includes partial files.
        prune(directory, CACHE_BYTES - bytes.len() as u64, CACHE_FILES - 1)?;
        let temporary = path.with_extension("part");
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let result = (|| {
            let mut file = options.open(&temporary).map_err(|_| FAILED)?;
            file.write_all(bytes).map_err(|_| FAILED)?;
            file.sync_all().map_err(|_| FAILED)?;
            drop(file);
            fs::rename(&temporary, &path).map_err(|_| FAILED)
        })();
        if result.is_err() {
            let _ = fs::remove_file(temporary);
        }
        result.map_err(str::to_string)
    }

    fn clear(&mut self, root: &Path) -> Result<(), String> {
        // Invalidate first, even if filesystem cleanup fails. Late writes cannot restore files.
        self.active = None;
        remove_directory(root)
    }
}

async fn with_cache<T: Send + 'static>(
    state: Arc<Mutex<ImageCache>>,
    action: impl FnOnce(&mut ImageCache) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cache = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        action(&mut cache)
    })
    .await
    .map_err(|_| FAILED.to_string())?
}

fn directory<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_cache_dir()
        .map_err(|_| FAILED)?
        .join("telegram-images-v1"))
}

pub fn select<R: Runtime>(app: &AppHandle<R>, group: String) -> Result<(), String> {
    let root = directory(app)?;
    tauri::async_runtime::block_on(with_cache(
        app.state::<TelegramImageCacheState>().0.clone(),
        move |cache| cache.select(&root, &group),
    ))
}

pub fn clear<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let root = directory(app)?;
    tauri::async_runtime::block_on(with_cache(
        app.state::<TelegramImageCacheState>().0.clone(),
        move |cache| cache.clear(&root),
    ))
}

#[tauri::command]
pub async fn telegram_image_cache_scope<R: Runtime>(
    app: AppHandle<R>,
    group: String,
) -> Result<String, String> {
    with_cache(
        app.state::<TelegramImageCacheState>().0.clone(),
        move |cache| cache.token(&group),
    )
    .await
}

#[tauri::command]
pub async fn telegram_image_cache_read<R: Runtime>(
    app: AppHandle<R>,
    token: String,
    key: String,
) -> Result<Response, String> {
    with_cache(
        app.state::<TelegramImageCacheState>().0.clone(),
        move |cache| cache.read(&token, &key).map(Response::new),
    )
    .await
}

#[tauri::command]
pub async fn telegram_image_cache_write<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<(), String> {
    let header = |name| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string)
            .ok_or(FAILED)
    };
    let token = header("x-telegram-image-token")?;
    let key = header("x-telegram-image-key")?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) if !bytes.is_empty() && bytes.len() <= IMAGE_BYTES => bytes.clone(),
        _ => return Err(FAILED.into()),
    };
    with_cache(
        app.state::<TelegramImageCacheState>().0.clone(),
        move |cache| cache.write(&token, &key, &bytes),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Directory(PathBuf);
    impl Directory {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!("clockalong-images-{}", rand::random::<u64>())))
        }
    }
    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn restart_reuses_images_but_not_old_handles_or_partial_files() {
        let root = Directory::new();
        let mut cache = ImageCache::default();
        cache.select(&root.0, "1:basic:123").unwrap();
        let old = cache.token("1:basic:123").unwrap();
        cache.write(&old, "avatar:1:9", b"image").unwrap();
        let path = cache.path(&old, "avatar:1:9").unwrap();
        fs::write(path.with_extension("part"), b"unfinished").unwrap();
        drop(cache);

        let mut cache = ImageCache::default();
        cache.select(&root.0, "1:basic:123").unwrap();
        let token = cache.token("1:basic:123").unwrap();
        assert_eq!(cache.read(&token, "avatar:1:9").unwrap(), b"image");
        assert!(cache.read(&token, "avatar:1:10").unwrap().is_empty());
        assert!(cache.read(&old, "avatar:1:9").is_err());
        assert!(!path.with_extension("part").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(path).unwrap().permissions().mode() & 0o777,
                0o600
            );
            assert_eq!(
                fs::metadata(&root.0).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
    }

    #[test]
    fn unlink_removes_images_and_rejects_late_writes_even_after_reconnecting() {
        let root = Directory::new();
        let mut cache = ImageCache::default();
        cache.select(&root.0, "1:basic:123").unwrap();
        let old = cache.token("1:basic:123").unwrap();
        cache.write(&old, "preview:9", b"image").unwrap();
        cache.clear(&root.0).unwrap();
        assert!(!root.0.exists());
        assert!(cache.write(&old, "preview:9", b"late").is_err());
        assert!(!root.0.exists());
        cache.select(&root.0, "1:basic:123").unwrap();
        assert!(cache.write(&old, "preview:9", b"late").is_err());
        let token = cache.token("1:basic:123").unwrap();
        assert!(cache.read(&token, "preview:9").unwrap().is_empty());
        cache.clear(&root.0).unwrap();
        cache.clear(&root.0).unwrap();
    }

    #[test]
    fn changing_account_or_group_drops_the_previous_images() {
        let root = Directory::new();
        let mut cache = ImageCache::default();
        for group in ["1:basic:123", "2:basic:123", "2:supergroup:123"] {
            cache.select(&root.0, group).unwrap();
            let token = cache.token(group).unwrap();
            assert!(cache.read(&token, "avatar:1:9").unwrap().is_empty());
            cache.write(&token, "avatar:1:9", b"image").unwrap();
            assert_eq!(fs::read_dir(&root.0).unwrap().count(), 1);
        }
        assert!(cache.token("1:basic:123").is_err());
    }

    #[test]
    fn eviction_respects_recent_reads_byte_budget_and_file_count() {
        let root = Directory::new();
        let mut cache = ImageCache::default();
        cache.select(&root.0, "group").unwrap();
        let token = cache.token("group").unwrap();
        for (key, seconds) in [("a", 1), ("b", 2), ("c", 3)] {
            cache.write(&token, key, b"1234").unwrap();
            File::open(cache.path(&token, key).unwrap())
                .unwrap()
                .set_modified(SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(seconds))
                .unwrap();
        }
        cache.read(&token, "a").unwrap();
        let directory = &cache.active.as_ref().unwrap().directory;
        prune(directory, 8, 10).unwrap();
        assert!(cache.read(&token, "b").unwrap().is_empty());
        assert_eq!(cache.read(&token, "a").unwrap(), b"1234");
        prune(directory, 8, 1).unwrap();
        assert!(cache.read(&token, "c").unwrap().is_empty());
        assert_eq!(cache.read(&token, "a").unwrap(), b"1234");
    }

    #[test]
    fn image_size_is_bounded_and_keys_cannot_choose_paths() {
        let root = Directory::new();
        let mut cache = ImageCache::default();
        cache.select(&root.0, "group").unwrap();
        let token = cache.token("group").unwrap();
        assert!(cache
            .write(&token, "oversize", &vec![0; IMAGE_BYTES + 1])
            .is_err());
        let key = "../../outside";
        cache.write(&token, key, b"image").unwrap();
        assert_eq!(
            cache.path(&token, key).unwrap().parent(),
            Some(cache.active.as_ref().unwrap().directory.as_path())
        );
        assert_eq!(cache.read(&token, key).unwrap(), b"image");
        fs::write(cache.path(&token, key).unwrap(), vec![0; IMAGE_BYTES + 1]).unwrap();
        assert!(cache.read(&token, key).unwrap().is_empty());
        assert!(!cache.path(&token, key).unwrap().exists());
    }
}
