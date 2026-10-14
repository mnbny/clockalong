use rand::Rng;
use serde::Serialize;
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{ipc::InvokeBody, ipc::Request, AppHandle, Manager, Runtime};

const CHUNK_BYTES: usize = 512 * 1024;
const FAILED: &str = "Could not prepare Telegram media.";
const INACTIVE: &str = "This Telegram media is no longer available.";

#[derive(Default)]
pub struct TelegramMediaState(Arc<Mutex<MediaWriter>>);

#[derive(Default)]
struct MediaWriter {
    directory: Option<PathBuf>,
    transfers: HashMap<String, MediaFile>,
    stopped: bool,
}

struct MediaFile {
    file: Option<File>,
    path: PathBuf,
    extension: &'static str,
    expected: u64,
    written: u64,
}

impl MediaFile {
    fn remove(&mut self) -> Result<(), String> {
        self.file.take();
        match fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(_) => Err(FAILED.to_string()),
        }
    }
}

impl Drop for MediaFile {
    fn drop(&mut self) {
        let _ = self.remove();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedMedia {
    path: String,
}

impl MediaWriter {
    fn initialize(&mut self, directory: &Path) -> Result<(), String> {
        // This directory contains only app-generated temporary files. Sweep crash leftovers.
        match fs::remove_dir_all(directory) {
            Ok(()) => (),
            Err(error) if error.kind() == ErrorKind::NotFound => (),
            Err(_) => return Err(FAILED.to_string()),
        }
        fs::create_dir_all(directory).map_err(|_| FAILED.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
                .map_err(|_| FAILED.to_string())?;
        }
        self.directory = Some(directory.to_path_buf());
        Ok(())
    }

    fn begin(&mut self, mime: &str, expected: u64) -> Result<String, String> {
        if self.stopped {
            return Err(INACTIVE.to_string());
        }
        if expected == 0 || expected > 9_007_199_254_740_991 {
            return Err(FAILED.to_string());
        }
        let extension = match mime {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            "image/gif" => "gif",
            "image/avif" => "avif",
            "video/mp4" => "mp4",
            "video/webm" => "webm",
            "video/quicktime" => "mov",
            _ => return Err(FAILED.to_string()),
        };
        let directory = self.directory.as_ref().ok_or(FAILED)?;
        for _ in 0..16 {
            let mut bytes = [0u8; 16];
            rand::rng().fill_bytes(&mut bytes);
            let handle = bytes
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            if self.transfers.contains_key(&handle) {
                continue;
            }
            let path = directory.join(format!("{handle}.part"));
            let mut options = OpenOptions::new();
            options.create_new(true).write(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let file = match options.open(&path) {
                Ok(file) => file,
                Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
                Err(_) => return Err(FAILED.to_string()),
            };
            self.transfers.insert(
                handle.clone(),
                MediaFile {
                    file: Some(file),
                    path,
                    extension,
                    expected,
                    written: 0,
                },
            );
            return Ok(handle);
        }
        Err(FAILED.to_string())
    }

    fn append(&mut self, handle: &str, bytes: &[u8]) -> Result<(), String> {
        let transfer = self.transfers.get_mut(handle).ok_or(INACTIVE)?;
        let result = if bytes.is_empty()
            || bytes.len() > CHUNK_BYTES
            || bytes.len() as u64 > transfer.expected.saturating_sub(transfer.written)
        {
            Err(FAILED.to_string())
        } else {
            transfer
                .file
                .as_mut()
                .ok_or(INACTIVE)?
                .write_all(bytes)
                .map_err(|_| FAILED.to_string())
        };
        if result.is_ok() {
            transfer.written += bytes.len() as u64;
        } else {
            let _ = self.release(handle);
        }
        result
    }

    fn finish(&mut self, handle: &str) -> Result<StagedMedia, String> {
        let result = (|| {
            let transfer = self.transfers.get_mut(handle).ok_or(INACTIVE)?;
            if transfer.expected != transfer.written {
                return Err(FAILED.to_string());
            }
            transfer
                .file
                .take()
                .ok_or(INACTIVE)?
                .sync_all()
                .map_err(|_| FAILED.to_string())?;
            let path = transfer.path.with_extension(transfer.extension);
            fs::rename(&transfer.path, &path).map_err(|_| FAILED.to_string())?;
            transfer.path = path;
            Ok(StagedMedia {
                path: transfer.path.to_str().ok_or(FAILED)?.to_string(),
            })
        })();
        if result.is_err() {
            let _ = self.release(handle);
        }
        result
    }

    fn release(&mut self, handle: &str) -> Result<(), String> {
        if let Some(transfer) = self.transfers.get_mut(handle) {
            transfer.remove()?;
            self.transfers.remove(handle);
        }
        Ok(())
    }

    fn stop(&mut self) -> Result<(), String> {
        self.stopped = true;
        let handles: Vec<_> = self.transfers.keys().cloned().collect();
        let mut result = Ok(());
        for handle in handles {
            if let Err(error) = self.release(&handle) {
                result = Err(error);
            }
        }
        result
    }
}

async fn with_writer<T: Send + 'static>(
    state: Arc<Mutex<MediaWriter>>,
    action: impl FnOnce(&mut MediaWriter) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut writer = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        action(&mut writer)
    })
    .await
    .map_err(|_| FAILED.to_string())?
}

