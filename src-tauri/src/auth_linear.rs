use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::Rng;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fmt,
    io::{ErrorKind, Read, Write},
    net::TcpListener,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::{
    auth::{
        auth_log, connection_result, disconnect_result, linear_credential_snapshot,
        set_linear_authenticated, to_error_message, ClockalongAuthConnectionResult,
        ClockalongAuthDisconnectResult, ClockalongAuthState, ClockalongLinearCredentialSnapshot,
    },
    stronghold,
};

const LINEAR_AUTHORIZE_URL: &str = "https://linear.app/oauth/authorize";
const LINEAR_CLIENT_ID: &str = "b1f808a5cc24f7bf5cae1df43b4d7cf7";
const LINEAR_REVOKE_URL: &str = "https://api.linear.app/oauth/revoke";
const LINEAR_TOKEN_URL: &str = "https://api.linear.app/oauth/token";
const LINEAR_CALLBACK_PORTS: [u16; 3] = [53682, 53683, 53684];
const LINEAR_SCOPE: &str = "read";
const LINEAR_ACCESS_TOKEN_REFRESH_SKEW_SECONDS: i64 = 300;
const LINEAR_CALLBACK_TIMEOUT_SECONDS: u64 = 180;
const LINEAR_REFRESH_RETRY_SECONDS: u64 = 300;
const LINEAR_REVOKE_TIMEOUT_SECONDS: u64 = 10;
const LINEAR_OAUTH_TOKENS_STRONGHOLD_KEY: &str = "linearOAuthTokens";

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

pub async fn connect<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongAuthConnectionResult, String> {
    auth_log("clockalong_auth_connect_linear: starting OAuth flow");
    let client_id = linear_client_id();
    let (redirect_uri, callback_config, listener) = open_linear_callback_listener()?;
    auth_log(&format!(
        "clockalong_auth_connect_linear: callback listener ready redirect_uri={redirect_uri}"
    ));

    let oauth_state = generate_oauth_token();
    let code_verifier = generate_oauth_token();
    let code_challenge = pkce_s256_challenge(&code_verifier);
    let authorize_url =
        build_linear_authorize_url(&client_id, &redirect_uri, &oauth_state, &code_challenge)?;

    app.opener()
        .open_url(authorize_url.as_str(), None::<&str>)
        .map_err(to_error_message)?;
    auth_log("clockalong_auth_connect_linear: opened system browser");

    let expected_state = oauth_state.clone();
    let expected_path = callback_config.path.clone();
    let callback = tauri::async_runtime::spawn_blocking(move || {
        receive_linear_oauth_callback(listener, &expected_path, &expected_state)
    })
    .await
    .map_err(to_error_message)??;
    auth_log("clockalong_auth_connect_linear: callback validated");

    auth_log("clockalong_auth_connect_linear: exchanging authorization code");
    let token_response = exchange_linear_authorization_code(
        &client_id,
        &redirect_uri,
        &code_verifier,
        &callback.code,
    )
    .await
    .map_err(|error| error.to_string())?;
    let expires_at = write_linear_tokens(&app, token_response)?;
    schedule_refresh(&app, expires_at)?;
    set_linear_authenticated(&app, true)?;
    auth_log("clockalong_auth_connect_linear: OAuth flow connected");

    Ok(connection_result("linear"))
}

pub async fn credential_snapshot<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongLinearCredentialSnapshot, String> {
    auth_log("clockalong_auth_get_linear_credential: token requested");

    match linear_access_token_snapshot(&app).await {
        Ok(snapshot) => {
            set_linear_authenticated(&app, snapshot.access_token.is_some())?;
            Ok(snapshot)
        }
        Err(error) if error.is_invalid_auth() => {
            auth_log(&format!(
                "clockalong_auth_get_linear_credential: invalid credentials, clearing: {error}"
            ));
            stronghold::remove_value(&app, LINEAR_OAUTH_TOKENS_STRONGHOLD_KEY)?;
            app.state::<ClockalongAuthState>()
                .abort_linear_refresh_task()?;
            set_linear_authenticated(&app, false)?;
            Err(error.to_string())
        }
        Err(error) => {
            auth_log(&format!(
                "clockalong_auth_get_linear_credential: token unavailable, keeping credentials: {error}"
            ));
            if let Err(schedule_error) = schedule_refresh_retry(&app) {
                auth_log(&format!(
                    "clockalong_auth_get_linear_credential: failed to schedule refresh retry: {schedule_error}"
                ));
            }
            set_linear_authenticated(&app, false)?;
            Err(error.to_string())
        }
    }
}

