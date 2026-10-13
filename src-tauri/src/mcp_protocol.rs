use crate::mcp_bridge::{CachedMcpSnapshot, McpBridgeError, McpBridgeState};
use serde_json::{json, Map, Value};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Runtime};

const CURRENT_PROTOCOL_VERSION: &str = "2025-06-18";
const PREVIOUS_PROTOCOL_VERSION: &str = "2025-03-26";
const SERVER_INSTRUCTIONS: &str = "Clockalong tracks time in Clockify against Linear tickets, GitHub issues and pull requests, and local Quick Timer presets. Call `list_trackable_work` to sync all connected providers and see what can be tracked; pass refresh: false for cached results. Use `refresh` to sync without listing work, including before reading tracking status or recent entries. Use `start_timer` to begin billing against a listed item and `stop_timer` to end it. Clockify runs one timer at a time, so starting a new timer stops the one already running. Use `add_time_entry` to add completed time in minutes for a listed item without changing the running timer. Overlaps are allowed.";
const STARTUP_ERROR: &str = "Clockalong is still starting up. Try again in a moment.";
const TIMEOUT_ERROR: &str = "Clockalong did not respond in time.";
const CLOCKIFY_ERROR: &str =
    "Clockify is not connected. Connect it in Clockalong before tracking time.";
const PROJECT_ERROR: &str =
    "No Clockify project is selected. Choose a default project in Clockalong settings.";
const TARGET_ERROR: &str =
    "No trackable work item matches that id. Call list_trackable_work first.";
const STOP_ERROR: &str = "No Clockify timer is running.";

pub enum McpProtocolReply {
    Json(Value),
    Accepted,
}

pub async fn handle_message<R: Runtime>(
    app: &AppHandle<R>,
    state: &McpBridgeState,
    body: &str,
) -> McpProtocolReply {
    let request = match serde_json::from_str::<Value>(body) {
        Ok(request) => request,
        Err(_) => {
            return McpProtocolReply::Json(error_response(Value::Null, -32700, "Parse error"))
        }
    };
    let Some(request_object) = request.as_object() else {
        return McpProtocolReply::Json(error_response(Value::Null, -32600, "Invalid Request"));
    };
    let Some(id) = request_object.get("id").cloned() else {
        return McpProtocolReply::Accepted;
    };
    if !id.is_string() && !id.is_number()
        || request_object.get("jsonrpc").and_then(Value::as_str) != Some("2.0")
        || !request_object.get("method").is_some_and(Value::is_string)
    {
        return McpProtocolReply::Json(error_response(Value::Null, -32600, "Invalid Request"));
    }

    let method = request_object
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let params = request_object
        .get("params")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let result = match method {
        "initialize" => initialize(&params),
        "notifications/initialized" | "ping" => validate_request_params(&params).map(|_| json!({})),
        "tools/list" => validate_list_tools(&params).map(|()| json!({ "tools": tool_catalog() })),
        "tools/call" => call_tool(app, state, &params).await,
        _ => {
            return McpProtocolReply::Json(error_response(id, -32601, "Method not found"));
        }
    };

    McpProtocolReply::Json(match result {
        Ok(result) => success_response(id, result),
        Err(error) => error_response(id, error.code, error.message),
    })
}

#[derive(Debug)]
struct ProtocolError {
    code: i64,
    message: &'static str,
}

fn initialize(params: &Value) -> Result<Value, ProtocolError> {
    let params = validate_request_params(params)?;
    let requested_version = params
        .get("protocolVersion")
        .and_then(Value::as_str)
        .ok_or(invalid_params())?;
    params
        .get("capabilities")
        .and_then(Value::as_object)
        .ok_or(invalid_params())?;
    let client_info = params
        .get("clientInfo")
        .and_then(Value::as_object)
        .ok_or(invalid_params())?;
    required_string(client_info, "name")?;
    required_string(client_info, "version")?;
    if client_info
        .get("title")
        .is_some_and(|title| !title.is_string())
    {
        return Err(invalid_params());
    }
    let protocol_version = match requested_version {
        CURRENT_PROTOCOL_VERSION => CURRENT_PROTOCOL_VERSION,
        PREVIOUS_PROTOCOL_VERSION => PREVIOUS_PROTOCOL_VERSION,
        _ => CURRENT_PROTOCOL_VERSION,
    };

    Ok(json!({
        "protocolVersion": protocol_version,
        "capabilities": { "tools": {} },
        "serverInfo": {
            "name": "clockalong",
            "title": "Clockalong",
            "version": app_version(),
        },
        "instructions": SERVER_INSTRUCTIONS,
    }))
}

