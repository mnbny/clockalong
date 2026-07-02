use reqwest::StatusCode;
use std::fmt;
use tauri::{AppHandle, Manager, Runtime};

use crate::{
    auth::{
        auth_log, connection_result, disconnect_result, github_credential_snapshot,
        set_github_authenticated, ClockalongAuthConnectionResult, ClockalongAuthDisconnectResult,
        ClockalongAuthState, ClockalongGithubCredentialSnapshot,
    },
    stronghold,
};

const GITHUB_CURRENT_USER_URL: &str = "https://api.github.com/user";
const GITHUB_API_VERSION: &str = "2026-03-10";
const GITHUB_ACCESS_TOKEN_STRONGHOLD_KEY: &str = "githubAccessToken";

pub async fn connect<R: Runtime>(
    app: AppHandle<R>,
    access_token: String,
) -> Result<ClockalongAuthConnectionResult, String> {
    let access_token = access_token.trim().to_string();
    auth_log(&format!(
        "clockalong_auth_connect_github: validation requested token_len={}",
        access_token.len()
    ));

    if access_token.is_empty() {
        return Err("Enter a GitHub access token.".to_string());
    }

    validate_access_token(&access_token)
        .await
        .map_err(|error| error.to_string())?;
    stronghold::write_string(&app, GITHUB_ACCESS_TOKEN_STRONGHOLD_KEY, &access_token)?;
    set_github_authenticated(&app, true)?;

    Ok(connection_result("github"))
}

pub fn credential_snapshot<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongGithubCredentialSnapshot, String> {
    auth_log("clockalong_auth_get_github_credential: snapshot requested");
    let auth_snapshot = app.state::<ClockalongAuthState>().snapshot()?;

    if !auth_snapshot.github_authenticated {
        return Ok(github_credential_snapshot(None));
    }

    let access_token = stronghold::read_string(&app, GITHUB_ACCESS_TOKEN_STRONGHOLD_KEY)?
        .filter(|value| !value.trim().is_empty());

    if access_token.is_none() {
        set_github_authenticated(&app, false)?;
    }

    Ok(github_credential_snapshot(access_token))
}

pub fn disconnect<R: Runtime>(app: AppHandle<R>) -> Result<ClockalongAuthDisconnectResult, String> {
    auth_log("clockalong_auth_disconnect_github: disconnect requested");
    stronghold::remove_value(&app, GITHUB_ACCESS_TOKEN_STRONGHOLD_KEY)?;
    set_github_authenticated(&app, false)?;

    Ok(disconnect_result("github", None))
}

pub async fn validate_stored<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let Some(access_token) = stronghold::read_string(app, GITHUB_ACCESS_TOKEN_STRONGHOLD_KEY)?
        .filter(|value| !value.trim().is_empty())
    else {
        auth_log("validate_stored_github_access_token: no stored token");
        return Ok(false);
    };

    auth_log("validate_stored_github_access_token: validating stored token");

    match validate_access_token(&access_token).await {
        Ok(()) => {
            auth_log("validate_stored_github_access_token: stored token valid");
            Ok(true)
        }
        Err(error) if error.is_invalid_auth() => {
            auth_log(&format!(
                "validate_stored_github_access_token: invalid stored token, clearing credential: {error}"
            ));
            stronghold::remove_value(app, GITHUB_ACCESS_TOKEN_STRONGHOLD_KEY)?;
            Ok(false)
        }
        Err(error) => {
            auth_log(&format!(
                "validate_stored_github_access_token: transient validation failure, keeping credential: {error}"
            ));
            Ok(false)
        }
    }
}

async fn validate_access_token(access_token: &str) -> Result<(), GithubValidationError> {
    let response = reqwest::Client::new()
        .get(GITHUB_CURRENT_USER_URL)
        .bearer_auth(access_token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .header("User-Agent", "Clockalong")
        .send()
        .await
        .map_err(|error| GithubValidationError::transient(error.to_string()))?;
    let status = response.status();

    auth_log(&format!(
        "validate_github_access_token: github response status={status}"
    ));

    if status.is_success() {
        return Ok(());
    }

    let message = read_github_error(response).await;

    if is_invalid_github_auth_status(status) {
        return Err(GithubValidationError::invalid_auth(message));
    }

    Err(GithubValidationError::transient(message))
}

async fn read_github_error(response: reqwest::Response) -> String {
    let status = response.status();
    match response.text().await {
        Ok(body) if !body.trim().is_empty() => {
            format!("GitHub returned {status}: {}", body.trim())
        }
        _ => format!("GitHub returned {status}"),
    }
}

fn is_invalid_github_auth_status(status: StatusCode) -> bool {
    matches!(status, StatusCode::UNAUTHORIZED)
}

#[derive(Debug)]
enum GithubValidationErrorKind {
    InvalidAuth,
    Transient,
}

#[derive(Debug)]
struct GithubValidationError {
    kind: GithubValidationErrorKind,
    message: String,
}

impl GithubValidationError {
    fn invalid_auth(message: impl Into<String>) -> Self {
        Self {
            kind: GithubValidationErrorKind::InvalidAuth,
            message: message.into(),
        }
    }

    fn transient(message: impl Into<String>) -> Self {
        Self {
            kind: GithubValidationErrorKind::Transient,
            message: message.into(),
        }
    }

    fn is_invalid_auth(&self) -> bool {
        matches!(self.kind, GithubValidationErrorKind::InvalidAuth)
    }
}

impl fmt::Display for GithubValidationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}
