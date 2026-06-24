use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Runtime};

pub const APP_INITIALIZATION_STATE_CHANGED_EVENT: &str = "app:initialization-state-changed";

pub struct AppInitializationState {
    app_initializing: Mutex<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInitializationSnapshot {
    app_initializing: bool,
}

impl Default for AppInitializationState {
    fn default() -> Self {
        Self {
            app_initializing: Mutex::new(true),
        }
    }
}

impl AppInitializationState {
    pub fn set_app_initializing<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        app_initializing: bool,
    ) -> Result<(), String> {
        *self
            .app_initializing
            .lock()
            .map_err(|_| "Failed to update app initialization state".to_string())? =
            app_initializing;

        app.emit(APP_INITIALIZATION_STATE_CHANGED_EVENT, self.snapshot()?)
            .map_err(|error| error.to_string())?;

        Ok(())
    }

    fn snapshot(&self) -> Result<AppInitializationSnapshot, String> {
        Ok(AppInitializationSnapshot {
            app_initializing: *self
                .app_initializing
                .lock()
                .map_err(|_| "Failed to read app initialization state".to_string())?,
        })
    }
}

#[tauri::command]
pub fn app_get_initialization_state(
    state: tauri::State<'_, AppInitializationState>,
) -> Result<AppInitializationSnapshot, String> {
    state.snapshot()
}