async fn call_tool<R: Runtime>(
    app: &AppHandle<R>,
    state: &McpBridgeState,
    params: &Value,
) -> Result<Value, ProtocolError> {
    let (name, arguments) = validate_call_tool(params)?;

    let output = match name {
        "list_trackable_work" => {
            let arguments = validate_list_trackable_work(&arguments)?;
            list_work_with_refresh(state, arguments, || refresh_tool(app, state)).await
        }
        "refresh" => {
            validate_empty_arguments(&arguments)?;
            refresh_tool(app, state).await
        }
        "start_timer" => {
            validate_start_timer(&arguments)?;
            write_tool(app, state, name, arguments).await
        }
        "add_time_entry" => {
            validate_add_time_entry(&arguments)?;
            write_tool(app, state, name, arguments).await
        }
        "stop_timer" => {
            validate_empty_arguments(&arguments)?;
            write_tool(app, state, name, arguments).await
        }
        "get_tracking_status" => {
            validate_empty_arguments(&arguments)?;
            read_tool(state, tracking_status)
        }
        "list_recent_entries" => {
            let arguments = validate_list_recent_entries(&arguments)?;
            read_tool(state, |snapshot| list_recent_entries(snapshot, arguments))
        }
        "list_clockify_projects" => {
            let query = validate_list_clockify_projects(&arguments)?;
            read_tool(state, |snapshot| list_clockify_projects(snapshot, query))
        }
        _ => return Err(invalid_params()),
    };

    Ok(match output {
        Ok(output) => tool_success(output),
        Err(message) => tool_error(&message),
    })
}

fn read_tool(
    state: &McpBridgeState,
    read: impl FnOnce(&CachedMcpSnapshot) -> Result<Value, String>,
) -> Result<Value, String> {
    let snapshot = state.snapshot().map_err(bridge_error_message)?;
    read(&snapshot)
}

async fn refresh_tool<R: Runtime>(
    app: &AppHandle<R>,
    state: &McpBridgeState,
) -> Result<Value, String> {
    // A published snapshot means the webview command listener is ready.
    state.snapshot().map_err(bridge_error_message)?;
    state
        .dispatch_command(app, "refresh".to_string(), json!({}))
        .await
        .map_err(bridge_error_message)
}

async fn list_work_with_refresh<F, Fut>(
    state: &McpBridgeState,
    arguments: ListTrackableWorkArguments,
    refresh: F,
) -> Result<Value, String>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<Value, String>>,
{
    if arguments.refresh {
        refresh().await?;
    }
    read_tool(state, |snapshot| list_trackable_work(snapshot, arguments))
}

async fn write_tool<R: Runtime>(
    app: &AppHandle<R>,
    state: &McpBridgeState,
    name: &str,
    arguments: Value,
) -> Result<Value, String> {
    let snapshot = state.snapshot().map_err(bridge_error_message)?;
    let status = tracking_status(&snapshot)?;
    if status.get("clockifyConnected").and_then(Value::as_bool) != Some(true) {
        return Err(CLOCKIFY_ERROR.to_string());
    }
    if name != "stop_timer" {
        if status.get("projectName").is_none_or(Value::is_null) {
            return Err(PROJECT_ERROR.to_string());
        }
        let source = arguments
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let id = arguments
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !snapshot_has_target(&snapshot, source, id) {
            return Err(TARGET_ERROR.to_string());
        }
    } else if status.get("running").is_none_or(Value::is_null) {
        return Err(STOP_ERROR.to_string());
    }

    state
        .dispatch_command(app, name.to_string(), arguments)
        .await
        .map_err(bridge_error_message)
}

