use serde::Serialize;
use std::sync::Mutex;
use tauri::{async_runtime::JoinHandle, AppHandle, Emitter, Manager, Runtime};

use crate::{auth_clockify, auth_linear};

pub const CLINEAR_AUTH_STATE_CHANGED_EVENT: &str = "clinear-auth:state-changed";

pub struct ClinearAuthState {
    snapshot: Mutex<ClinearAuthSnapshot>,
    linear_refresh_lock: tokio::sync::Mutex<()>,
    linear_refresh_task: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinearAuthSnapshot {
    pub(crate) linear_authenticated: bool,
    pub(crate) clockify_authenticated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinearAuthConnectionResult {
    provider: &'static str,
    status: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinearAuthDisconnectResult {
    provider: &'static str,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    revocation_status: Option<&'static str>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinearClockifyCredentialSnapshot {
    api_key: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinearLinearCredentialSnapshot {
    pub(crate) access_token: Option<String>,
}

impl Default for ClinearAuthState {
    fn default() -> Self {
        Self {
            snapshot: Mutex::new(ClinearAuthSnapshot::default()),
            linear_refresh_lock: tokio::sync::Mutex::new(()),
            linear_refresh_task: Mutex::new(None),
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
            .map_err(to_error_message)?;

        Ok(())
    }

    pub(crate) fn snapshot(&self) -> Result<ClinearAuthSnapshot, String> {
        self.snapshot
            .lock()
            .map_err(|_| "Failed to read Clinear auth state".to_string())
            .map(|snapshot| snapshot.clone())
    }

    pub(crate) fn linear_refresh_lock(&self) -> &tokio::sync::Mutex<()> {
        &self.linear_refresh_lock
    }

    pub(crate) fn replace_linear_refresh_task(
        &self,
        task: Option<JoinHandle<()>>,
    ) -> Result<(), String> {
        auth_log(&format!(
            "replace_linear_refresh_task: replacing task has_new_task={}",
            task.is_some()
        ));
        let mut refresh_task = self
            .linear_refresh_task
            .lock()
            .map_err(|_| "Failed to update Linear refresh task".to_string())?;

        if let Some(existing_task) = refresh_task.take() {
            existing_task.abort();
        }

        *refresh_task = task;

        Ok(())
    }

    pub(crate) fn abort_linear_refresh_task(&self) -> Result<(), String> {
        auth_log("abort_linear_refresh_task: abort requested");
        self.replace_linear_refresh_task(None)
    }
}

pub async fn initialize_auth_lifecycle<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    auth_log("initialize_auth_lifecycle: reading stored Clockify auth state");
    let clockify_authenticated = auth_clockify::validate_stored(&app).await?;
    app.state::<ClinearAuthState>().set_snapshot(
        &app,
        ClinearAuthSnapshot {
            linear_authenticated: false,
            clockify_authenticated,
        },
    )?;
    auth_log("initialize_auth_lifecycle: stored Clockify auth state loaded");
    initialize_optional_linear_auth_lifecycle(app);

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
pub async fn clinear_auth_connect_clockify<R: Runtime>(
    app: AppHandle<R>,
    api_key: String,
) -> Result<ClinearAuthConnectionResult, String> {
    auth_clockify::connect(app, api_key).await
}

#[tauri::command]
pub fn clinear_auth_get_clockify_credential<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearClockifyCredentialSnapshot, String> {
    auth_clockify::credential_snapshot(app)
}

#[tauri::command]
pub fn clinear_auth_disconnect_clockify<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearAuthDisconnectResult, String> {
    auth_clockify::disconnect(app)
}

#[tauri::command]
pub async fn clinear_auth_connect_linear<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearAuthConnectionResult, String> {
    auth_linear::connect(app).await
}

#[tauri::command]
pub async fn clinear_auth_get_linear_credential<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearLinearCredentialSnapshot, String> {
    auth_linear::credential_snapshot(app).await
}

#[tauri::command]
pub async fn clinear_auth_refresh_linear_credential<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearLinearCredentialSnapshot, String> {
    auth_linear::refresh_credential(app).await
}

#[tauri::command]
pub async fn clinear_auth_disconnect_linear<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearAuthDisconnectResult, String> {
    auth_linear::disconnect(app).await
}

fn initialize_optional_linear_auth_lifecycle<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        auth_log("initialize_optional_linear_auth_lifecycle: reading stored Linear auth state");
        match auth_linear::validate_stored(&app).await {
            Ok(linear_authenticated) => {
                if let Err(error) = set_linear_authenticated(&app, linear_authenticated) {
                    auth_log(&format!(
                        "initialize_optional_linear_auth_lifecycle: failed to update auth state: {error}"
                    ));
                    return;
                }

                auth_log(&format!(
                    "initialize_optional_linear_auth_lifecycle: stored Linear auth state loaded authenticated={linear_authenticated}"
                ));
            }
            Err(error) => {
                auth_log(&format!(
                    "initialize_optional_linear_auth_lifecycle: stored Linear auth validation failed: {error}"
                ));
                if let Err(state_error) = set_linear_authenticated(&app, false) {
                    auth_log(&format!(
                        "initialize_optional_linear_auth_lifecycle: failed to mark Linear disconnected: {state_error}"
                    ));
                }
            }
        }
    });
}

pub(crate) fn set_clockify_authenticated<R: Runtime>(
    app: &AppHandle<R>,
    clockify_authenticated: bool,
) -> Result<(), String> {
    let state = app.state::<ClinearAuthState>();
    let mut snapshot = state.snapshot()?;
    snapshot.clockify_authenticated = clockify_authenticated;
    state.set_snapshot(app, snapshot)
}

pub(crate) fn set_linear_authenticated<R: Runtime>(
    app: &AppHandle<R>,
    linear_authenticated: bool,
) -> Result<(), String> {
    let state = app.state::<ClinearAuthState>();
    let mut snapshot = state.snapshot()?;
    snapshot.linear_authenticated = linear_authenticated;
    state.set_snapshot(app, snapshot)
}

pub(crate) fn clockify_credential_snapshot(
    api_key: Option<String>,
) -> ClinearClockifyCredentialSnapshot {
    ClinearClockifyCredentialSnapshot { api_key }
}

pub(crate) fn linear_credential_snapshot(
    access_token: Option<String>,
) -> ClinearLinearCredentialSnapshot {
    ClinearLinearCredentialSnapshot { access_token }
}

pub(crate) fn connection_result(provider: &'static str) -> ClinearAuthConnectionResult {
    ClinearAuthConnectionResult {
        provider,
        status: "connected",
    }
}

pub(crate) fn disconnect_result(
    provider: &'static str,
    revocation_status: Option<&'static str>,
) -> ClinearAuthDisconnectResult {
    ClinearAuthDisconnectResult {
        provider,
        status: "disconnected",
        revocation_status,
    }
}

pub(crate) fn to_error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

pub(crate) fn auth_log(message: &str) {
    log::info!("{message}");
}
