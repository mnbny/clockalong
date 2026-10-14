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
const MAX_SAFE_BYTES: u64 = 9_007_199_254_740_991;
const INVALID_HANDLE: &str = "This Telegram download is no longer active.";
const IO_ERROR: &str = "Could not save the Telegram download.";

#[derive(Default)]
pub struct TelegramDownloadState(Arc<Mutex<DownloadWriter>>);

#[derive(Default)]
struct DownloadWriter {
    transfers: HashMap<String, Transfer>,
    stopped: bool,
}

struct Transfer {
    file: Option<File>,
    partial: PathBuf,
    file_name: String,
    expected: u64,
    written: u64,
}

impl Transfer {
    fn cleanup(&mut self) -> Result<(), String> {
        self.file.take();
        match fs::remove_file(&self.partial) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(_) => Err("Could not remove the partial Telegram download.".to_string()),
        }
    }
}

impl Drop for Transfer {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedDownload {
    file_name: String,
}

// Remote names become a single ordinary basename, never a path or hidden file.
fn safe_file_name(name: &str) -> String {
    let mut safe = String::new();
    for character in name.chars() {
        let character = if character.is_control()
            || matches!(character, '/' | '\\' | ':' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        {
            '_'
        } else {
            character
        };
        // Leave room for a collision suffix below macOS's filename byte limit.
        if safe.len() + character.len_utf8() > 180 {
            break;
        }
        safe.push(character);
    }
    let safe = safe.trim().trim_matches('.').trim();
    if safe.is_empty() {
        "attachment".to_string()
    } else {
        safe.to_string()
    }
}

fn collision_name(name: &str, index: u32) -> String {
    if index == 0 {
        return name.to_string();
    }
    match name.rsplit_once('.') {
        Some((stem, extension)) if !extension.is_empty() => format!("{stem} ({index}).{extension}"),
        _ => format!("{name} ({index})"),
    }
}

impl DownloadWriter {
    fn begin(&mut self, directory: &Path, name: &str, expected: u64) -> Result<String, String> {
        if self.stopped {
            return Err(INVALID_HANDLE.to_string());
        }
        if expected > MAX_SAFE_BYTES {
            return Err("Invalid Telegram download size.".to_string());
        }
        let file_name = safe_file_name(name);
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
            let partial = directory.join(format!(".clockalong-{handle}.part"));
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let file = match options.open(&partial) {
                Ok(file) => file,
                Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
                Err(_) => return Err(IO_ERROR.to_string()),
            };
            self.transfers.insert(
                handle.clone(),
                Transfer {
                    file: Some(file),
                    partial,
                    file_name,
                    expected,
                    written: 0,
                },
            );
            return Ok(handle);
        }
        Err(IO_ERROR.to_string())
    }

    fn append(&mut self, handle: &str, bytes: &[u8]) -> Result<(), String> {
        let transfer = self.transfers.get_mut(handle).ok_or(INVALID_HANDLE)?;
        let result = if bytes.is_empty()
            || bytes.len() > CHUNK_BYTES
            || bytes.len() as u64 > transfer.expected.saturating_sub(transfer.written)
        {
            Err("Invalid Telegram download chunk.".to_string())
        } else {
            transfer
                .file
                .as_mut()
                .ok_or(INVALID_HANDLE)?
                .write_all(bytes)
                .map_err(|_| IO_ERROR.to_string())
        };
        if result.is_err() {
            let _ = self.cancel(handle);
        } else {
            transfer.written += bytes.len() as u64;
        }
        result
    }

    fn finish(&mut self, handle: &str) -> Result<SavedDownload, String> {
        // Taking ownership ensures every failure closes and removes the partial file.
        let mut transfer = self.transfers.remove(handle).ok_or(INVALID_HANDLE)?;
        if transfer.written != transfer.expected {
            return Err("The Telegram download is incomplete.".to_string());
        }
        transfer
            .file
            .take()
            .ok_or(INVALID_HANDLE)?
            .sync_all()
            .map_err(|_| IO_ERROR.to_string())?;
        let directory = transfer.partial.parent().ok_or(IO_ERROR)?;
        for index in 0..10_000 {
            let file_name = collision_name(&transfer.file_name, index);
            // A hard link publishes the completed inode atomically without replacing any
            // existing file, directory, or symlink. Both names are inside Downloads.
            match fs::hard_link(&transfer.partial, directory.join(&file_name)) {
                Ok(()) => return Ok(SavedDownload { file_name }),
                Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
                Err(_) => return Err(IO_ERROR.to_string()),
            }
        }
        Err("Could not choose a unique Telegram download name.".to_string())
    }

    fn cancel(&mut self, handle: &str) -> Result<(), String> {
        if let Some(transfer) = self.transfers.get_mut(handle) {
            // Keep a failed cleanup registered so a later cancel or shutdown can retry it.
            transfer.cleanup()?;
            self.transfers.remove(handle);
        }
        Ok(())
    }

    fn stop(&mut self) -> Result<(), String> {
        self.stopped = true;
        let handles: Vec<_> = self.transfers.keys().cloned().collect();
        let mut result = Ok(());
        for handle in handles {
            if let Err(error) = self.cancel(&handle) {
                result = Err(error);
            }
        }
        result
    }
}

async fn with_writer<T: Send + 'static>(
    state: Arc<Mutex<DownloadWriter>>,
    action: impl FnOnce(&mut DownloadWriter) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut writer = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        action(&mut writer)
    })
    .await
    .map_err(|_| IO_ERROR.to_string())?
}