fn list_trackable_work(
    snapshot: &CachedMcpSnapshot,
    arguments: ListTrackableWorkArguments,
) -> Result<Value, String> {
    let rows = snapshot
        .value
        .get("trackableWork")
        .and_then(Value::as_array)
        .ok_or_else(|| "MCP snapshot does not contain trackable work".to_string())?;
    let query = arguments.query.map(|query| query.to_lowercase());
    let mut filtered = rows
        .iter()
        .filter(|row| {
            arguments
                .source
                .as_deref()
                .is_none_or(|source| row.get("source").and_then(Value::as_str) == Some(source))
        })
        .filter(|row| arguments.include_closed || !is_closed_work_item(row))
        .filter(|row| {
            query.as_deref().is_none_or(|query| {
                ["title", "identifier", "repository"].iter().any(|field| {
                    row.get(field)
                        .and_then(Value::as_str)
                        .is_some_and(|value| value.to_lowercase().contains(query))
                })
            })
        })
        .cloned()
        .collect::<Vec<_>>();
    let truncated = filtered.len() > arguments.limit;
    filtered.truncate(arguments.limit);
    for row in &mut filtered {
        if let Some(row) = row.as_object_mut() {
            row.remove("isClosed");
            row.remove("statusType");
        }
    }

    Ok(json!({
        "rows": filtered,
        "capturedAt": snapshot.captured_at,
        "truncated": truncated,
    }))
}

fn tracking_status(snapshot: &CachedMcpSnapshot) -> Result<Value, String> {
    let mut status = snapshot
        .value
        .get("trackingStatus")
        .and_then(Value::as_object)
        .cloned()
        .ok_or_else(|| "MCP snapshot does not contain tracking status".to_string())?;
    status.insert(
        "capturedAt".to_string(),
        Value::String(snapshot.captured_at.clone()),
    );
    if let Some(running) = status.get_mut("running").and_then(Value::as_object_mut) {
        if let Some(started_at) = running.get("startedAt").and_then(Value::as_str) {
            if let Some(started_at_seconds) = parse_rfc3339_seconds(started_at) {
                let elapsed_seconds = current_epoch_seconds()
                    .unwrap_or(started_at_seconds)
                    .saturating_sub(started_at_seconds)
                    .max(0);
                running.insert("elapsedSeconds".to_string(), json!(elapsed_seconds));
            }
        }
    }

    Ok(Value::Object(status))
}

fn list_recent_entries(
    snapshot: &CachedMcpSnapshot,
    arguments: ListRecentEntriesArguments,
) -> Result<Value, String> {
    let days = arguments.days.to_string();
    let entries = snapshot
        .value
        .get("recentEntries")
        .and_then(Value::as_object)
        .and_then(|entries| entries.get(&days))
        .and_then(Value::as_array)
        .ok_or_else(|| "MCP snapshot does not contain recent entries".to_string())?;
    let entries = entries
        .iter()
        .take(arguments.limit)
        .cloned()
        .collect::<Vec<_>>();

    Ok(json!({
        "entries": entries,
        "capturedAt": snapshot.captured_at,
    }))
}