pub async fn refresh_credential<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongLinearCredentialSnapshot, String> {
    auth_log("clockalong_auth_refresh_linear_credential: refresh requested");

    match refresh_from_storage_and_schedule(app.clone()).await {
        Ok(snapshot) => Ok(snapshot),
        Err(error) if error.is_invalid_auth() => {
            auth_log(&format!(
                "clockalong_auth_refresh_linear_credential: invalid credentials, clearing: {error}"
            ));
            stronghold::remove_value(&app, LINEAR_OAUTH_TOKENS_STRONGHOLD_KEY)?;
            app.state::<ClockalongAuthState>()
                .abort_linear_refresh_task()?;
            set_linear_authenticated(&app, false)?;
            Err(error.to_string())
        }
        Err(error) => {
            auth_log(&format!(
                "clockalong_auth_refresh_linear_credential: refresh unavailable, keeping credentials: {error}"
            ));
            if let Err(schedule_error) = schedule_refresh_retry(&app) {
                auth_log(&format!(
                    "clockalong_auth_refresh_linear_credential: failed to schedule refresh retry: {schedule_error}"
                ));
            }
            set_linear_authenticated(&app, false)?;
            Err(error.to_string())
        }
    }
}

pub async fn disconnect<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongAuthDisconnectResult, String> {
    auth_log("clockalong_auth_disconnect_linear: disconnect requested");
    app.state::<ClockalongAuthState>()
        .abort_linear_refresh_task()?;
    let tokens = read_linear_tokens(&app)?;
    let revocation_status = match tokens.as_ref() {
        Some(tokens) => revoke_linear_access_token(tokens).await,
        None => {
            auth_log("clockalong_auth_disconnect_linear: no stored tokens to revoke");
            LinearRevocationStatus::Skipped
        }
    };

    stronghold::remove_value(&app, LINEAR_OAUTH_TOKENS_STRONGHOLD_KEY)?;
    set_linear_authenticated(&app, false)?;
    auth_log(&format!(
        "clockalong_auth_disconnect_linear: local disconnect complete revocation_status={}",
        revocation_status.as_str()
    ));

    Ok(disconnect_result(
        "linear",
        Some(revocation_status.as_str()),
    ))
}

pub async fn validate_stored<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let Some(tokens) = read_linear_tokens(app)? else {
        auth_log("validate_stored_linear_tokens: no stored tokens");
        return Ok(false);
    };

    if linear_tokens_are_fresh(&tokens) {
        auth_log("validate_stored_linear_tokens: stored access token is fresh");
        schedule_refresh(app, tokens.expires_at_epoch_seconds)?;
        return Ok(true);
    }

    auth_log("validate_stored_linear_tokens: refreshing stored tokens");

    match refresh_linear_tokens(&tokens.refresh_token).await {
        Ok(token_response) => {
            let expires_at = write_linear_tokens(app, token_response)?;
            schedule_refresh(app, expires_at)?;
            auth_log(&format!(
                "validate_stored_linear_tokens: refresh succeeded expires_at={expires_at}"
            ));
            Ok(true)
        }
        Err(error) if error.is_invalid_auth() => {
            auth_log(&format!(
                "validate_stored_linear_tokens: invalid stored tokens, clearing credential: {error}"
            ));
            stronghold::remove_value(app, LINEAR_OAUTH_TOKENS_STRONGHOLD_KEY)?;
            app.state::<ClockalongAuthState>()
                .abort_linear_refresh_task()?;
            Ok(false)
        }
        Err(error) => {
            auth_log(&format!(
                "validate_stored_linear_tokens: transient refresh failure, keeping credential: {error}"
            ));
            if let Err(schedule_error) = schedule_refresh_retry(app) {
                auth_log(&format!(
                    "validate_stored_linear_tokens: failed to schedule refresh retry: {schedule_error}"
                ));
            }
            Ok(false)
        }
    }
}

