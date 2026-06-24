mod app_initialization;
mod app_logs;
mod clinear_auth;
mod storage_config;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .level(log::LevelFilter::Debug)
                .max_file_size(1_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(4))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some(app_logs::APP_LOG_FILE_NAME.to_string()),
                    },
                ))
                .build(),
        );

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .manage(app_initialization::AppInitializationState::default())
        .manage(clinear_auth::ClinearAuthState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                log::info!("auth lifecycle initialization started");
                if let Err(error) =
                    clinear_auth::initialize_auth_lifecycle(app_handle.clone()).await
                {
                    log::error!("auth lifecycle initialization failed: {error}");
                } else {
                    log::info!("auth lifecycle initialization completed");
                }

                if let Err(error) = app_handle
                    .state::<app_initialization::AppInitializationState>()
                    .set_app_initializing(&app_handle, false)
                {
                    log::error!("app initialization state update failed: {error}");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_logs::app_clear_log_file,
            app_logs::app_read_log_file,
            app_initialization::app_get_initialization_state,
            clinear_auth::clinear_auth_get_state,
            clinear_auth::clinear_auth_start_clockify_authentication,
            clinear_auth::clinear_auth_start_linear_authentication,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {});
}