#[tauri::command]
pub async fn telegram_download_begin<R: Runtime>(
    app: AppHandle<R>,
    file_name: String,
    expected_bytes: u64,
) -> Result<String, String> {
    let state = app.state::<TelegramDownloadState>().0.clone();
    with_writer(state, move |writer| {
        let directory = app
            .path()
            .download_dir()
            .map_err(|_| IO_ERROR.to_string())?;
        writer.begin(&directory, &file_name, expected_bytes)
    })
    .await
}

#[tauri::command]
pub async fn telegram_download_append<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<(), String> {
    let handle = request
        .headers()
        .get("x-telegram-download-handle")
        .and_then(|value| value.to_str().ok())
        .filter(|handle| handle.len() == 32 && handle.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or(INVALID_HANDLE)?
        .to_string();
    let state = app.state::<TelegramDownloadState>().0.clone();
    // Validate before cloning the IPC buffer; malformed requests also cancel the handle.
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) if !bytes.is_empty() && bytes.len() <= CHUNK_BYTES => {
            Some(bytes.clone())
        }
        _ => None,
    };
    with_writer(state, move |writer| match bytes {
        Some(bytes) => writer.append(&handle, &bytes),
        None => {
            writer.cancel(&handle)?;
            Err("Invalid Telegram download chunk.".to_string())
        }
    })
    .await
}

#[tauri::command]
pub async fn telegram_download_finish<R: Runtime>(
    app: AppHandle<R>,
    handle: String,
) -> Result<SavedDownload, String> {
    let state = app.state::<TelegramDownloadState>().0.clone();
    with_writer(state, move |writer| writer.finish(&handle)).await
}

#[tauri::command]
pub async fn telegram_download_cancel<R: Runtime>(
    app: AppHandle<R>,
    handle: String,
) -> Result<(), String> {
    let state = app.state::<TelegramDownloadState>().0.clone();
    with_writer(state, move |writer| writer.cancel(&handle)).await
}

