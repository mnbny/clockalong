use reqwest::StatusCode;
use std::fmt;
use tauri::{AppHandle, Manager, Runtime};

use crate::{
    auth::{
        auth_log, clockify_credential_snapshot, connection_result, disconnect_result,
        set_clockify_authenticated, ClinearAuthConnectionResult, ClinearAuthDisconnectResult,
        ClinearAuthState, ClinearClockifyCredentialSnapshot,
    },
    stronghold,
};

const CLOCKIFY_CURRENT_USER_URL: &str = "https://api.clockify.me/api/v1/user";
const CLOCKIFY_API_KEY_STRONGHOLD_KEY: &str = "clockifyApiKey";

pub async fn connect<R: Runtime>(
    app: AppHandle<R>,
    api_key: String,
) -> Result<ClinearAuthConnectionResult, String> {
    let api_key = api_key.trim().to_string();
    auth_log(&format!(
        "clinear_auth_connect_clockify: validation requested key_len={}",
        api_key.len()
    ));

    if api_key.is_empty() {
        return Err("Enter a Clockify API key.".to_string());
    }

    validate_api_key(&api_key)
        .await
        .map_err(|error| error.to_string())?;
    stronghold::write_string(&app, CLOCKIFY_API_KEY_STRONGHOLD_KEY, &api_key)?;
    set_clockify_authenticated(&app, true)?;

    Ok(connection_result("clockify"))
}

pub fn credential_snapshot<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearClockifyCredentialSnapshot, String> {
    auth_log("clinear_auth_get_clockify_credential: snapshot requested");
    let auth_snapshot = app.state::<ClinearAuthState>().snapshot()?;

    if !auth_snapshot.clockify_authenticated {
        return Ok(clockify_credential_snapshot(None));
    }

    let api_key = stronghold::read_string(&app, CLOCKIFY_API_KEY_STRONGHOLD_KEY)?
        .filter(|value| !value.trim().is_empty());

    if api_key.is_none() {
        set_clockify_authenticated(&app, false)?;
    }

    Ok(clockify_credential_snapshot(api_key))
}

pub fn disconnect<R: Runtime>(app: AppHandle<R>) -> Result<ClinearAuthDisconnectResult, String> {
    auth_log("clinear_auth_disconnect_clockify: disconnect requested");
    stronghold::remove_value(&app, CLOCKIFY_API_KEY_STRONGHOLD_KEY)?;
    set_clockify_authenticated(&app, false)?;

    Ok(disconnect_result("clockify", None))
}

pub async fn validate_stored<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let Some(api_key) = stronghold::read_string(app, CLOCKIFY_API_KEY_STRONGHOLD_KEY)?
        .filter(|value| !value.trim().is_empty())
    else {
        auth_log("validate_stored_clockify_api_key: no stored key");
        return Ok(false);
    };

    auth_log("validate_stored_clockify_api_key: validating stored key");

    match validate_api_key(&api_key).await {
        Ok(()) => {
            auth_log("validate_stored_clockify_api_key: stored key valid");
            Ok(true)
        }
        Err(error) if error.is_invalid_auth() => {
            auth_log(&format!(
                "validate_stored_clockify_api_key: invalid stored key, clearing credential: {error}"
            ));
            stronghold::remove_value(app, CLOCKIFY_API_KEY_STRONGHOLD_KEY)?;
            Ok(false)
        }
        Err(error) => {
            auth_log(&format!(
                "validate_stored_clockify_api_key: transient validation failure, keeping credential: {error}"
            ));
            Ok(false)
        }
    }
}

async fn validate_api_key(api_key: &str) -> Result<(), ClockifyValidationError> {
    let response = reqwest::Client::new()
        .get(CLOCKIFY_CURRENT_USER_URL)
        .header("X-Api-Key", api_key)
        .send()
        .await
        .map_err(|error| ClockifyValidationError::transient(error.to_string()))?;
    let status = response.status();

    auth_log(&format!(
        "validate_clockify_api_key: clockify response status={status}"
    ));

    if status.is_success() {
        return Ok(());
    }

    let message = read_clockify_error(response).await;

    if is_invalid_clockify_auth_status(status) {
        return Err(ClockifyValidationError::invalid_auth(message));
    }

    Err(ClockifyValidationError::transient(message))
}

async fn read_clockify_error(response: reqwest::Response) -> String {
    let status = response.status();
    match response.text().await {
        Ok(body) if !body.trim().is_empty() => {
            format!("Clockify returned {status}: {}", body.trim())
        }
        _ => format!("Clockify returned {status}"),
    }
}

fn is_invalid_clockify_auth_status(status: StatusCode) -> bool {
    matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN)
}

#[derive(Debug)]
enum ClockifyValidationErrorKind {
    InvalidAuth,
    Transient,
}

#[derive(Debug)]
struct ClockifyValidationError {
    kind: ClockifyValidationErrorKind,
    message: String,
}

impl ClockifyValidationError {
    fn invalid_auth(message: impl Into<String>) -> Self {
        Self {
            kind: ClockifyValidationErrorKind::InvalidAuth,
            message: message.into(),
        }
    }

    fn transient(message: impl Into<String>) -> Self {
        Self {
            kind: ClockifyValidationErrorKind::Transient,
            message: message.into(),
        }
    }

    fn is_invalid_auth(&self) -> bool {
        matches!(self.kind, ClockifyValidationErrorKind::InvalidAuth)
    }
}

impl fmt::Display for ClockifyValidationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}