async fn linear_access_token_snapshot<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<ClockalongLinearCredentialSnapshot, LinearAuthError> {
    let Some(tokens) = read_linear_tokens(app).map_err(LinearAuthError::transient)? else {
        auth_log("linear_access_token_snapshot: no stored tokens");
        return Ok(linear_credential_snapshot(None));
    };

    if linear_tokens_are_fresh(&tokens) {
        auth_log("linear_access_token_snapshot: returning fresh stored access token");
        schedule_refresh(app, tokens.expires_at_epoch_seconds)
            .map_err(LinearAuthError::transient)?;
        return Ok(linear_credential_snapshot(Some(tokens.access_token)));
    }

    auth_log("linear_access_token_snapshot: refreshing expired access token");
    let token_response = refresh_linear_tokens(&tokens.refresh_token).await?;
    let access_token = token_response.access_token.clone();
    let expires_at =
        write_linear_tokens(app, token_response).map_err(LinearAuthError::transient)?;
    schedule_refresh(app, expires_at).map_err(LinearAuthError::transient)?;
    auth_log(&format!(
        "linear_access_token_snapshot: refreshed access token expires_at={expires_at}"
    ));

    Ok(linear_credential_snapshot(Some(access_token)))
}

fn linear_client_id() -> String {
    LINEAR_CLIENT_ID.to_string()
}

fn linear_redirect_uri_override() -> Option<String> {
    std::env::var("CLOCKALONG_LINEAR_REDIRECT_URI")
        .ok()
        .or_else(|| option_env!("CLOCKALONG_LINEAR_REDIRECT_URI").map(str::to_string))
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
        "Linear is connected. You can close this browser window and return to Clockalong."
    } else {
        "Linear could not be connected. Return to Clockalong and try again."
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

async fn revoke_linear_access_token(tokens: &LinearOAuthTokens) -> LinearRevocationStatus {
    if let Err(error) = revoke_linear_token(&tokens.access_token, "access_token").await {
        auth_log(&format!(
            "revoke_linear_access_token: access token revocation failed: {error}"
        ));
        return LinearRevocationStatus::Failed;
    }

    LinearRevocationStatus::Confirmed
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
) -> Result<i64, String> {
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
    let expires_at_epoch_seconds = now_epoch_seconds()? + token_response.expires_in;
    let tokens = LinearOAuthTokens {
        access_token: token_response.access_token,
        refresh_token,
        expires_at_epoch_seconds,
        scope: token_response.scope,
        token_type: token_response.token_type,
    };

    stronghold::write_json(app, LINEAR_OAUTH_TOKENS_STRONGHOLD_KEY, &tokens)?;
    Ok(expires_at_epoch_seconds)
}

fn read_linear_tokens<R: Runtime>(app: &AppHandle<R>) -> Result<Option<LinearOAuthTokens>, String> {
    let tokens = stronghold::read_json(app, LINEAR_OAUTH_TOKENS_STRONGHOLD_KEY)?;
    auth_log(&format!(
        "read_linear_tokens: present={}",
        if tokens.is_some() { "true" } else { "false" }
    ));

    Ok(tokens)
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

fn refresh_delay_seconds(expires_at_epoch_seconds: i64) -> u64 {
    let Ok(now) = now_epoch_seconds() else {
        auth_log("refresh_delay_seconds: could not read current time, scheduling immediately");
        return 0;
    };

    expires_at_epoch_seconds
        .saturating_sub(now.saturating_add(LINEAR_ACCESS_TOKEN_REFRESH_SKEW_SECONDS))
        .try_into()
        .unwrap_or(0)
}

fn schedule_refresh<R: Runtime>(
    app: &AppHandle<R>,
    expires_at_epoch_seconds: i64,
) -> Result<(), String> {
    let delay_seconds = refresh_delay_seconds(expires_at_epoch_seconds);
    auth_log(&format!(
        "schedule_linear_refresh: scheduling refresh delay_seconds={delay_seconds} expires_at={expires_at_epoch_seconds}"
    ));
    let task_app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        if delay_seconds > 0 {
            tokio::time::sleep(Duration::from_secs(delay_seconds)).await;
        }

        auth_log("schedule_linear_refresh: scheduled refresh fired");
        if let Err(error) = refresh_from_storage_and_schedule(task_app.clone()).await {
            auth_log(&format!(
                "schedule_linear_refresh: scheduled refresh failed: {error}"
            ));
            if error.is_invalid_auth() {
                auth_log(
                    "schedule_linear_refresh: refresh token is invalid, clearing auth storage",
                );
                let _ = stronghold::remove_value(&task_app, LINEAR_OAUTH_TOKENS_STRONGHOLD_KEY);
                let _ = set_linear_authenticated(&task_app, false);
                let _ = task_app
                    .state::<ClockalongAuthState>()
                    .abort_linear_refresh_task();
            } else {
                let _ = set_linear_authenticated(&task_app, false);
                let _ = schedule_refresh_retry(&task_app);
            }
        }
    });

    app.state::<ClockalongAuthState>()
        .replace_linear_refresh_task(Some(task))
}