pub fn initialize<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|_| FAILED.to_string())?
        .join("telegram-media");
    let state = app.state::<TelegramMediaState>().0.clone();
    let media_directory = directory.clone();
    tauri::async_runtime::block_on(with_writer(state, move |writer| {
        writer.initialize(&media_directory)
    }))?;
    app.asset_protocol_scope()
        .allow_directory(directory, false)
        .map_err(|_| FAILED.to_string())
}

#[tauri::command]
pub async fn telegram_media_begin<R: Runtime>(
    app: AppHandle<R>,
    mime: String,
    expected_bytes: u64,
) -> Result<String, String> {
    with_writer(app.state::<TelegramMediaState>().0.clone(), move |writer| {
        writer.begin(&mime, expected_bytes)
    })
    .await
}

#[tauri::command]
pub async fn telegram_media_append<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<(), String> {
    let handle = request
        .headers()
        .get("x-telegram-media-handle")
        .and_then(|value| value.to_str().ok())
        .filter(|handle| handle.len() == 32 && handle.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or(INACTIVE)?
        .to_string();
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) if !bytes.is_empty() && bytes.len() <= CHUNK_BYTES => {
            Some(bytes.clone())
        }
        _ => None,
    };
    with_writer(
        app.state::<TelegramMediaState>().0.clone(),
        move |writer| match bytes {
            Some(bytes) => writer.append(&handle, &bytes),
            None => {
                writer.release(&handle)?;
                Err(FAILED.to_string())
            }
        },
    )
    .await
}

#[tauri::command]
pub async fn telegram_media_finish<R: Runtime>(
    app: AppHandle<R>,
    handle: String,
) -> Result<StagedMedia, String> {
    with_writer(app.state::<TelegramMediaState>().0.clone(), move |writer| {
        writer.finish(&handle)
    })
    .await
}

#[tauri::command]
pub async fn telegram_media_release<R: Runtime>(
    app: AppHandle<R>,
    handle: String,
) -> Result<(), String> {
    with_writer(app.state::<TelegramMediaState>().0.clone(), move |writer| {
        writer.release(&handle)
    })
    .await
}

pub fn cleanup<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<TelegramMediaState>().0.clone();
    let _ = tauri::async_runtime::block_on(with_writer(state, |writer| writer.stop()));
}

#[cfg(test)]
mod tests {
    use super::*;
    fn writer() -> (MediaWriter, PathBuf) {
        let path =
            std::env::temp_dir().join(format!("clockalong-media-test-{}", rand::random::<u128>()));
        let mut writer = MediaWriter::default();
        writer.initialize(&path).unwrap();
        (writer, path)
    }
    #[test]
    fn completed_media_remains_until_release_and_never_accepts_an_arbitrary_path() {
        let (mut writer, directory) = writer();
        assert!(writer.begin("../../secret", 3).is_err());
        let handle = writer.begin("image/png", 3).unwrap();
        writer.append(&handle, b"abc").unwrap();
        let media = writer.finish(&handle).unwrap();
        assert_eq!(Path::new(&media.path).parent(), Some(directory.as_path()));
        assert_eq!(fs::read(&media.path).unwrap(), b"abc");
        assert!(writer.append(&handle, b"d").is_err());
        writer.release(&handle).unwrap();
        writer.release(&handle).unwrap();
        assert!(!Path::new(&media.path).exists());
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn failures_cancel_and_shutdown_remove_partial_and_completed_files() {
        let (mut writer, directory) = writer();
        let first = writer.begin("video/mp4", 3).unwrap();
        assert!(writer.finish(&first).is_err());
        let second = writer.begin("image/jpeg", 1).unwrap();
        assert!(writer.append(&second, b"ab").is_err());
        let third = writer.begin("image/png", 1).unwrap();
        writer.append(&third, b"a").unwrap();
        writer.finish(&third).unwrap();
        writer.begin("video/mp4", 2).unwrap();
        writer.stop().unwrap();
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
        assert!(writer.begin("image/png", 1).is_err());
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn startup_sweeps_crash_leftovers_and_io_errors_do_not_expose_paths() {
        let (mut writer, directory) = writer();
        fs::write(directory.join("old-file.png"), b"old").unwrap();
        writer.initialize(&directory).unwrap();
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
        let handle = writer.begin("image/png", 1).unwrap();
        let path = writer.transfers.get(&handle).unwrap().path.clone();
        writer.transfers.get_mut(&handle).unwrap().file = Some(File::open(path).unwrap());
        assert_eq!(writer.append(&handle, b"a").unwrap_err(), FAILED);
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
        fs::remove_dir_all(directory).unwrap();
    }
}
