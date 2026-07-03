use serde::Serialize;
use std::sync::Mutex;
use tauri::{async_runtime::JoinHandle, AppHandle, Emitter, Manager, Runtime};

use crate::{auth_clockify, auth_github, auth_linear};

pub const CLOCKALONG_AUTH_STATE_CHANGED_EVENT: &str = "clockalong-auth:state-changed";

pub struct ClockalongAuthState {
    snapshot: Mutex<ClockalongAuthSnapshot>,
    linear_refresh_lock: tokio::sync::Mutex<()>,
    linear_refresh_task: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockalongAuthSnapshot {
    pub(crate) linear_authenticated: bool,
    pub(crate) github_authenticated: bool,
    pub(crate) clockify_authenticated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockalongAuthConnectionResult {
    provider: &'static str,
    status: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockalongAuthDisconnectResult {
    provider: &'static str,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    revocation_status: Option<&'static str>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockalongClockifyCredentialSnapshot {
    api_key: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockalongLinearCredentialSnapshot {
    pub(crate) access_token: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockalongGithubCredentialSnapshot {
    pub(crate) access_token: Option<String>,
}

impl Default for ClockalongAuthState {
    fn default() -> Self {
        Self {
            snapshot: Mutex::new(ClockalongAuthSnapshot::default()),
            linear_refresh_lock: tokio::sync::Mutex::new(()),
            linear_refresh_task: Mutex::new(None),
        }
    }
}

impl ClockalongAuthState {
    pub fn set_snapshot<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        snapshot: ClockalongAuthSnapshot,
    ) -> Result<(), String> {
        *self
            .snapshot
            .lock()
            .map_err(|_| "Failed to update Clockalong auth state".to_string())? = snapshot;

        app.emit(CLOCKALONG_AUTH_STATE_CHANGED_EVENT, self.snapshot()?)
            .map_err(to_error_message)?;

        Ok(())
    }

    pub fn update_snapshot<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        update: impl FnOnce(&mut ClockalongAuthSnapshot),
    ) -> Result<(), String> {
        let next_snapshot = {
            let mut snapshot = self
                .snapshot
                .lock()
                .map_err(|_| "Failed to update Clockalong auth state".to_string())?;
            update(&mut snapshot);
            snapshot.clone()
        };

        app.emit(CLOCKALONG_AUTH_STATE_CHANGED_EVENT, next_snapshot)
            .map_err(to_error_message)?;

        Ok(())
    }

    pub(crate) fn snapshot(&self) -> Result<ClockalongAuthSnapshot, String> {
        self.snapshot
            .lock()
            .map_err(|_| "Failed to read Clockalong auth state".to_string())
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
    app.state::<ClockalongAuthState>().set_snapshot(
        &app,
        ClockalongAuthSnapshot {
            linear_authenticated: false,
            github_authenticated: false,
            clockify_authenticated,
        },
    )?;
    auth_log("initialize_auth_lifecycle: stored Clockify auth state loaded");
    initialize_optional_linear_auth_lifecycle(app.clone());
    initialize_optional_github_auth_lifecycle(app);

    Ok(())
}

#[tauri::command]
pub fn clockalong_auth_get_state(
    state: tauri::State<'_, ClockalongAuthState>,
) -> Result<ClockalongAuthSnapshot, String> {
    auth_log("clockalong_auth_get_state: snapshot requested");
    state.snapshot()
}

#[tauri::command]
pub async fn clockalong_auth_connect_clockify<R: Runtime>(
    app: AppHandle<R>,
    api_key: String,
) -> Result<ClockalongAuthConnectionResult, String> {
    auth_clockify::connect(app, api_key).await
}

#[tauri::command]
pub fn clockalong_auth_get_clockify_credential<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongClockifyCredentialSnapshot, String> {
    auth_clockify::credential_snapshot(app)
}

#[tauri::command]
pub fn clockalong_auth_disconnect_clockify<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongAuthDisconnectResult, String> {
    auth_clockify::disconnect(app)
}

#[tauri::command]
pub async fn clockalong_auth_connect_linear<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongAuthConnectionResult, String> {
    auth_linear::connect(app).await
}

#[tauri::command]
pub async fn clockalong_auth_get_linear_credential<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongLinearCredentialSnapshot, String> {
    auth_linear::credential_snapshot(app).await
}

#[tauri::command]
pub async fn clockalong_auth_refresh_linear_credential<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongLinearCredentialSnapshot, String> {
    auth_linear::refresh_credential(app).await
}

#[tauri::command]
pub async fn clockalong_auth_disconnect_linear<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongAuthDisconnectResult, String> {
    auth_linear::disconnect(app).await
}

#[tauri::command]
pub async fn clockalong_auth_connect_github<R: Runtime>(
    app: AppHandle<R>,
    access_token: String,
) -> Result<ClockalongAuthConnectionResult, String> {
    auth_github::connect(app, access_token).await
}

#[tauri::command]
pub fn clockalong_auth_get_github_credential<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongGithubCredentialSnapshot, String> {
    auth_github::credential_snapshot(app)
}

#[tauri::command]
pub fn clockalong_auth_disconnect_github<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongAuthDisconnectResult, String> {
    auth_github::disconnect(app)
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

fn initialize_optional_github_auth_lifecycle<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        auth_log("initialize_optional_github_auth_lifecycle: reading stored GitHub auth state");
        match auth_github::validate_stored(&app).await {
            Ok(github_authenticated) => {
                if let Err(error) = set_github_authenticated(&app, github_authenticated) {
                    auth_log(&format!(
                        "initialize_optional_github_auth_lifecycle: failed to update auth state: {error}"
                    ));
                    return;
                }

                auth_log(&format!(
                    "initialize_optional_github_auth_lifecycle: stored GitHub auth state loaded authenticated={github_authenticated}"
                ));
            }
            Err(error) => {
                auth_log(&format!(
                    "initialize_optional_github_auth_lifecycle: stored GitHub auth validation failed: {error}"
                ));
                if let Err(state_error) = set_github_authenticated(&app, false) {
                    auth_log(&format!(
                        "initialize_optional_github_auth_lifecycle: failed to mark GitHub disconnected: {state_error}"
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
    let state = app.state::<ClockalongAuthState>();
    state.update_snapshot(app, |snapshot| {
        snapshot.clockify_authenticated = clockify_authenticated;
    })
}

pub(crate) fn set_linear_authenticated<R: Runtime>(
    app: &AppHandle<R>,
    linear_authenticated: bool,
) -> Result<(), String> {
    let state = app.state::<ClockalongAuthState>();
    state.update_snapshot(app, |snapshot| {
        snapshot.linear_authenticated = linear_authenticated;
    })
}

pub(crate) fn set_github_authenticated<R: Runtime>(
    app: &AppHandle<R>,
    github_authenticated: bool,
) -> Result<(), String> {
    let state = app.state::<ClockalongAuthState>();
    state.update_snapshot(app, |snapshot| {
        snapshot.github_authenticated = github_authenticated;
    })
}

pub(crate) fn clockify_credential_snapshot(
    api_key: Option<String>,
) -> ClockalongClockifyCredentialSnapshot {
    ClockalongClockifyCredentialSnapshot { api_key }
}

pub(crate) fn linear_credential_snapshot(
    access_token: Option<String>,
) -> ClockalongLinearCredentialSnapshot {
    ClockalongLinearCredentialSnapshot { access_token }
}

pub(crate) fn github_credential_snapshot(
    access_token: Option<String>,
) -> ClockalongGithubCredentialSnapshot {
    ClockalongGithubCredentialSnapshot { access_token }
}

pub(crate) fn connection_result(provider: &'static str) -> ClockalongAuthConnectionResult {
    ClockalongAuthConnectionResult {
        provider,
        status: "connected",
    }
}

pub(crate) fn disconnect_result(
    provider: &'static str,
    revocation_status: Option<&'static str>,
) -> ClockalongAuthDisconnectResult {
    ClockalongAuthDisconnectResult {
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