fn list_clockify_projects(
    snapshot: &CachedMcpSnapshot,
    query: Option<String>,
) -> Result<Value, String> {
    let mut result = snapshot
        .value
        .get("clockifyProjects")
        .and_then(Value::as_object)
        .cloned()
        .ok_or_else(|| "MCP snapshot does not contain Clockify projects".to_string())?;
    if let Some(query) = query {
        let query = query.to_lowercase();
        let projects = result
            .get("projects")
            .and_then(Value::as_array)
            .map(|projects| {
                projects
                    .iter()
                    .filter(|project| {
                        project
                            .get("projectName")
                            .and_then(Value::as_str)
                            .is_some_and(|name| name.to_lowercase().contains(&query))
                    })
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        result.insert("projects".to_string(), Value::Array(projects));
    }

    Ok(Value::Object(result))
}

fn snapshot_has_target(snapshot: &CachedMcpSnapshot, source: &str, id: &str) -> bool {
    snapshot
        .value
        .get("trackableWork")
        .and_then(Value::as_array)
        .is_some_and(|rows| {
            rows.iter().any(|row| {
                row.get("source").and_then(Value::as_str) == Some(source)
                    && row.get("id").and_then(Value::as_str) == Some(id)
            })
        })
}

fn is_closed_work_item(row: &Value) -> bool {
    if row.get("isClosed").and_then(Value::as_bool) == Some(true) {
        return true;
    }
    match row.get("source").and_then(Value::as_str) {
        Some("github") => row
            .get("status")
            .and_then(Value::as_str)
            .is_some_and(|status| status.eq_ignore_ascii_case("closed")),
        Some("linear") => row
            .get("statusType")
            .and_then(Value::as_str)
            .is_some_and(|status| {
                matches!(status, "completed" | "canceled" | "duplicate" | "unknown")
            }),
        _ => false,
    }
}

struct ListTrackableWorkArguments {
    source: Option<String>,
    query: Option<String>,
    include_closed: bool,
    limit: usize,
    refresh: bool,
}

fn validate_list_trackable_work(
    arguments: &Value,
) -> Result<ListTrackableWorkArguments, ProtocolError> {
    let arguments = validate_object_keys(
        arguments,
        &["source", "query", "includeClosed", "limit", "refresh"],
    )?;
    let source = optional_string(arguments, "source")?;
    if source
        .as_deref()
        .is_some_and(|source| !matches!(source, "linear" | "github" | "quick_timer"))
    {
        return Err(invalid_params());
    }
    let query = optional_string(arguments, "query")?;
    let include_closed = optional_bool(arguments, "includeClosed")?.unwrap_or(false);
    let limit = optional_integer(arguments, "limit")?.unwrap_or(50);
    let refresh = optional_bool(arguments, "refresh")?.unwrap_or(true);
    if !(1..=200).contains(&limit) {
        return Err(invalid_params());
    }

    Ok(ListTrackableWorkArguments {
        source,
        query,
        include_closed,
        limit: limit as usize,
        refresh,
    })
}

fn validate_start_timer(arguments: &Value) -> Result<(), ProtocolError> {
    let arguments = validate_object_keys(arguments, &["source", "id", "variables"])?;
    validate_work_target(arguments)
}

fn validate_add_time_entry(arguments: &Value) -> Result<(), ProtocolError> {
    let arguments = validate_object_keys(
        arguments,
        &["source", "id", "variables", "durationMinutes", "endedAt"],
    )?;
    validate_work_target(arguments)?;
    let minutes = arguments
        .get("durationMinutes")
        .and_then(Value::as_f64)
        .ok_or(invalid_params())?;
    if !minutes.is_finite() || minutes <= 0.0 {
        return Err(invalid_params());
    }
    if let Some(ended_at) = optional_string(arguments, "endedAt")? {
        if parse_rfc3339_seconds(&ended_at).is_none() {
            return Err(invalid_params());
        }
    }
    Ok(())
}

fn validate_work_target(arguments: &Map<String, Value>) -> Result<(), ProtocolError> {
    let source = required_string(arguments, "source")?;
    if !matches!(source, "linear" | "github" | "quick_timer") {
        return Err(invalid_params());
    }
    required_string(arguments, "id")?;
    if let Some(variables) = arguments.get("variables") {
        let variables = variables.as_object().ok_or(invalid_params())?;
        if variables.values().any(|value| !value.is_string()) {
            return Err(invalid_params());
        }
    }

    Ok(())
}

struct ListRecentEntriesArguments {
    days: i64,
    limit: usize,
}

fn validate_list_recent_entries(
    arguments: &Value,
) -> Result<ListRecentEntriesArguments, ProtocolError> {
    let arguments = validate_object_keys(arguments, &["days", "limit"])?;
    let days = optional_integer(arguments, "days")?.unwrap_or(1);
    if !matches!(days, 1 | 3 | 7) {
        return Err(invalid_params());
    }
    let limit = optional_integer(arguments, "limit")?.unwrap_or(25);
    if !(1..=100).contains(&limit) {
        return Err(invalid_params());
    }

    Ok(ListRecentEntriesArguments {
        days,
        limit: limit as usize,
    })
}

fn validate_list_clockify_projects(arguments: &Value) -> Result<Option<String>, ProtocolError> {
    let arguments = validate_object_keys(arguments, &["query"])?;
    optional_string(arguments, "query")
}

fn validate_request_params(params: &Value) -> Result<&Map<String, Value>, ProtocolError> {
    let params = params.as_object().ok_or(invalid_params())?;
    if let Some(meta) = params.get("_meta") {
        let meta = meta.as_object().ok_or(invalid_params())?;
        if meta
            .get("progressToken")
            .is_some_and(|token| !token.is_string() && !token.is_number())
        {
            return Err(invalid_params());
        }
    }

    Ok(params)
}

fn validate_list_tools(params: &Value) -> Result<(), ProtocolError> {
    let params = validate_request_params(params)?;
    if params
        .get("cursor")
        .is_some_and(|cursor| !cursor.is_string())
    {
        return Err(invalid_params());
    }

    Ok(())
}

fn validate_call_tool(params: &Value) -> Result<(&str, Value), ProtocolError> {
    let params = validate_request_params(params)?;
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or(invalid_params())?;
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));
    if !arguments.is_object() {
        return Err(invalid_params());
    }

    Ok((name, arguments))
}

