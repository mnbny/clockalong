use crate::{
    mcp_bridge::McpBridgeState,
    mcp_protocol::{handle_message, McpProtocolReply},
};
use std::{
    collections::HashMap,
    io::{ErrorKind, Read, Write},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::oneshot;
use url::Url;

const MCP_PORTS: [u16; 4] = [53700, 53701, 53702, 53703];
const HEADER_SIZE_LIMIT: usize = 8 * 1024;
const BODY_SIZE_LIMIT: usize = 1024 * 1024;
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(35);
const ACCEPT_POLL_INTERVAL: Duration = Duration::from_millis(50);

pub struct McpHttpListener {
    pub port: u16,
    pub shutdown_handle: oneshot::Sender<()>,
}

struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: String,
}

struct HttpResponse {
    status: u16,
    reason: &'static str,
    content_type: &'static str,
    body: String,
}

pub fn start_listener<R: Runtime>(app: AppHandle<R>) -> Result<McpHttpListener, String> {
    let (listener, port) = bind_listener()?;
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let (shutdown_sender, mut shutdown_receiver) = oneshot::channel();

    thread::spawn(move || {
        log::info!("MCP server accept loop started port={port}");
        loop {
            match shutdown_receiver.try_recv() {
                Ok(()) | Err(oneshot::error::TryRecvError::Closed) => break,
                Err(oneshot::error::TryRecvError::Empty) => {}
            }

            match listener.accept() {
                Ok((stream, peer_address)) => {
                    let connection_app = app.clone();
                    thread::spawn(move || {
                        if let Err(error) = serve_connection(connection_app, stream) {
                            log::warn!(
                                "MCP connection failed peer_address={peer_address} error={error}"
                            );
                        }
                    });
                }
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    thread::sleep(ACCEPT_POLL_INTERVAL);
                }
                Err(error) => {
                    log::warn!("MCP accept failed port={port} error={error}");
                    thread::sleep(ACCEPT_POLL_INTERVAL);
                }
            }
        }
        log::info!("MCP server accept loop stopped port={port}");
    });

    Ok(McpHttpListener {
        port,
        shutdown_handle: shutdown_sender,
    })
}

fn bind_listener() -> Result<(TcpListener, u16), String> {
    let mut errors = Vec::new();

    for port in port_candidates()? {
        let address = format!("127.0.0.1:{port}");
        log::info!("MCP server trying address={address}");
        match TcpListener::bind(&address) {
            Ok(listener) => {
                log::info!("MCP server bound address={address}");
                return Ok((listener, port));
            }
            Err(error) => {
                log::warn!("MCP server bind failed address={address} error={error}");
                errors.push(format!("{address}: {error}"));
            }
        }
    }

    Err(format!(
        "Could not start the Clockalong MCP server. Tried: {}",
        errors.join(", ")
    ))
}

fn port_candidates() -> Result<Vec<u16>, String> {
    let override_value = std::env::var("CLOCKALONG_MCP_PORT")
        .ok()
        .or_else(|| option_env!("CLOCKALONG_MCP_PORT").map(str::to_string))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    match override_value {
        Some(value) => {
            let port = value.parse::<u16>().map_err(|_| {
                format!("CLOCKALONG_MCP_PORT must be a port number, received {value}")
            })?;
            if port == 0 {
                return Err("CLOCKALONG_MCP_PORT must be greater than zero".to_string());
            }
            Ok(vec![port])
        }
        None => Ok(MCP_PORTS.to_vec()),
    }
}

fn serve_connection<R: Runtime>(app: AppHandle<R>, mut stream: TcpStream) -> Result<(), String> {
    stream
        .set_read_timeout(Some(CONNECTION_TIMEOUT))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(CONNECTION_TIMEOUT))
        .map_err(|error| error.to_string())?;

    let response = match read_request(&mut stream) {
        Ok(request) => route_request(app, request),
        Err(response) => response,
    };
    write_response(&mut stream, response)
}

