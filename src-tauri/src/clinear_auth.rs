use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_store::StoreExt;

use crate::storage_config::{StorageKey, STORAGE_PATH};

pub const CLINEAR_AUTH_STATE_CHANGED_EVENT: &str = "clinear-auth:state-changed";

pub struct ClinearAuthState {
    snapshot: Mutex<ClinearAuthSnapshot>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinearAuthSnapshot {
    linear_authenticated: bool,
    clockify_authenticated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinearAuthStartResult {
    provider: &'static str,
    status: &'static str,
}

impl Default for ClinearAuthState {
    fn default() -> Self {
        Self {
            snapshot: Mutex::new(ClinearAuthSnapshot::default()),
        }
    }
}

impl ClinearAuthState {
    pub fn set_snapshot<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        snapshot: ClinearAuthSnapshot,
    ) -> Result<(), String> {
        *self
            .snapshot
            .lock()
            .map_err(|_| "Failed to update Clinear auth state".to_string())? = snapshot;

        app.emit(CLINEAR_AUTH_STATE_CHANGED_EVENT, self.snapshot()?)
            .map_err(|error| error.to_string())?;

        Ok(())
    }

    fn snapshot(&self) -> Result<ClinearAuthSnapshot, String> {
        self.snapshot
            .lock()
            .map_err(|_| "Failed to read Clinear auth state".to_string())
            .map(|snapshot| snapshot.clone())
    }
}

pub async fn initialize_auth_lifecycle<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    auth_log("initialize_auth_lifecycle: reading stored auth state");
    let snapshot = read_stored_auth_state(&app)?;
    app.state::<ClinearAuthState>()
        .set_snapshot(&app, snapshot)?;
    auth_log("initialize_auth_lifecycle: stored auth state loaded");

    Ok(())
}

#[tauri::command]
pub fn clinear_auth_get_state(
    state: tauri::State<'_, ClinearAuthState>,
) -> Result<ClinearAuthSnapshot, String> {
    auth_log("clinear_auth_get_state: snapshot requested");
    state.snapshot()
}

#[tauri::command]
pub fn clinear_auth_start_linear_authentication() -> ClinearAuthStartResult {
    auth_log("clinear_auth_start_linear_authentication: placeholder requested");
    ClinearAuthStartResult {
        provider: "linear",
        status: "notImplemented",
    }
}

#[tauri::command]
pub fn clinear_auth_start_clockify_authentication() -> ClinearAuthStartResult {
    auth_log("clinear_auth_start_clockify_authentication: placeholder requested");
    ClinearAuthStartResult {
        provider: "clockify",
        status: "notImplemented",
    }
}

fn read_stored_auth_state<R: Runtime>(app: &AppHandle<R>) -> Result<ClinearAuthSnapshot, String> {
    let store = app.store(STORAGE_PATH).map_err(to_error_message)?;

    Ok(ClinearAuthSnapshot {
        linear_authenticated: store
            .get(StorageKey::LinearAuthConnected.as_str())
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
        clockify_authenticated: store
            .get(StorageKey::ClockifyAuthConnected.as_str())
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
    })
}

fn to_error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn auth_log(message: &str) {
    log::info!("{message}");
}
