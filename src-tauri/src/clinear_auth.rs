use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fmt, fs,
    io::{ErrorKind, Read, Write},
    net::TcpListener,
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_stronghold::{kdf::KeyDerivation, stronghold::Stronghold};
use url::Url;

use crate::stronghold_config::{
    StrongholdKey, STRONGHOLD_CLIENT_NAME, STRONGHOLD_METADATA_KEY, STRONGHOLD_PASSWORD,
    STRONGHOLD_PATH, STRONGHOLD_SALT_FILE,
};

pub const CLINEAR_AUTH_STATE_CHANGED_EVENT: &str = "clinear-auth:state-changed";
const CLOCKIFY_CURRENT_USER_URL: &str = "https://api.clockify.me/api/v1/user";
const LINEAR_AUTHORIZE_URL: &str = "https://linear.app/oauth/authorize";
const LINEAR_CLIENT_ID: &str = "1ef17fb4bbef1626a5f1f838843e067c";
const LINEAR_REVOKE_URL: &str = "https://api.linear.app/oauth/revoke";
const LINEAR_TOKEN_URL: &str = "https://api.linear.app/oauth/token";
const LINEAR_CALLBACK_PORTS: [u16; 3] = [53682, 53683, 53684];
const LINEAR_SCOPE: &str = "read";
const LINEAR_ACCESS_TOKEN_REFRESH_SKEW_SECONDS: i64 = 300;
const LINEAR_CALLBACK_TIMEOUT_SECONDS: u64 = 180;
const LINEAR_REVOKE_TIMEOUT_SECONDS: u64 = 10;