fn schedule_refresh_retry<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    auth_log(&format!(
        "schedule_linear_refresh_retry: scheduling retry delay_seconds={LINEAR_REFRESH_RETRY_SECONDS}"
    ));
    let task_app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(LINEAR_REFRESH_RETRY_SECONDS)).await;

        auth_log("schedule_linear_refresh_retry: retry fired");
        if let Err(error) = refresh_from_storage_and_schedule(task_app.clone()).await {
            auth_log(&format!(
                "schedule_linear_refresh_retry: retry failed: {error}"
            ));
            if error.is_invalid_auth() {
                auth_log(
                    "schedule_linear_refresh_retry: refresh token is invalid, clearing auth storage",
                );
                let _ = stronghold::remove_value(&task_app, LINEAR_OAUTH_TOKENS_STRONGHOLD_KEY);
                let _ = set_linear_authenticated(&task_app, false);
                let _ = task_app
                    .state::<ClockalongAuthState>()
                    .abort_linear_refresh_task();
            } else {
                let _ = set_linear_authenticated(&task_app, false);
                let _ = schedule_refresh_retry(&task_app);
            }
        }
    });

    app.state::<ClockalongAuthState>()
        .replace_linear_refresh_task(Some(task))
}

async fn refresh_from_storage_and_schedule<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ClockalongLinearCredentialSnapshot, LinearAuthError> {
    auth_log("refresh_from_storage_and_schedule: start");
    let app_state = app.state::<ClockalongAuthState>();
    let _refresh_guard = app_state.linear_refresh_lock().lock().await;
    let tokens = read_linear_tokens(&app)
        .map_err(LinearAuthError::transient)?
        .ok_or_else(|| LinearAuthError::invalid_auth("Missing Linear OAuth tokens"))?;
    let token_response = refresh_linear_tokens(&tokens.refresh_token).await?;
    let access_token = token_response.access_token.clone();
    let expires_at =
        write_linear_tokens(&app, token_response).map_err(LinearAuthError::transient)?;

    auth_log(&format!(
        "refresh_from_storage_and_schedule: refresh succeeded expires_at={expires_at}"
    ));
    schedule_refresh(&app, expires_at).map_err(LinearAuthError::transient)?;
    set_linear_authenticated(&app, true).map_err(LinearAuthError::transient)?;

    Ok(linear_credential_snapshot(Some(access_token)))
}

fn now_epoch_seconds() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(to_error_message)?;

    Ok(duration.as_secs() as i64)
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
