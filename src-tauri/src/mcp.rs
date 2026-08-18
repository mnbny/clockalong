use crate::{mcp_bridge::McpBridgeState, mcp_http, storage_config};
use serde::Serialize;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_store::StoreExt;

pub const CLOCKALONG_MCP_STATE_CHANGED_EVENT: &str = "clockalong-mcp:state-changed";
const MCP_SERVER_ENABLED_KEY: &str = "mcpServerEnabled";

pub struct ClockalongMcpState {
    snapshot: Mutex<ClockalongMcpSnapshot>,
    operation_lock: tokio::sync::Mutex<()>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockalongMcpSnapshot {
    running: bool,
    port: Option<u16>,
    bridge_ready: bool,
    snapshot_captured_at: Option<String>,
    last_error: Option<String>,
}

impl Default for ClockalongMcpState {
    fn default() -> Self {
        Self {
            snapshot: Mutex::new(ClockalongMcpSnapshot::default()),
            operation_lock: tokio::sync::Mutex::new(()),
        }
    }
}

impl ClockalongMcpState {
    fn snapshot(&self) -> Result<ClockalongMcpSnapshot, String> {
        self.snapshot
            .lock()
            .map_err(|_| "Failed to read Clockalong MCP state".to_string())
            .map(|snapshot| snapshot.clone())
    }

    fn update_snapshot<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        update: impl FnOnce(&mut ClockalongMcpSnapshot),
    ) -> Result<ClockalongMcpSnapshot, String> {
        let next_snapshot = {
            let mut snapshot = self
                .snapshot
                .lock()
                .map_err(|_| "Failed to update Clockalong MCP state".to_string())?;
            update(&mut snapshot);
            snapshot.clone()
        };

        log_status("MCP state changed", &next_snapshot);
        app.emit(CLOCKALONG_MCP_STATE_CHANGED_EVENT, next_snapshot.clone())
            .map_err(|error| error.to_string())?;

        Ok(next_snapshot)
    }
}

pub async fn initialize<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let enabled = app
        .store(storage_config::STORAGE_PATH)
        .map_err(|error| error.to_string())?
        .get(MCP_SERVER_ENABLED_KEY)
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    log::info!("MCP startup setting enabled={enabled}");

    if enabled {
        set_enabled(&app, true, false).await?;
    }

    Ok(())
}

async fn set_enabled<R: Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
    persist: bool,
) -> Result<ClockalongMcpSnapshot, String> {
    let state = app.state::<ClockalongMcpState>();
    let _operation_guard = state.operation_lock.lock().await;

    if persist {
        let store = app
            .store(storage_config::STORAGE_PATH)
            .map_err(|error| error.to_string())?;
        store.set(MCP_SERVER_ENABLED_KEY, Value::Bool(enabled));
        store.save().map_err(|error| error.to_string())?;
    }

    if !enabled {
        let bridge_state = app.state::<McpBridgeState>();
        bridge_state
            .replace_listener(None, None, None)
            .map_err(|error| error.to_string())?;
        bridge_state
            .clear_snapshot()
            .map_err(|error| error.to_string())?;
        return state.update_snapshot(app, |snapshot| {
            snapshot.running = false;
            snapshot.port = None;
            snapshot.bridge_ready = false;
            snapshot.snapshot_captured_at = None;
            snapshot.last_error = None;
        });
    }

    if state.snapshot()?.running {
        return state.snapshot();
    }

    match mcp_http::start_listener(app.clone()) {
        Ok(listener) => {
            let port = listener.port;
            app.state::<McpBridgeState>()
                .replace_listener(Some(listener.shutdown_handle), Some(port), None)
                .map_err(|error| error.to_string())?;
            state.update_snapshot(app, |snapshot| {
                snapshot.running = true;
                snapshot.port = Some(port);
                snapshot.last_error = None;
            })
        }
        Err(error) => {
            app.state::<McpBridgeState>()
                .replace_listener(None, None, Some(error.clone()))
                .map_err(|state_error| state_error.to_string())?;
            state.update_snapshot(app, |snapshot| {
                snapshot.running = false;
                snapshot.port = None;
                snapshot.last_error = Some(error);
            })
        }
    }
}

pub fn stop<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    app.state::<McpBridgeState>()
        .stop_listener()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clockalong_mcp_get_state(
    state: tauri::State<'_, ClockalongMcpState>,
) -> Result<ClockalongMcpSnapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub async fn clockalong_mcp_set_enabled<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> Result<ClockalongMcpSnapshot, String> {
    set_enabled(&app, enabled, true).await
}

#[tauri::command]
pub fn clockalong_mcp_publish_snapshot<R: Runtime>(
    app: AppHandle<R>,
    captured_at: String,
    snapshot: Value,
) -> Result<(), String> {
    app.state::<McpBridgeState>()
        .publish_snapshot(captured_at.clone(), snapshot)
        .map_err(|error| error.to_string())?;
    app.state::<ClockalongMcpState>()
        .update_snapshot(&app, |status| {
            status.bridge_ready = true;
            status.snapshot_captured_at = Some(captured_at);
        })?;

    Ok(())
}

#[tauri::command]
pub fn clockalong_mcp_complete_command(
    state: tauri::State<'_, McpBridgeState>,
    request_id: String,
    result: Option<Value>,
    error: Option<String>,
) -> Result<(), String> {
    let completion = match (result, error) {
        (_, Some(error)) => Err(error),
        (Some(result), None) => Ok(result),
        (None, None) => return Err("MCP command completion was missing a result".to_string()),
    };
    state
        .complete_command(&request_id, completion)
        .map_err(|error| error.to_string())
}

fn log_status(message: &str, snapshot: &ClockalongMcpSnapshot) {
    log::info!(
        "{message} running={} port={:?} bridge_ready={} last_error={:?}",
        snapshot.running,
        snapshot.port,
        snapshot.bridge_ready,
        snapshot.last_error
    );
}