fn validate_empty_arguments(arguments: &Value) -> Result<(), ProtocolError> {
    validate_object_keys(arguments, &[]).map(|_| ())
}

fn validate_object_keys<'a>(
    value: &'a Value,
    allowed: &[&str],
) -> Result<&'a Map<String, Value>, ProtocolError> {
    let object = value.as_object().ok_or(invalid_params())?;
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(invalid_params());
    }

    Ok(object)
}

fn required_string<'a>(
    object: &'a Map<String, Value>,
    key: &str,
) -> Result<&'a str, ProtocolError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or(invalid_params())
}

fn optional_string(
    object: &Map<String, Value>,
    key: &str,
) -> Result<Option<String>, ProtocolError> {
    object
        .get(key)
        .map(|value| value.as_str().map(str::to_string).ok_or(invalid_params()))
        .transpose()
}

fn optional_bool(object: &Map<String, Value>, key: &str) -> Result<Option<bool>, ProtocolError> {
    object
        .get(key)
        .map(|value| value.as_bool().ok_or(invalid_params()))
        .transpose()
}

fn optional_integer(object: &Map<String, Value>, key: &str) -> Result<Option<i64>, ProtocolError> {
    object
        .get(key)
        .map(|value| value.as_i64().ok_or(invalid_params()))
        .transpose()
}

fn tool_success(result: Value) -> Value {
    json!({
        "content": [{ "type": "text", "text": result.to_string() }],
        "structuredContent": result,
    })
}

fn tool_error(message: &str) -> Value {
    json!({
        "content": [{ "type": "text", "text": message }],
        "isError": true,
    })
}

fn bridge_error_message(error: McpBridgeError) -> String {
    match error {
        McpBridgeError::NotReady => STARTUP_ERROR.to_string(),
        McpBridgeError::Timeout { .. } => TIMEOUT_ERROR.to_string(),
        McpBridgeError::Webview(message) | McpBridgeError::Internal(message) => message,
    }
}

fn success_response(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn error_response(id: Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message },
    })
}

fn invalid_params() -> ProtocolError {
    ProtocolError {
        code: -32602,
        message: "Invalid params",
    }
}

fn app_version() -> String {
    serde_json::from_str::<Value>(include_str!("../tauri.conf.json"))
        .ok()
        .and_then(|config| {
            config
                .get("version")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())
}

fn current_epoch_seconds() -> Option<i64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| duration.as_secs().try_into().ok())
}