fn read_request(stream: &mut TcpStream) -> Result<HttpRequest, HttpResponse> {
    let mut request = Vec::new();
    let mut buffer = [0_u8; 4096];
    let header_end = loop {
        let bytes_read = stream
            .read(&mut buffer)
            .map_err(|_| bad_request("Could not read request"))?;
        if bytes_read == 0 {
            return Err(bad_request("Request was incomplete"));
        }
        request.extend_from_slice(&buffer[..bytes_read]);
        if let Some(header_end) = request
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .map(|index| index + 4)
        {
            if header_end > HEADER_SIZE_LIMIT {
                return Err(payload_too_large());
            }
            break header_end;
        }
        if request.len() > HEADER_SIZE_LIMIT {
            return Err(payload_too_large());
        }
    };

    let header_bytes = &request[..header_end - 4];
    let headers_text = std::str::from_utf8(header_bytes)
        .map_err(|_| bad_request("Request headers were not valid UTF-8"))?;
    let mut lines = headers_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| bad_request("Request line was missing"))?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| bad_request("Request method was missing"))?;
    let path = request_parts
        .next()
        .ok_or_else(|| bad_request("Request path was missing"))?;
    let version = request_parts
        .next()
        .ok_or_else(|| bad_request("HTTP version was missing"))?;
    if request_parts.next().is_some() || !matches!(version, "HTTP/1.0" | "HTTP/1.1") {
        return Err(bad_request("Request line was malformed"));
    }

    let mut headers = HashMap::new();
    for line in lines {
        let (name, value) = line
            .split_once(':')
            .ok_or_else(|| bad_request("Request header was malformed"))?;
        let name = name.trim().to_ascii_lowercase();
        if name.is_empty() || headers.contains_key(&name) {
            return Err(bad_request("Request header was malformed"));
        }
        headers.insert(name, value.trim().to_string());
    }

    let content_length = match headers.get("content-length") {
        Some(value) => value
            .parse::<usize>()
            .map_err(|_| bad_request("Content-Length was invalid"))?,
        None if method == "POST" => {
            return Err(bad_request("Content-Length was required"));
        }
        None => 0,
    };
    if content_length > BODY_SIZE_LIMIT {
        return Err(payload_too_large());
    }

    let available_body = request.len().saturating_sub(header_end);
    let initial_body_length = available_body.min(content_length);
    let mut body = request[header_end..header_end + initial_body_length].to_vec();
    while body.len() < content_length {
        let remaining = content_length - body.len();
        let read_length = remaining.min(buffer.len());
        let bytes_read = stream
            .read(&mut buffer[..read_length])
            .map_err(|_| bad_request("Could not read request body"))?;
        if bytes_read == 0 {
            return Err(bad_request("Request body was incomplete"));
        }
        body.extend_from_slice(&buffer[..bytes_read]);
    }
    let body =
        String::from_utf8(body).map_err(|_| bad_request("Request body was not valid UTF-8"))?;

    Ok(HttpRequest {
        method: method.to_string(),
        path: path.to_string(),
        headers,
        body,
    })
}

fn route_request<R: Runtime>(app: AppHandle<R>, request: HttpRequest) -> HttpResponse {
    if request
        .headers
        .get("origin")
        .is_some_and(|origin| !is_allowed_origin(origin))
    {
        return response(403, "Forbidden", "text/plain; charset=utf-8", "Forbidden");
    }
    if request.path != "/mcp" {
        return response(404, "Not Found", "text/plain; charset=utf-8", "Not Found");
    }
    if request.method != "POST" {
        return response(
            405,
            "Method Not Allowed",
            "text/plain; charset=utf-8",
            "Method Not Allowed",
        );
    }
    if request
        .headers
        .get("content-type")
        .is_none_or(|content_type| !is_json_content_type(content_type))
    {
        return response(
            415,
            "Unsupported Media Type",
            "text/plain; charset=utf-8",
            "Content-Type must be application/json",
        );
    }
    if request
        .headers
        .get("mcp-protocol-version")
        .is_some_and(|version| !matches!(version.as_str(), "2025-06-18" | "2025-03-26"))
    {
        return response(
            400,
            "Bad Request",
            "text/plain; charset=utf-8",
            "Unsupported MCP-Protocol-Version",
        );
    }

    let (sender, receiver) = mpsc::sync_channel(1);
    let request_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = request_app.state::<McpBridgeState>();
        let reply = handle_message(&request_app, &state, &request.body).await;
        let _ = sender.send(reply);
    });

    match receiver.recv_timeout(CONNECTION_TIMEOUT) {
        Ok(McpProtocolReply::Json(body)) => {
            response(200, "OK", "application/json", &body.to_string())
        }
        Ok(McpProtocolReply::Accepted) => response(202, "Accepted", "application/json", ""),
        Err(_) => response(
            500,
            "Internal Server Error",
            "text/plain; charset=utf-8",
            "Clockalong did not finish the request",
        ),
    }
}

fn is_allowed_origin(origin: &str) -> bool {
    let Ok(origin) = Url::parse(origin) else {
        return false;
    };
    matches!(origin.scheme(), "http" | "https")
        && matches!(origin.host_str(), Some("127.0.0.1" | "localhost"))
        && origin.username().is_empty()
        && origin.password().is_none()
        && origin.path() == "/"
        && origin.query().is_none()
        && origin.fragment().is_none()
}

fn is_json_content_type(content_type: &str) -> bool {
    content_type
        .split(';')
        .next()
        .is_some_and(|media_type| media_type.trim().eq_ignore_ascii_case("application/json"))
}

fn bad_request(message: &str) -> HttpResponse {
    response(400, "Bad Request", "text/plain; charset=utf-8", message)
}

fn payload_too_large() -> HttpResponse {
    response(
        413,
        "Payload Too Large",
        "text/plain; charset=utf-8",
        "Request was too large",
    )
}

fn response(
    status: u16,
    reason: &'static str,
    content_type: &'static str,
    body: &str,
) -> HttpResponse {
    HttpResponse {
        status,
        reason,
        content_type,
        body: body.to_string(),
    }
}

fn write_response(stream: &mut TcpStream, response: HttpResponse) -> Result<(), String> {
    let headers = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status,
        response.reason,
        response.content_type,
        response.body.len(),
    );
    stream
        .write_all(headers.as_bytes())
        .and_then(|()| stream.write_all(response.body.as_bytes()))
        .map_err(|error| error.to_string())
}