pub fn cleanup<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<TelegramDownloadState>().0.clone();
    // Wait for blocking cleanup before normal app exit can terminate the worker pool.
    let _ = tauri::async_runtime::block_on(with_writer(state, |writer| writer.stop()));
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Directory(PathBuf);
    impl Directory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "clockalong-download-test-{}",
                rand::random::<u128>()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn names(&self) -> Vec<String> {
            fs::read_dir(&self.0)
                .unwrap()
                .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
                .collect()
        }
    }
    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn streams_then_publishes_only_complete_file() {
        let directory = Directory::new();
        let mut writer = DownloadWriter::default();
        let handle = writer.begin(&directory.0, "report.txt", 6).unwrap();
        assert_eq!(handle.len(), 32);
        assert!(!directory.0.join("report.txt").exists());
        writer.append(&handle, b"abc").unwrap();
        writer.append(&handle, b"def").unwrap();
        let saved = writer.finish(&handle).unwrap();
        assert_eq!(saved.file_name, "report.txt");
        assert_eq!(
            fs::read(directory.0.join(saved.file_name)).unwrap(),
            b"abcdef"
        );
        assert_eq!(directory.names(), vec!["report.txt"]);
        assert!(writer.finish(&handle).is_err());
        writer.cancel(&handle).unwrap();
        assert!(directory.0.join("report.txt").exists());
    }

    #[test]
    fn preserves_existing_files_and_handles_simultaneous_names() {
        let directory = Directory::new();
        fs::write(directory.0.join("report.txt"), b"existing").unwrap();
        let mut writer = DownloadWriter::default();
        let first = writer.begin(&directory.0, "report.txt", 1).unwrap();
        let second = writer.begin(&directory.0, "report.txt", 1).unwrap();
        writer.append(&first, b"a").unwrap();
        writer.append(&second, b"b").unwrap();
        assert_eq!(writer.finish(&first).unwrap().file_name, "report (1).txt");
        assert_eq!(writer.finish(&second).unwrap().file_name, "report (2).txt");
        assert_eq!(
            fs::read(directory.0.join("report.txt")).unwrap(),
            b"existing"
        );
    }

    #[test]
    fn filenames_cannot_escape_downloads_or_create_hidden_paths() {
        for name in [
            "../private.txt",
            "..\\private.txt",
            "/etc/passwd",
            ".hidden",
            "..",
            "\0\n/:",
            "report\u{202e}gpj.exe",
        ] {
            let directory = Directory::new();
            let mut writer = DownloadWriter::default();
            let handle = writer.begin(&directory.0, name, 0).unwrap();
            let saved = writer.finish(&handle).unwrap();
            assert!(!saved.file_name.starts_with('.'));
            assert!(!saved
                .file_name
                .contains(['/', '\\', ':', '\0', '\n', '\u{202e}']));
            assert_eq!(directory.names(), vec![saved.file_name]);
        }
        assert_eq!(safe_file_name(" ... "), "attachment");
        assert!(safe_file_name(&"é".repeat(300)).len() <= 180);
    }

    #[test]
    fn incomplete_overlong_and_oversized_chunks_remove_partial_files() {
        for kind in 0..4 {
            let directory = Directory::new();
            let mut writer = DownloadWriter::default();
            let handle = writer.begin(&directory.0, "report.txt", 2).unwrap();
            let result = match kind {
                0 => writer.finish(&handle).map(|_| ()),
                1 => writer.append(&handle, b"abc"),
                2 => writer.append(&handle, &vec![0; CHUNK_BYTES + 1]),
                _ => writer.append(&handle, b""),
            };
            assert!(result.is_err());
            assert!(directory.names().is_empty());
            assert!(!writer.transfers.contains_key(&handle));
        }
    }

    #[test]
    fn cancellation_and_exit_cleanup_prevent_late_writes_or_publication() {
        let directory = Directory::new();
        let mut writer = DownloadWriter::default();
        let first = writer.begin(&directory.0, "first", 1).unwrap();
        let second = writer.begin(&directory.0, "second", 1).unwrap();
        writer.append(&first, b"a").unwrap();
        writer.cancel(&first).unwrap();
        writer.cancel(&first).unwrap();
        assert!(writer.append(&first, b"a").is_err());
        assert!(writer.finish(&first).is_err());
        writer.stop().unwrap();
        assert!(writer.append(&second, b"b").is_err());
        assert!(writer.finish(&second).is_err());
        assert!(writer.begin(&directory.0, "third", 0).is_err());
        assert!(directory.names().is_empty());
    }

    #[test]
    fn cancel_racing_finish_never_publishes_partial_content() {
        let directory = Directory::new();
        let mut writer = DownloadWriter::default();
        let handle = writer.begin(&directory.0, "complete", 3).unwrap();
        writer.append(&handle, b"abc").unwrap();
        let writer = Arc::new(Mutex::new(writer));
        let finish_writer = writer.clone();
        let finish_handle = handle.clone();
        let finish =
            std::thread::spawn(move || finish_writer.lock().unwrap().finish(&finish_handle));
        let cancel_writer = writer.clone();
        let cancel = std::thread::spawn(move || cancel_writer.lock().unwrap().cancel(&handle));
        let saved = finish.join().unwrap();
        cancel.join().unwrap().unwrap();
        if saved.is_ok() {
            assert_eq!(fs::read(directory.0.join("complete")).unwrap(), b"abc");
            assert_eq!(directory.names(), vec!["complete"]);
        } else {
            assert!(directory.names().is_empty());
        }
        assert!(writer.lock().unwrap().transfers.is_empty());
    }

    #[test]
    fn write_failure_removes_partial_and_exposes_only_safe_error() {
        let directory = Directory::new();
        let mut writer = DownloadWriter::default();
        let handle = writer.begin(&directory.0, "secret-name", 1).unwrap();
        let partial = writer.transfers.get(&handle).unwrap().partial.clone();
        // A read-only descriptor deterministically fails write_all without depending on disk quotas.
        writer.transfers.get_mut(&handle).unwrap().file = Some(File::open(&partial).unwrap());
        assert_eq!(writer.append(&handle, b"a").unwrap_err(), IO_ERROR);
        assert!(directory.names().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn publication_does_not_follow_or_replace_an_existing_symlink() {
        use std::os::unix::{fs::symlink, fs::PermissionsExt};
        let directory = Directory::new();
        fs::write(directory.0.join("target"), b"existing").unwrap();
        symlink("target", directory.0.join("report.txt")).unwrap();
        let mut writer = DownloadWriter::default();
        let handle = writer.begin(&directory.0, "report.txt", 1).unwrap();
        let partial = &writer.transfers.get(&handle).unwrap().partial;
        assert_eq!(
            fs::metadata(partial).unwrap().permissions().mode() & 0o777,
            0o600
        );
        writer.append(&handle, b"a").unwrap();
        assert_eq!(writer.finish(&handle).unwrap().file_name, "report (1).txt");
        assert_eq!(fs::read(directory.0.join("target")).unwrap(), b"existing");
        assert!(fs::symlink_metadata(directory.0.join("report.txt"))
            .unwrap()
            .file_type()
            .is_symlink());
    }
}
