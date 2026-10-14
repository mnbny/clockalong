use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::{auth::ClockalongAuthState, stronghold};

const SESSION_KEY: &str = "telegramSession";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelegramCredential {
    api_id: Option<i32>,
    api_hash: Option<String>,
    session: Option<String>,
}

pub fn credential<R: Runtime>(app: AppHandle<R>) -> Result<TelegramCredential, String> {
    let api_id = option_env!("CLOCKALONG_TELEGRAM_API_ID")
        .and_then(|value| value.trim().parse::<i32>().ok())
        .filter(|value| *value > 0);
    let api_hash = option_env!("CLOCKALONG_TELEGRAM_API_HASH")
        .map(str::trim)
        .filter(|value| value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .map(str::to_string);
    Ok(TelegramCredential {
        api_id,
        api_hash,
        session: stronghold::read_string(&app, SESSION_KEY)
            .map_err(|_| "Could not read the saved Telegram session.".to_string())?,
    })
}

pub fn connect<R: Runtime>(app: AppHandle<R>, session: String) -> Result<(), String> {
    if session.trim().is_empty() {
        return Err("Telegram did not provide a session.".to_string());
    }
    // The private JS service validates MTProto authorization before calling this command.
    stronghold::write_string(&app, SESSION_KEY, &session)
        .map_err(|_| "Could not save the Telegram session.".to_string())?;
    set_authenticated(&app, true)
}

pub fn disconnect<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    stronghold::remove_value(&app, SESSION_KEY)
        .map_err(|_| "Could not remove the saved Telegram session.".to_string())?;
    set_authenticated(&app, false)
}

pub fn set_authenticated<R: Runtime>(
    app: &AppHandle<R>,
    authenticated: bool,
) -> Result<(), String> {
    app.state::<ClockalongAuthState>()
        .update_snapshot(app, |snapshot| {
            snapshot.telegram_authenticated = authenticated
        })
}