fn parse_rfc3339_seconds(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    if bytes.len() < 20
        || bytes.get(4) != Some(&b'-')
        || bytes.get(7) != Some(&b'-')
        || bytes.get(10) != Some(&b'T')
        || bytes.get(13) != Some(&b':')
        || bytes.get(16) != Some(&b':')
    {
        return None;
    }
    let year = parse_digits(bytes, 0, 4)?;
    let month = parse_digits(bytes, 5, 2)?;
    let day = parse_digits(bytes, 8, 2)?;
    let hour = parse_digits(bytes, 11, 2)?;
    let minute = parse_digits(bytes, 14, 2)?;
    let second = parse_digits(bytes, 17, 2)?;
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 59
    {
        return None;
    }

    let timezone_index = bytes[19..]
        .iter()
        .position(|byte| matches!(byte, b'Z' | b'+' | b'-'))?
        + 19;
    let fraction = &bytes[19..timezone_index];
    if !fraction.is_empty()
        && (fraction[0] != b'.'
            || fraction.len() == 1
            || !fraction[1..].iter().all(u8::is_ascii_digit))
    {
        return None;
    }
    let offset = match bytes[timezone_index] {
        b'Z' if timezone_index + 1 == bytes.len() => 0,
        sign @ (b'+' | b'-') if timezone_index + 6 == bytes.len() => {
            if bytes.get(timezone_index + 3) != Some(&b':') {
                return None;
            }
            let offset_hours = parse_digits(bytes, timezone_index + 1, 2)?;
            let offset_minutes = parse_digits(bytes, timezone_index + 4, 2)?;
            if offset_hours > 23 || offset_minutes > 59 {
                return None;
            }
            let seconds = offset_hours * 3_600 + offset_minutes * 60;
            if sign == b'-' {
                -seconds
            } else {
                seconds
            }
        }
        _ => return None,
    };
    let days = days_from_civil(year, month, day)?;

    Some(
        days.saturating_mul(86_400)
            .saturating_add(hour * 3_600 + minute * 60 + second)
            .saturating_sub(offset),
    )
}