pub struct ClinearAuthState {
    snapshot: Mutex<ClinearAuthSnapshot>,
    stronghold_lock: Mutex<()>,
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
    revocation_status: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinearClockifyApiKeySnapshot {
    clockify_api_key: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClinearLinearAccessTokenSnapshot {
    linear_access_token: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LinearOAuthTokens {
    access_token: String,
    refresh_token: String,
    expires_at_epoch_seconds: i64,
    scope: Option<serde_json::Value>,
    token_type: Option<String>,
}

#[derive(Deserialize)]
struct LinearTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
    scope: Option<serde_json::Value>,
    token_type: Option<String>,
}

#[derive(Deserialize)]
struct LinearOAuthErrorResponse {
    error: Option<String>,
    error_description: Option<String>,
}

struct LinearOAuthCallback {
    code: String,
}

impl Default for ClinearAuthState {
    fn default() -> Self {
        Self {
            snapshot: Mutex::new(ClinearAuthSnapshot::default()),
            stronghold_lock: Mutex::new(()),
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
    let snapshot = read_stored_auth_state(&app).await?;
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
pub async fn clinear_auth_connect_clockify_api_key<R: Runtime>(
    app: AppHandle<R>,
    api_key: String,
) -> Result<ClinearAuthConnectionResult, String> {
    let api_key = api_key.trim().to_string();
    auth_log(&format!(
        "clinear_auth_connect_clockify_api_key: validation requested key_len={}",
        api_key.len()
    ));

    if api_key.is_empty() {
        return Err("Enter a Clockify API key.".to_string());
    }

    validate_clockify_api_key(&api_key)
        .await
        .map_err(|error| error.to_string())?;
    write_stronghold_string(&app, StrongholdKey::ClockifyApiKey, &api_key)?;
    set_clockify_authenticated(&app, true)?;

    Ok(ClinearAuthConnectionResult {
        provider: "clockify",
        status: "connected",
    })
}

#[tauri::command]
pub fn clinear_auth_get_clockify_api_key<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearClockifyApiKeySnapshot, String> {
    auth_log("clinear_auth_get_clockify_api_key: snapshot requested");
    clockify_api_key_snapshot(&app)
}

#[tauri::command]
pub fn clinear_auth_clear_clockify_authentication<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), String> {
    auth_log("clinear_auth_clear_clockify_authentication: clear requested");
    remove_stronghold_value(&app, StrongholdKey::ClockifyApiKey)?;
    set_clockify_authenticated(&app, false)
}

#[tauri::command]
pub async fn clinear_auth_start_linear_authentication<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearAuthConnectionResult, String> {
    auth_log("clinear_auth_start_linear_authentication: starting OAuth flow");
    let client_id = linear_client_id();
    let (redirect_uri, callback_config, listener) = open_linear_callback_listener()?;
    auth_log(&format!(
        "clinear_auth_start_linear_authentication: callback listener ready redirect_uri={redirect_uri}"
    ));

    let oauth_state = generate_oauth_token();
    let code_verifier = generate_oauth_token();
    let code_challenge = pkce_s256_challenge(&code_verifier);
    let authorize_url =
        build_linear_authorize_url(&client_id, &redirect_uri, &oauth_state, &code_challenge)?;

    app.opener()
        .open_url(authorize_url.as_str(), None::<&str>)
        .map_err(to_error_message)?;
    auth_log("clinear_auth_start_linear_authentication: opened system browser");

    let expected_state = oauth_state.clone();
    let expected_path = callback_config.path.clone();
    let callback = tauri::async_runtime::spawn_blocking(move || {
        receive_linear_oauth_callback(listener, &expected_path, &expected_state)
    })
    .await
    .map_err(to_error_message)??;
    auth_log("clinear_auth_start_linear_authentication: callback validated");

    auth_log("clinear_auth_start_linear_authentication: exchanging authorization code");
    let token_response = exchange_linear_authorization_code(
        &client_id,
        &redirect_uri,
        &code_verifier,
        &callback.code,
    )
    .await
    .map_err(|error| error.to_string())?;
    write_linear_tokens(&app, token_response)?;
    set_linear_authenticated(&app, true)?;
    auth_log("clinear_auth_start_linear_authentication: OAuth flow connected");

    Ok(ClinearAuthConnectionResult {
        provider: "linear",
        status: "connected",
    })
}

#[tauri::command]
pub async fn clinear_auth_get_linear_access_token<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearLinearAccessTokenSnapshot, String> {
    auth_log("clinear_auth_get_linear_access_token: token requested");

    match linear_access_token_snapshot(&app).await {
        Ok(snapshot) => {
            set_linear_authenticated(&app, snapshot.linear_access_token.is_some())?;
            Ok(snapshot)
        }
        Err(error) if error.is_invalid_auth() => {
            auth_log(&format!(
                "clinear_auth_get_linear_access_token: invalid credentials, clearing: {error}"
            ));
            remove_stronghold_value(&app, StrongholdKey::LinearOAuthTokens)?;
            set_linear_authenticated(&app, false)?;
            Err(error.to_string())
        }
        Err(error) => {
            auth_log(&format!(
                "clinear_auth_get_linear_access_token: token unavailable, keeping credentials: {error}"
            ));
            set_linear_authenticated(&app, false)?;
            Err(error.to_string())
        }
    }
}

#[tauri::command]
pub async fn clinear_auth_disconnect_linear<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClinearAuthDisconnectResult, String> {
    auth_log("clinear_auth_disconnect_linear: disconnect requested");
    let tokens = read_linear_tokens(&app)?;
    let revocation_status = match tokens.as_ref() {
        Some(tokens) => revoke_linear_tokens(tokens).await,
        None => {
            auth_log("clinear_auth_disconnect_linear: no stored tokens to revoke");
            LinearRevocationStatus::Skipped
        }
    };

    remove_stronghold_value(&app, StrongholdKey::LinearOAuthTokens)?;
    set_linear_authenticated(&app, false)?;
    auth_log(&format!(
        "clinear_auth_disconnect_linear: local disconnect complete revocation_status={}",
        revocation_status.as_str()
    ));

    Ok(ClinearAuthDisconnectResult {
        provider: "linear",
        status: "disconnected",
        revocation_status: revocation_status.as_str(),
    })
}

#[tauri::command]
pub fn clinear_auth_start_clockify_authentication() -> ClinearAuthStartResult {
    auth_log("clinear_auth_start_clockify_authentication: placeholder requested");
    ClinearAuthStartResult {
        provider: "clockify",
        status: "notImplemented",
    }
}

async fn read_stored_auth_state<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<ClinearAuthSnapshot, String> {
    let linear_authenticated = validate_stored_linear_tokens(app).await?;
    let clockify_authenticated = validate_stored_clockify_api_key(app).await?;

    Ok(ClinearAuthSnapshot {
        linear_authenticated,
        clockify_authenticated,
    })
}

async fn validate_stored_linear_tokens<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let Some(tokens) = read_linear_tokens(app)? else {
        auth_log("validate_stored_linear_tokens: no stored tokens");
        return Ok(false);
    };

    if linear_tokens_are_fresh(&tokens) {
        auth_log("validate_stored_linear_tokens: stored access token is fresh");
        return Ok(true);
    }

    auth_log("validate_stored_linear_tokens: refreshing stored tokens");

    match refresh_linear_tokens(&tokens.refresh_token).await {
        Ok(token_response) => {
            write_linear_tokens(app, token_response)?;
            auth_log("validate_stored_linear_tokens: refresh succeeded");
            Ok(true)
        }
        Err(error) if error.is_invalid_auth() => {
            auth_log(&format!(
                "validate_stored_linear_tokens: invalid stored tokens, clearing credential: {error}"
            ));
            remove_stronghold_value(app, StrongholdKey::LinearOAuthTokens)?;
            Ok(false)
        }
        Err(error) => {
            auth_log(&format!(
                "validate_stored_linear_tokens: transient refresh failure, keeping credential: {error}"
            ));
            Ok(false)
        }
    }
}

async fn validate_stored_clockify_api_key<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let Some(api_key) = read_stronghold_string(app, StrongholdKey::ClockifyApiKey)?
        .filter(|value| !value.trim().is_empty())
    else {
        auth_log("validate_stored_clockify_api_key: no stored key");
        return Ok(false);
    };

    auth_log("validate_stored_clockify_api_key: validating stored key");

    match validate_clockify_api_key(&api_key).await {
        Ok(()) => {
            auth_log("validate_stored_clockify_api_key: stored key valid");
            Ok(true)
        }
        Err(error) if error.is_invalid_auth() => {
            auth_log(&format!(
                "validate_stored_clockify_api_key: invalid stored key, clearing credential: {error}"
            ));
            remove_stronghold_value(app, StrongholdKey::ClockifyApiKey)?;
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

async fn validate_clockify_api_key(api_key: &str) -> Result<(), ClockifyValidationError> {
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

fn set_clockify_authenticated<R: Runtime>(
    app: &AppHandle<R>,
    clockify_authenticated: bool,
) -> Result<(), String> {
    let state = app.state::<ClinearAuthState>();
    let mut snapshot = state.snapshot()?;
    snapshot.clockify_authenticated = clockify_authenticated;
    state.set_snapshot(app, snapshot)
}

fn set_linear_authenticated<R: Runtime>(
    app: &AppHandle<R>,
    linear_authenticated: bool,
) -> Result<(), String> {
    let state = app.state::<ClinearAuthState>();
    let mut snapshot = state.snapshot()?;
    snapshot.linear_authenticated = linear_authenticated;
    state.set_snapshot(app, snapshot)
}

async fn linear_access_token_snapshot<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<ClinearLinearAccessTokenSnapshot, LinearAuthError> {
    let Some(tokens) = read_linear_tokens(app).map_err(LinearAuthError::transient)? else {
        auth_log("linear_access_token_snapshot: no stored tokens");
        return Ok(ClinearLinearAccessTokenSnapshot {
            linear_access_token: None,
        });
    };

    if linear_tokens_are_fresh(&tokens) {
        auth_log("linear_access_token_snapshot: returning fresh stored access token");
        return Ok(ClinearLinearAccessTokenSnapshot {
            linear_access_token: Some(tokens.access_token),
        });
    }

    auth_log("linear_access_token_snapshot: refreshing expired access token");
    let token_response = refresh_linear_tokens(&tokens.refresh_token).await?;
    let access_token = token_response.access_token.clone();
    write_linear_tokens(app, token_response).map_err(LinearAuthError::transient)?;
    auth_log("linear_access_token_snapshot: refreshed access token");

    Ok(ClinearLinearAccessTokenSnapshot {
        linear_access_token: Some(access_token),
    })
}

fn linear_client_id() -> String {
    LINEAR_CLIENT_ID.to_string()
}

fn linear_redirect_uri_override() -> Option<String> {
    std::env::var("CLINEAR_LINEAR_REDIRECT_URI")
        .ok()
        .or_else(|| option_env!("CLINEAR_LINEAR_REDIRECT_URI").map(str::to_string))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn linear_redirect_uri_for_port(port: u16) -> String {
    format!("http://localhost:{port}/oauth/linear/callback")
}

fn linear_redirect_uri_candidates() -> Vec<String> {
    if let Some(redirect_uri) = linear_redirect_uri_override() {
        return vec![redirect_uri];
    }

    LINEAR_CALLBACK_PORTS
        .into_iter()
        .map(linear_redirect_uri_for_port)
        .collect()
}

fn open_linear_callback_listener() -> Result<(String, LinearCallbackConfig, TcpListener), String> {
    let mut errors = Vec::new();

    for redirect_uri in linear_redirect_uri_candidates() {
        let callback_config = LinearCallbackConfig::from_redirect_uri(&redirect_uri)?;
        auth_log(&format!(
            "open_linear_callback_listener: trying redirect_uri={redirect_uri}"
        ));

        match TcpListener::bind(callback_config.bind_address()) {
            Ok(listener) => {
                auth_log(&format!(
                    "open_linear_callback_listener: bound {}",
                    callback_config.bind_address()
                ));
                return Ok((redirect_uri, callback_config, listener));
            }
            Err(error) => {
                auth_log(&format!(
                    "open_linear_callback_listener: bind failed {}: {error}",
                    callback_config.bind_address()
                ));
                errors.push(format!("{}: {error}", callback_config.bind_address()));
            }
        }
    }

    Err(format!(
        "Could not start the Linear callback listener. Tried: {}",
        errors.join(", ")
    ))
}

struct LinearCallbackConfig {
    host: String,
    port: u16,
    path: String,
}

impl LinearCallbackConfig {
    fn from_redirect_uri(redirect_uri: &str) -> Result<Self, String> {
        let url = Url::parse(redirect_uri).map_err(to_error_message)?;

        if url.scheme() != "http" {
            return Err("Linear redirect URI must use an http localhost callback.".to_string());
        }

        let host = url
            .host_str()
            .ok_or_else(|| "Linear redirect URI is missing a host.".to_string())?
            .to_string();

        if !matches!(host.as_str(), "localhost" | "127.0.0.1") {
            return Err("Linear redirect URI must use localhost or 127.0.0.1.".to_string());
        }

        let port = url
            .port()
            .ok_or_else(|| "Linear redirect URI must include a fixed callback port.".to_string())?;

        Ok(Self {
            host,
            port,
            path: url.path().to_string(),
        })
    }

    fn bind_address(&self) -> String {
        let host = if self.host == "localhost" {
            "127.0.0.1"
        } else {
            self.host.as_str()
        };

        format!("{host}:{}", self.port)
    }
}

fn build_linear_authorize_url(
    client_id: &str,
    redirect_uri: &str,
    oauth_state: &str,
    code_challenge: &str,
) -> Result<Url, String> {
    let mut url = Url::parse(LINEAR_AUTHORIZE_URL).map_err(to_error_message)?;
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", LINEAR_SCOPE)
        .append_pair("state", oauth_state)
        .append_pair("actor", "user")
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256");

    Ok(url)
}

fn generate_oauth_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn pkce_s256_challenge(code_verifier: &str) -> String {
    let digest = Sha256::digest(code_verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn receive_linear_oauth_callback(
    listener: TcpListener,
    expected_path: &str,
    expected_state: &str,
) -> Result<LinearOAuthCallback, String> {
    listener.set_nonblocking(true).map_err(to_error_message)?;

    let started_at = Instant::now();
    let (mut stream, _) = loop {
        match listener.accept() {
            Ok(connection) => break connection,
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                if started_at.elapsed() >= Duration::from_secs(LINEAR_CALLBACK_TIMEOUT_SECONDS) {
                    return Err("Linear authentication timed out.".to_string());
                }

                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(error.to_string()),
        }
    };

    stream
        .set_read_timeout(Some(Duration::from_secs(LINEAR_CALLBACK_TIMEOUT_SECONDS)))
        .map_err(to_error_message)?;

    let callback_result =
        parse_linear_oauth_callback_request(&mut stream, expected_path, expected_state);
    auth_log(&format!(
        "receive_linear_oauth_callback: callback_result={}",
        if callback_result.is_ok() {
            "success"
        } else {
            "failure"
        }
    ));
    let response_written = match &callback_result {
        Ok(_) => write_linear_oauth_callback_response(&mut stream, true),
        Err(_) => write_linear_oauth_callback_response(&mut stream, false),
    };

    if let Err(error) = response_written {
        auth_log(&format!(
            "receive_linear_oauth_callback: could not write callback response: {error}"
        ));
    }

    callback_result
}

fn parse_linear_oauth_callback_request(
    stream: &mut std::net::TcpStream,
    expected_path: &str,
    expected_state: &str,
) -> Result<LinearOAuthCallback, String> {
    let mut request = Vec::new();
    let mut buffer = [0_u8; 1024];

    while !request.windows(4).any(|window| window == b"\r\n\r\n") {
        let bytes_read = stream.read(&mut buffer).map_err(to_error_message)?;

        if bytes_read == 0 {
            break;
        }

        request.extend_from_slice(&buffer[..bytes_read]);

        if request.len() > 8192 {
            return Err("Linear callback request was too large.".to_string());
        }
    }

    let request = std::str::from_utf8(&request).map_err(to_error_message)?;
    let request_line = request
        .lines()
        .next()
        .ok_or_else(|| "Linear callback request was empty.".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts
        .next()
        .ok_or_else(|| "Linear callback request was missing a method.".to_string())?;
    let target = parts
        .next()
        .ok_or_else(|| "Linear callback request was missing a target.".to_string())?;

    if method != "GET" {
        return Err("Linear callback request used an unsupported method.".to_string());
    }

    let callback_url =
        Url::parse(&format!("http://localhost{target}")).map_err(to_error_message)?;

    if callback_url.path() != expected_path {
        return Err("Linear callback path did not match the configured redirect URI.".to_string());
    }

    let mut code = None;
    let mut state = None;
    let mut oauth_error = None;
    let mut oauth_error_description = None;

    for (key, value) in callback_url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => oauth_error = Some(value.into_owned()),
            "error_description" => oauth_error_description = Some(value.into_owned()),
            _ => {}
        }
    }

    if state.as_deref() != Some(expected_state) {
        return Err("Linear callback state did not match.".to_string());
    }

    if let Some(error) = oauth_error {
        return Err(oauth_error_description.unwrap_or(error));
    }

    let code =
        code.ok_or_else(|| "Linear callback did not include an authorization code.".to_string())?;

    Ok(LinearOAuthCallback { code })
}

fn write_linear_oauth_callback_response(
    stream: &mut std::net::TcpStream,
    success: bool,
) -> Result<(), String> {
    let title = if success {
        "Linear connected"
    } else {
        "Linear connection failed"
    };
    let body = if success {
        "Linear is connected. You can close this browser window and return to Clinear."
    } else {
        "Linear could not be connected. Return to Clinear and try again."
    };
    let html = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{title}</title></head><body><main><h1>{title}</h1><p>{body}</p></main></body></html>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );

    stream
        .write_all(response.as_bytes())
        .map_err(to_error_message)
}

async fn exchange_linear_authorization_code(
    client_id: &str,
    redirect_uri: &str,
    code_verifier: &str,
    code: &str,
) -> Result<LinearTokenResponse, LinearAuthError> {
    let params = [
        ("grant_type", "authorization_code"),
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("code_verifier", code_verifier),
        ("code", code),
    ];

    send_linear_token_request(&params).await
}

async fn refresh_linear_tokens(
    refresh_token: &str,
) -> Result<LinearTokenResponse, LinearAuthError> {
    let client_id = linear_client_id();
    let params = [
        ("grant_type", "refresh_token"),
        ("client_id", client_id.as_str()),
        ("refresh_token", refresh_token),
    ];

    send_linear_token_request(&params).await
}

async fn send_linear_token_request(
    params: &[(&str, &str)],
) -> Result<LinearTokenResponse, LinearAuthError> {
    let grant_type = params
        .iter()
        .find_map(|(key, value)| (*key == "grant_type").then_some(*value))
        .unwrap_or("unknown");
    auth_log(&format!(
        "send_linear_token_request: posting token request grant_type={grant_type}"
    ));
    let response = reqwest::Client::new()
        .post(LINEAR_TOKEN_URL)
        .form(params)
        .send()
        .await
        .map_err(|error| LinearAuthError::transient(error.to_string()))?;

    parse_linear_token_response(response).await
}

async fn parse_linear_token_response(
    response: reqwest::Response,
) -> Result<LinearTokenResponse, LinearAuthError> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| LinearAuthError::transient(error.to_string()))?;

    auth_log(&format!(
        "parse_linear_token_response: linear response status={status}"
    ));

    if status.is_success() {
        return serde_json::from_str::<LinearTokenResponse>(&body)
            .map_err(|error| LinearAuthError::transient(error.to_string()));
    }

    let message = linear_oauth_error_message(status, &body);

    if is_invalid_linear_auth_status(status) {
        return Err(LinearAuthError::invalid_auth(message));
    }

    Err(LinearAuthError::transient(message))
}

fn linear_oauth_error_message(status: StatusCode, body: &str) -> String {
    if let Ok(error) = serde_json::from_str::<LinearOAuthErrorResponse>(body) {
        if let Some(description) = error
            .error_description
            .filter(|value| !value.trim().is_empty())
        {
            return description;
        }

        if let Some(error) = error.error.filter(|value| !value.trim().is_empty()) {
            return error;
        }
    }

    if body.trim().is_empty() {
        format!("Linear returned {status}")
    } else {
        format!("Linear returned {status}: {}", body.trim())
    }
}

fn is_invalid_linear_auth_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::BAD_REQUEST | StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
    )
}

async fn revoke_linear_tokens(tokens: &LinearOAuthTokens) -> LinearRevocationStatus {
    let mut revocation_status = LinearRevocationStatus::Confirmed;

    if let Err(error) = revoke_linear_token(&tokens.refresh_token, "refresh_token").await {
        auth_log(&format!(
            "revoke_linear_tokens: refresh token revocation failed: {error}"
        ));
        revocation_status = LinearRevocationStatus::Failed;
    }

    if let Err(error) = revoke_linear_token(&tokens.access_token, "access_token").await {
        auth_log(&format!(
            "revoke_linear_tokens: access token revocation failed: {error}"
        ));
        revocation_status = LinearRevocationStatus::Failed;
    }

    revocation_status
}

async fn revoke_linear_token(token: &str, token_type_hint: &str) -> Result<(), String> {
    auth_log(&format!(
        "revoke_linear_token: revoking token_type_hint={token_type_hint} token_len={}",
        token.len()
    ));
    let params = [("token", token), ("token_type_hint", token_type_hint)];
    let response = reqwest::Client::new()
        .post(LINEAR_REVOKE_URL)
        .timeout(Duration::from_secs(LINEAR_REVOKE_TIMEOUT_SECONDS))
        .form(&params)
        .send()
        .await
        .map_err(to_error_message)?;
    let status = response.status();

    auth_log(&format!(
        "revoke_linear_token: revoke response status={status} token_type_hint={token_type_hint}"
    ));

    if status.is_success() {
        return Ok(());
    }

    Err(format!("Linear returned {status}"))
}

fn write_linear_tokens<R: Runtime>(
    app: &AppHandle<R>,
    token_response: LinearTokenResponse,
) -> Result<(), String> {
    let access_token_len = token_response.access_token.len();
    let refresh_token_len = token_response
        .refresh_token
        .as_ref()
        .map(|token| token.len())
        .unwrap_or(0);
    auth_log(&format!(
        "write_linear_tokens: storing tokens access_len={access_token_len} refresh_len={refresh_token_len} expires_in={}",
        token_response.expires_in
    ));
    let refresh_token = token_response
        .refresh_token
        .ok_or_else(|| "Linear did not return a refresh token.".to_string())?;
    let tokens = LinearOAuthTokens {
        access_token: token_response.access_token,
        refresh_token,
        expires_at_epoch_seconds: now_epoch_seconds()? + token_response.expires_in,
        scope: token_response.scope,
        token_type: token_response.token_type,
    };

    with_stronghold_client(app, true, |client| {
        let value = serde_json::to_vec(&tokens).map_err(to_error_message)?;
        client
            .store()
            .insert(
                StrongholdKey::LinearOAuthTokens
                    .as_str()
                    .as_bytes()
                    .to_vec(),
                value,
                None,
            )
            .map(|_| ())
            .map_err(to_error_message)?;
        write_stronghold_metadata_to_client(client)
    })
}

fn read_linear_tokens<R: Runtime>(app: &AppHandle<R>) -> Result<Option<LinearOAuthTokens>, String> {
    with_stronghold_client(app, false, |client| {
        let Some(value) = client
            .store()
            .get(StrongholdKey::LinearOAuthTokens.as_str().as_bytes())
            .map_err(to_error_message)?
        else {
            auth_log("read_linear_tokens: present=false");
            return Ok(None);
        };

        let tokens =
            serde_json::from_slice::<LinearOAuthTokens>(&value).map_err(to_error_message)?;
        auth_log("read_linear_tokens: present=true");

        Ok(Some(tokens))
    })
}

fn linear_tokens_are_fresh(tokens: &LinearOAuthTokens) -> bool {
    match now_epoch_seconds() {
        Ok(now) => tokens.expires_at_epoch_seconds - LINEAR_ACCESS_TOKEN_REFRESH_SKEW_SECONDS > now,
        Err(error) => {
            auth_log(&format!(
                "linear_tokens_are_fresh: could not read current time: {error}"
            ));
            false
        }
    }
}

fn now_epoch_seconds() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(to_error_message)?;

    Ok(duration.as_secs() as i64)
}

fn clockify_api_key_snapshot<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<ClinearClockifyApiKeySnapshot, String> {
    let auth_snapshot = app.state::<ClinearAuthState>().snapshot()?;

    if !auth_snapshot.clockify_authenticated {
        return Ok(ClinearClockifyApiKeySnapshot {
            clockify_api_key: None,
        });
    }

    let clockify_api_key = read_stronghold_string(app, StrongholdKey::ClockifyApiKey)?
        .filter(|value| !value.trim().is_empty());

    if clockify_api_key.is_none() {
        set_clockify_authenticated(app, false)?;
    }

    Ok(ClinearClockifyApiKeySnapshot { clockify_api_key })
}

fn write_stronghold_string<R: Runtime>(
    app: &AppHandle<R>,
    key: StrongholdKey,
    value: &str,
) -> Result<(), String> {
    with_stronghold_client(app, true, |client| {
        write_stronghold_string_to_client(client, key, value)?;
        write_stronghold_metadata_to_client(client)
    })
}

fn write_stronghold_string_to_client(
    client: &iota_stronghold::Client,
    key: StrongholdKey,
    value: &str,
) -> Result<(), String> {
    auth_log(&format!(
        "write_stronghold_string_to_client: writing key={} value_len={}",
        key.as_str(),
        value.len()
    ));
    let value = serde_json::to_vec(value).map_err(to_error_message)?;

    client
        .store()
        .insert(key.as_str().as_bytes().to_vec(), value, None)
        .map(|_| ())
        .map_err(to_error_message)
}

fn read_stronghold_string<R: Runtime>(
    app: &AppHandle<R>,
    key: StrongholdKey,
) -> Result<Option<String>, String> {
    with_stronghold_client(app, false, |client| {
        let Some(value) = client
            .store()
            .get(key.as_str().as_bytes())
            .map_err(to_error_message)?
        else {
            auth_log(&format!(
                "read_stronghold_string: key={} present=false",
                key.as_str()
            ));
            return Ok(None);
        };

        let decoded = serde_json::from_slice::<String>(&value).map_err(to_error_message)?;
        auth_log(&format!(
            "read_stronghold_string: key={} present=true value_len={}",
            key.as_str(),
            decoded.len()
        ));

        Ok(Some(decoded))
    })
}

fn remove_stronghold_value<R: Runtime>(
    app: &AppHandle<R>,
    key: StrongholdKey,
) -> Result<(), String> {
    with_stronghold_client(app, true, |client| {
        remove_stronghold_value_from_client(client, key)?;
        write_stronghold_metadata_to_client(client)
    })
}

fn remove_stronghold_value_from_client(
    client: &iota_stronghold::Client,
    key: StrongholdKey,
) -> Result<(), String> {
    auth_log(&format!(
        "remove_stronghold_value_from_client: deleting key={}",
        key.as_str()
    ));

    client
        .store()
        .delete(key.as_str().as_bytes())
        .map(|_| ())
        .map_err(to_error_message)
}

fn write_stronghold_metadata_to_client(client: &iota_stronghold::Client) -> Result<(), String> {
    auth_log("write_stronghold_metadata_to_client: writing metadata");
    let mut metadata = serde_json::Map::new();
    metadata.insert(
        StrongholdKey::ClockifyApiKey.as_str().to_string(),
        serde_json::json!(1),
    );
    metadata.insert(
        StrongholdKey::LinearOAuthTokens.as_str().to_string(),
        serde_json::json!(1),
    );
    let value = serde_json::to_vec(&metadata).map_err(to_error_message)?;

    client
        .store()
        .insert(STRONGHOLD_METADATA_KEY.as_bytes().to_vec(), value, None)
        .map(|_| ())
        .map_err(to_error_message)
}

fn open_stronghold<R: Runtime>(app: &AppHandle<R>) -> Result<Stronghold, String> {
    auth_log("open_stronghold: opening snapshot");
    let app_data_dir = app.path().app_data_dir().map_err(to_error_message)?;
    let app_local_data_dir = app.path().app_local_data_dir().map_err(to_error_message)?;
    fs::create_dir_all(&app_data_dir).map_err(to_error_message)?;
    fs::create_dir_all(&app_local_data_dir).map_err(to_error_message)?;

    let snapshot_path = app_data_dir.join(STRONGHOLD_PATH);
    let salt_path = app_local_data_dir.join(STRONGHOLD_SALT_FILE);
    let password = KeyDerivation::argon2(STRONGHOLD_PASSWORD, &salt_path);

    Stronghold::new(snapshot_path, password).map_err(to_error_message)
}

fn with_stronghold_client<R: Runtime, T>(
    app: &AppHandle<R>,
    save: bool,
    operation: impl FnOnce(&iota_stronghold::Client) -> Result<T, String>,
) -> Result<T, String> {
    let state = app.state::<ClinearAuthState>();
    let _guard = state
        .stronghold_lock
        .lock()
        .map_err(|_| "Failed to lock Clinear Stronghold access".to_string())?;

    auth_log(&format!(
        "with_stronghold_client: opening locked stronghold session save={save}"
    ));
    let stronghold = open_stronghold(app)?;
    let client = load_or_create_stronghold_client(&stronghold)?;
    let result = operation(&client)?;

    if save {
        auth_log("with_stronghold_client: saving stronghold snapshot");
        stronghold.save().map_err(to_error_message)?;
    }

    Ok(result)
}

fn load_or_create_stronghold_client(
    stronghold: &Stronghold,
) -> Result<iota_stronghold::Client, String> {
    match stronghold.load_client(STRONGHOLD_CLIENT_NAME) {
        Ok(client) => {
            auth_log("load_or_create_stronghold_client: loaded existing client");
            Ok(client)
        }
        Err(error) => {
            auth_log(&format!(
                "load_or_create_stronghold_client: load failed, creating client: {error}"
            ));
            stronghold
                .create_client(STRONGHOLD_CLIENT_NAME)
                .map_err(to_error_message)
        }
    }
}

#[derive(Debug)]
enum LinearAuthErrorKind {
    InvalidAuth,
    Transient,
}

#[derive(Debug)]
struct LinearAuthError {
    kind: LinearAuthErrorKind,
    message: String,
}

impl LinearAuthError {
    fn invalid_auth(message: impl Into<String>) -> Self {
        Self {
            kind: LinearAuthErrorKind::InvalidAuth,
            message: message.into(),
        }
    }

    fn transient(message: impl Into<String>) -> Self {
        Self {
            kind: LinearAuthErrorKind::Transient,
            message: message.into(),
        }
    }

    fn is_invalid_auth(&self) -> bool {
        matches!(self.kind, LinearAuthErrorKind::InvalidAuth)
    }
}

impl fmt::Display for LinearAuthError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

enum LinearRevocationStatus {
    Confirmed,
    Failed,
    Skipped,
}

impl LinearRevocationStatus {
    const fn as_str(&self) -> &'static str {
        match self {
            Self::Confirmed => "confirmed",
            Self::Failed => "failed",
            Self::Skipped => "skipped",
        }
    }
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

fn to_error_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn auth_log(message: &str) {
    log::info!("{message}");
}
