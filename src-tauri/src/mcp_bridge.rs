use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    fmt,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::oneshot;

pub const CLOCKALONG_MCP_COMMAND_EVENT: &str = "clockalong-mcp:command";
const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
const REFRESH_TIMEOUT: Duration = Duration::from_secs(120);

type CommandCompletion = Result<Value, String>;
const TELEGRAM_FILE_LIMIT: u64 = 20 * 1024 * 1024;
struct PendingCommand {
    sender: oneshot::Sender<CommandCompletion>,
    attachment: Option<PathBuf>,
    expires: Instant,
}
type PendingCommands = HashMap<String, PendingCommand>;

#[derive(Clone)]
pub struct CachedMcpSnapshot {
    pub captured_at: String,
    pub value: Value,
}

pub struct McpBridgeState {
    snapshot: Mutex<Option<CachedMcpSnapshot>>,
    pending_commands: Mutex<PendingCommands>,
    listener_shutdown_handle: Mutex<Option<oneshot::Sender<()>>>,
    bound_port: Mutex<Option<u16>>,
    last_bind_error: Mutex<Option<String>>,
    next_request_id: AtomicU64,
}

#[derive(Debug)]
pub enum McpBridgeError {
    NotReady,
    Timeout { request_id: String, tool: String },
    Webview(String),
    Internal(String),
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpCommandEvent {
    request_id: String,
    tool: String,
    arguments: Value,
    deadline_at: u64,
}

impl Default for McpBridgeState {
    fn default() -> Self {
        Self {
            snapshot: Mutex::new(None),
            pending_commands: Mutex::new(HashMap::new()),
            listener_shutdown_handle: Mutex::new(None),
            bound_port: Mutex::new(None),
            last_bind_error: Mutex::new(None),
            next_request_id: AtomicU64::new(1),
        }
    }
}

impl fmt::Display for McpBridgeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotReady => write!(formatter, "MCP snapshot is not ready"),
            Self::Timeout { request_id, tool } => write!(
                formatter,
                "MCP command timed out request_id={request_id} tool={tool}"
            ),
            Self::Webview(message) | Self::Internal(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for McpBridgeError {}

impl McpBridgeState {
    pub fn publish_snapshot(
        &self,
        captured_at: String,
        value: Value,
    ) -> Result<(), McpBridgeError> {
        *self.snapshot.lock().map_err(|_| {
            McpBridgeError::Internal("Failed to publish MCP snapshot".to_string())
        })? = Some(CachedMcpSnapshot {
            captured_at: captured_at.clone(),
            value,
        });
        log::info!("MCP snapshot published captured_at={captured_at}");

        Ok(())
    }

    pub fn snapshot(&self) -> Result<CachedMcpSnapshot, McpBridgeError> {
        self.snapshot
            .lock()
            .map_err(|_| McpBridgeError::Internal("Failed to read MCP snapshot".to_string()))?
            .clone()
            .ok_or(McpBridgeError::NotReady)
    }

    pub fn clear_snapshot(&self) -> Result<(), McpBridgeError> {
        *self
            .snapshot
            .lock()
            .map_err(|_| McpBridgeError::Internal("Failed to clear MCP snapshot".to_string()))? =
            None;

        Ok(())
    }

    pub async fn dispatch_command<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        tool: String,
        mut arguments: Value,
    ) -> Result<Value, McpBridgeError> {
        let request_id = format!(
            "mcp-{}",
            self.next_request_id.fetch_add(1, Ordering::Relaxed)
        );
        let (sender, receiver) = oneshot::channel();
        let timeout = if matches!(tool.as_str(), "refresh" | "send_telegram_message") {
            REFRESH_TIMEOUT
        } else {
            COMMAND_TIMEOUT
        };
        let attachment = if tool == "send_telegram_message" {
            arguments.as_object_mut().and_then(|args| {
                args.remove("filePath")
                    .and_then(|path| path.as_str().map(PathBuf::from))
            })
        } else {
            None
        };
        if let Some(path) = &attachment {
            arguments["fileName"] = Value::String(
                path.file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("attachment")
                    .to_string(),
            );
        }
        let deadline_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
            + timeout.as_millis() as u64;
        let pending_count = {
            let mut pending_commands = self.pending_commands.lock().map_err(|_| {
                McpBridgeError::Internal("Failed to register MCP command".to_string())
            })?;
            pending_commands.insert(
                request_id.clone(),
                PendingCommand {
                    sender,
                    attachment,
                    expires: Instant::now() + timeout,
                },
            );
            pending_commands.len()
        };
        let pending_guard = PendingCommandGuard {
            state: self,
            request_id: request_id.clone(),
        };

        log::info!(
            "MCP command dispatched request_id={request_id} tool={tool} pending_count={pending_count}"
        );
        app.emit(
            CLOCKALONG_MCP_COMMAND_EVENT,
            McpCommandEvent {
                request_id: request_id.clone(),
                tool: tool.clone(),
                arguments,
                deadline_at,
            },
        )
        .map_err(|error| McpBridgeError::Internal(error.to_string()))?;

        let completion = tokio::time::timeout(timeout, receiver).await;
        drop(pending_guard);

        match completion {
            Ok(Ok(Ok(result))) => Ok(result),
            Ok(Ok(Err(message))) => Err(McpBridgeError::Webview(message)),
            Ok(Err(_)) => Err(McpBridgeError::Internal(
                "MCP command completion channel closed".to_string(),
            )),
            Err(_) => {
                log::warn!("MCP command timed out request_id={request_id} tool={tool}");
                Err(McpBridgeError::Timeout { request_id, tool })
            }
        }
    }

    pub fn complete_command(
        &self,
        request_id: &str,
        completion: CommandCompletion,
    ) -> Result<(), McpBridgeError> {
        let sender = self
            .pending_commands
            .lock()
            .map_err(|_| McpBridgeError::Internal("Failed to complete MCP command".to_string()))?
            .remove(request_id);

        if let Some(command) = sender {
            let status = if completion.is_ok() { "ok" } else { "error" };
            let _ = command.sender.send(completion);
            log::info!("MCP command completed request_id={request_id} status={status}");
        }

        Ok(())
    }

    pub fn take_telegram_attachment(&self, request_id: &str) -> Result<PathBuf, String> {
        self.pending_commands
            .lock()
            .map_err(|_| "Attachment is unavailable.".to_string())?
            .get_mut(request_id)
            .filter(|command| command.expires > Instant::now())
            .and_then(|command| command.attachment.take())
            .ok_or_else(|| "Attachment is unavailable or the request expired.".to_string())
    }

    pub fn replace_listener(
        &self,
        shutdown_handle: Option<oneshot::Sender<()>>,
        bound_port: Option<u16>,
        bind_error: Option<String>,
    ) -> Result<(), McpBridgeError> {
        let previous_handle = {
            let mut listener_shutdown_handle =
                self.listener_shutdown_handle.lock().map_err(|_| {
                    McpBridgeError::Internal("Failed to update MCP listener".to_string())
                })?;
            std::mem::replace(&mut *listener_shutdown_handle, shutdown_handle)
        };
        if let Some(previous_handle) = previous_handle {
            let _ = previous_handle.send(());
        }
        *self
            .bound_port
            .lock()
            .map_err(|_| McpBridgeError::Internal("Failed to update MCP port".to_string()))? =
            bound_port;
        *self.last_bind_error.lock().map_err(|_| {
            McpBridgeError::Internal("Failed to update MCP bind error".to_string())
        })? = bind_error;

        Ok(())
    }

    pub fn stop_listener(&self) -> Result<(), McpBridgeError> {
        let shutdown_handle = self
            .listener_shutdown_handle
            .lock()
            .map_err(|_| McpBridgeError::Internal("Failed to stop MCP listener".to_string()))?
            .take();
        if let Some(shutdown_handle) = shutdown_handle {
            let _ = shutdown_handle.send(());
        }
        *self
            .bound_port
            .lock()
            .map_err(|_| McpBridgeError::Internal("Failed to clear MCP port".to_string()))? = None;

        Ok(())
    }
}

pub fn read_telegram_attachment(path: &Path) -> Result<Vec<u8>, String> {
    let invalid = || "Choose a nonempty regular file of at most 20 MiB.".to_string();
    let unreadable = || "Could not read the attachment.".to_string();
    if !path.is_absolute() || !std::fs::metadata(path).map_err(|_| unreadable())?.is_file() {
        return Err(invalid());
    }
    let file = std::fs::File::open(path).map_err(|_| unreadable())?;
    let metadata = file.metadata().map_err(|_| unreadable())?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > TELEGRAM_FILE_LIMIT {
        return Err(invalid());
    }
    let mut bytes = Vec::new();
    file.take(TELEGRAM_FILE_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unreadable())?;
    if bytes.is_empty() || bytes.len() as u64 > TELEGRAM_FILE_LIMIT {
        return Err(invalid());
    }
    Ok(bytes)
}

struct PendingCommandGuard<'a> {
    state: &'a McpBridgeState,
    request_id: String,
}

