use std::fs;
use std::io::ErrorKind;
use tauri::{AppHandle, Manager};

pub const APP_LOG_FILE_NAME: &str = "app";

#[tauri::command]
pub fn app_read_log_file(app: AppHandle) -> Result<String, String> {
    let log_path = app_log_path(&app)?;

    match fs::read_to_string(log_path) {
        Ok(contents) => Ok(contents),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn app_clear_log_file(app: AppHandle) -> Result<(), String> {
    let log_path = app_log_path(&app)?;

    match fs::write(log_path, "") {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn app_log_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?
        .join(format!("{APP_LOG_FILE_NAME}.log")))
}