fn parse_digits(bytes: &[u8], start: usize, length: usize) -> Option<i64> {
    let mut value = 0_i64;
    for byte in bytes.get(start..start + length)? {
        if !byte.is_ascii_digit() {
            return None;
        }
        value = value * 10 + i64::from(byte - b'0');
    }
    Some(value)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> Option<i64> {
    let month_days = [
        31,
        28 + i64::from(is_leap_year(year)),
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if day > *month_days.get((month - 1) as usize)? {
        return None;
    }
    let adjusted_year = year - i64::from(month <= 2);
    let era = if adjusted_year >= 0 {
        adjusted_year
    } else {
        adjusted_year - 399
    } / 400;
    let year_of_era = adjusted_year - era * 400;
    let adjusted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * adjusted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    Some(era * 146_097 + day_of_era - 719_468)
}

fn is_leap_year(year: i64) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn tool_catalog() -> Vec<Value> {
    vec![
        json!({
            "name": "list_trackable_work",
            "description": "Syncs all connected providers, then lists work items for starting timers or adding completed time, with their tracked totals. Set refresh to false for cached results. Repository settings, sync limits, and result filters still apply.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "source": { "type": "string", "enum": ["linear", "github", "quick_timer"] },
                    "query": { "type": "string" },
                    "includeClosed": { "type": "boolean", "default": false },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 },
                    "refresh": { "type": "boolean", "default": true },
                },
                "additionalProperties": false,
            },
        }),
        json!({
            "name": "refresh",
            "description": "Runs the app's full sync: Clockify entries, running timer and summaries, plus connected Linear and GitHub sources. Waits for the updated snapshot and returns synced data groups and capturedAt. Reports an error if sync fails. Does not change the running timer or create time entries.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false,
            },
        }),
        json!({
            "name": "start_timer",
            "description": "Starts a Clockify timer against one work item. Clockify stops any already-running timer as a side effect.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "source": { "type": "string", "enum": ["linear", "github", "quick_timer"] },
                    "id": { "type": "string" },
                    "variables": { "type": "object", "additionalProperties": { "type": "string" } },
                },
                "required": ["source", "id"],
                "additionalProperties": false,
            },
        }),
        json!({
            "name": "add_time_entry",
            "description": "Adds a completed Clockify entry for an item from list_trackable_work. Supply durationMinutes; endedAt defaults to now. Uses the selected Clockify project and billable preference. Allows overlaps and does not change the running timer.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "source": { "type": "string", "enum": ["linear", "github", "quick_timer"] },
                    "id": { "type": "string" },
                    "durationMinutes": { "type": "number", "exclusiveMinimum": 0, "description": "Positive duration in minutes; fractional minutes are supported." },
                    "endedAt": { "type": "string", "format": "date-time", "description": "Optional RFC 3339 end timestamp with a timezone, for example 2026-10-12T17:00:00Z. Defaults to now; start is calculated from durationMinutes." },
                    "variables": { "type": "object", "additionalProperties": { "type": "string" }, "description": "Quick Timer template values. Omitted values use the saved preset values." },
                },
                "required": ["source", "id", "durationMinutes"],
                "additionalProperties": false,
            },
        }),
        json!({
            "name": "stop_timer",
            "description": "Stops the running Clockify timer.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false },
        }),
        json!({
            "name": "get_tracking_status",
            "description": "Returns the current TrackingStatus.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false },
        }),
        json!({
            "name": "list_recent_entries",
            "description": "Recent completed Clockify entries from the local synced cache.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "days": { "type": "integer", "enum": [1, 3, 7], "default": 1 },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 25 },
                },
                "additionalProperties": false,
            },
        }),
        json!({
            "name": "list_clockify_projects",
            "description": "Projects in the selected Clockify workspace, so an agent can report where time will land. Read-only; it does not change the timer project.",
            "inputSchema": {
                "type": "object",
                "properties": { "query": { "type": "string" } },
                "additionalProperties": false,
            },
        }),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refresh_contract_defaults_to_full_sync_and_allows_cached_reads() {
        assert!(validate_list_trackable_work(&json!({})).unwrap().refresh);
        assert!(
            !validate_list_trackable_work(&json!({ "refresh": false }))
                .unwrap()
                .refresh
        );
        for value in [json!(null), json!("false"), json!(0)] {
            assert!(validate_list_trackable_work(&json!({ "refresh": value })).is_err());
        }
        let catalog = tool_catalog();
        assert_eq!(
            catalog
                .iter()
                .filter(|tool| tool["name"] == "refresh")
                .count(),
            1
        );
        let list = catalog
            .iter()
            .find(|tool| tool["name"] == "list_trackable_work")
            .unwrap();
        assert_eq!(
            list["inputSchema"]["properties"]["refresh"]["default"],
            true
        );
    }

    #[test]
    fn list_waits_for_refreshed_snapshot_and_preserves_filters() {
        tauri::async_runtime::block_on(async {
            let state = McpBridgeState::default();
            state
                .publish_snapshot("old".to_string(), json!({ "trackableWork": [] }))
                .unwrap();
            let arguments =
                validate_list_trackable_work(&json!({ "source": "github", "query": "new" }))
                    .unwrap();
            let result = list_work_with_refresh(&state, arguments, || async {
                tokio::task::yield_now().await;
                state
                    .publish_snapshot(
                        "fresh".to_string(),
                        json!({ "trackableWork": [
                    { "source": "linear", "title": "New ticket" },
                    { "source": "github", "title": "New PR", "status": "open" },
                    { "source": "github", "title": "New closed PR", "status": "closed" },
                ] }),
                    )
                    .unwrap();
                Ok(json!({}))
            })
            .await
            .unwrap();
            assert_eq!(result["capturedAt"], "fresh");
            assert_eq!(
                result["rows"],
                json!([{ "source": "github", "title": "New PR", "status": "open" }])
            );
        });
    }

    #[test]
    fn cached_list_skips_refresh_and_refresh_failures_do_not_return_stale_rows() {
        tauri::async_runtime::block_on(async {
            let state = McpBridgeState::default();
            state
                .publish_snapshot("old".to_string(), json!({ "trackableWork": [] }))
                .unwrap();
            let cached = validate_list_trackable_work(&json!({ "refresh": false })).unwrap();
            let result =
                list_work_with_refresh(&state, cached, || async { panic!("Must not refresh") })
                    .await
                    .unwrap();
            assert_eq!(result["capturedAt"], "old");
            let fresh = validate_list_trackable_work(&json!({})).unwrap();
            let result =
                list_work_with_refresh(&state, fresh, || async { Err("Sync failed".to_string()) })
                    .await;
            assert_eq!(result.unwrap_err(), "Sync failed");
        });
    }

    #[test]
    fn accepts_claude_call_metadata_and_request_extensions() {
        let params = json!({
            "name": "get_tracking_status",
            "arguments": {},
            "_meta": {
                "claudecode/toolUseId": "tool-use-id",
                "progressToken": "progress-token",
                "clientExtension": true,
            },
            "futureRequestField": { "enabled": true },
        });

        let (name, arguments) = validate_call_tool(&params).unwrap();

        assert_eq!(name, "get_tracking_status");
        assert_eq!(arguments, json!({}));
    }

    #[test]
    fn accepts_codex_list_metadata_and_pagination_cursor() {
        let params = json!({
            "cursor": "next-page",
            "_meta": { "progressToken": 42 },
            "futureRequestField": true,
        });

        assert!(validate_list_tools(&params).is_ok());
    }

    #[test]
    fn rejects_non_string_list_cursor() {
        assert!(validate_list_tools(&json!({ "cursor": 42 })).is_err());
    }

    #[test]
    fn rejects_malformed_request_metadata() {
        assert!(validate_request_params(&json!({ "_meta": null })).is_err());
        assert!(validate_request_params(&json!({
            "_meta": { "progressToken": false }
        }))
        .is_err());
    }

    #[test]
    fn keeps_tool_arguments_strict() {
        assert!(validate_empty_arguments(&json!({})).is_ok());
        assert!(validate_empty_arguments(&json!({ "_meta": {} })).is_err());
    }

    #[test]
    fn accepts_completed_time_for_each_work_source() {
        for source in ["linear", "github", "quick_timer"] {
            assert!(validate_add_time_entry(&json!({
                "source": source, "id": "work-id", "durationMinutes": 1,
            }))
            .is_ok());
        }
        assert!(validate_add_time_entry(&json!({
            "source": "quick_timer", "id": "preset-id", "durationMinutes": 1.5,
            "endedAt": "2026-10-12T14:00:00.125-07:00", "variables": { "topic": "Planning" },
        }))
        .is_ok());
        let catalog = tool_catalog();
        let tool = catalog
            .iter()
            .find(|tool| tool["name"] == "add_time_entry")
            .unwrap();
        assert_eq!(
            tool["inputSchema"]["required"],
            json!(["source", "id", "durationMinutes"])
        );
    }

    #[test]
    fn rejects_invalid_completed_time_arguments() {
        let valid = json!({ "source": "linear", "id": "work-id", "durationMinutes": 1 });
        for duration in [json!(0), json!(-1), json!("1"), json!(null), json!(true)] {
            let mut arguments = valid.clone();
            arguments["durationMinutes"] = duration;
            assert!(validate_add_time_entry(&arguments).is_err());
        }
        for (key, value) in [
            ("source", json!("other")),
            ("id", json!("")),
            ("variables", json!({ "topic": 1 })),
            ("description", json!("Unlinked work")),
            ("endedAt", json!(null)),
        ] {
            let mut arguments = valid.clone();
            arguments[key] = value;
            assert!(validate_add_time_entry(&arguments).is_err());
        }
        assert!(validate_add_time_entry(&json!({ "source": "linear", "id": "work-id" })).is_err());
        assert!(validate_start_timer(&valid).is_err());
    }

    #[test]
    fn completed_time_requires_a_valid_timestamp_with_timezone() {
        for ended_at in [
            "",
            "2026-10-12",
            "2026-10-12T14:00:00",
            "2026-02-30T14:00:00Z",
            "2026-10-12T14:00:00junkZ",
            "2026-10-12T14:00:00.Z",
            "2026-10-12T14:00:60Z",
        ] {
            assert!(
                validate_add_time_entry(&json!({
                    "source": "linear", "id": "work-id", "durationMinutes": 1, "endedAt": ended_at,
                }))
                .is_err(),
                "Accepted invalid endedAt: {ended_at}"
            );
        }
        assert_eq!(
            parse_rfc3339_seconds("2026-10-12T14:00:00.125-07:00"),
            parse_rfc3339_seconds("2026-10-12T21:00:00Z")
        );
    }
}