impl Drop for PendingCommandGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut pending_commands) = self.state.pending_commands.lock() {
            pending_commands.remove(&self.request_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attachment_access_is_single_use_and_expires_with_its_request() {
        let state = McpBridgeState::default();
        let register = |id: &str, expires| {
            let (sender, _) = oneshot::channel();
            state.pending_commands.lock().unwrap().insert(
                id.to_string(),
                PendingCommand {
                    sender,
                    attachment: Some(PathBuf::from("/tmp/report.txt")),
                    expires,
                },
            );
        };
        register("active", Instant::now() + Duration::from_secs(30));
        assert!(state.take_telegram_attachment("unknown").is_err());
        assert_eq!(
            state.take_telegram_attachment("active").unwrap(),
            PathBuf::from("/tmp/report.txt")
        );
        assert!(state.take_telegram_attachment("active").is_err());
        register("expired", Instant::now() - Duration::from_secs(1));
        assert!(state.take_telegram_attachment("expired").is_err());
        register("finished", Instant::now() + Duration::from_secs(30));
        state.complete_command("finished", Ok(Value::Null)).unwrap();
        assert!(state.take_telegram_attachment("finished").is_err());
        register("dropped", Instant::now() + Duration::from_secs(30));
        drop(PendingCommandGuard {
            state: &state,
            request_id: "dropped".to_string(),
        });
        assert!(state.take_telegram_attachment("dropped").is_err());
    }

    #[test]
    fn attachment_reads_are_bounded_and_errors_do_not_include_paths() {
        let dir = std::env::temp_dir().join(format!("clockalong-mcp-{}", rand::random::<u64>()));
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("private-name.bin");
        std::fs::write(&path, [0, 255, 1]).unwrap();
        assert_eq!(read_telegram_attachment(&path).unwrap(), [0, 255, 1]);
        assert!(read_telegram_attachment(&dir).is_err());
        assert!(read_telegram_attachment(Path::new("relative.txt")).is_err());
        std::fs::write(&path, []).unwrap();
        assert!(read_telegram_attachment(&path).is_err());
        std::fs::File::create(&path)
            .unwrap()
            .set_len(TELEGRAM_FILE_LIMIT + 1)
            .unwrap();
        assert!(read_telegram_attachment(&path).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
        let error = read_telegram_attachment(&path).unwrap_err();
        assert!(!error.contains("private-name"));
    }
}
