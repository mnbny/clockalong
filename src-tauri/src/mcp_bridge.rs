use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    fmt,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::oneshot;

pub const CLOCKALONG_MCP_COMMAND_EVENT: &str = "clockalong-mcp:command";
const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);

type CommandCompletion = Result<Value, String>;
type PendingCommands = HashMap<String, oneshot::Sender<CommandCompletion>>;

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

    #[allow(dead_code)]
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
        arguments: Value,
    ) -> Result<Value, McpBridgeError> {
        let request_id = format!(
            "mcp-{}",
            self.next_request_id.fetch_add(1, Ordering::Relaxed)
        );
        let (sender, receiver) = oneshot::channel();
        let pending_count = {
            let mut pending_commands = self.pending_commands.lock().map_err(|_| {
                McpBridgeError::Internal("Failed to register MCP command".to_string())
            })?;
            pending_commands.insert(request_id.clone(), sender);
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
            },
        )
        .map_err(|error| McpBridgeError::Internal(error.to_string()))?;

        let completion = tokio::time::timeout(COMMAND_TIMEOUT, receiver).await;
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

        if let Some(sender) = sender {
            let status = if completion.is_ok() { "ok" } else { "error" };
            let _ = sender.send(completion);
            log::info!("MCP command completed request_id={request_id} status={status}");
        }

        Ok(())
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
