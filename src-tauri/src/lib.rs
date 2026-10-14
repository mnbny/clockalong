mod app_initialization;
mod app_logs;
mod auth;
mod auth_clockify;
mod auth_github;
mod auth_linear;
mod auth_telegram;
mod mcp;
mod mcp_bridge;
mod mcp_http;
mod mcp_protocol;
mod storage_config;
mod stronghold;
mod stronghold_config;
mod telegram_download;
mod telegram_group;
mod telegram_image_cache;
mod telegram_media;

use tauri::Manager;

#[cfg(target_os = "macos")]
use tauri::WindowEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    iota_stronghold::engine::snapshot::try_set_encrypt_work_factor(0)
        .expect("failed to configure Stronghold snapshot encryption work factor");

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .level(log::LevelFilter::Debug)
                // Tauri's asset handler includes local paths in 403/404 diagnostics.
                .level_for("tauri::protocol::asset", log::LevelFilter::Off)
                .max_file_size(5_000_000)
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
        .manage(auth::ClockalongAuthState::default())
        .manage(mcp::ClockalongMcpState::default())
        .manage(mcp_bridge::McpBridgeState::default())
        .manage(stronghold::ClockalongStrongholdState::default())
        .manage(telegram_download::TelegramDownloadState::default())
        .manage(telegram_image_cache::TelegramImageCacheState::default())
        .manage(telegram_media::TelegramMediaState::default())
        .setup(|app| {
            if telegram_media::initialize(app.handle()).is_err() {
                log::warn!("Telegram temporary media initialization failed");
            }
            let salt_path = app
                .path()
                .app_local_data_dir()?
                .join(stronghold_config::STRONGHOLD_SALT_FILE);

            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;

            let mcp_app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = mcp::initialize(mcp_app_handle).await {
                    log::error!("MCP server initialization failed: {error}");
                }
            });

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                log::info!("auth lifecycle initialization started");
                if let Err(error) = auth::initialize_auth_lifecycle(app_handle.clone()).await {
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
            auth::clockalong_auth_connect_clockify,
            auth::clockalong_auth_connect_github,
            auth::clockalong_auth_connect_linear,
            auth::clockalong_auth_disconnect_clockify,
            auth::clockalong_auth_disconnect_github,
            auth::clockalong_auth_disconnect_linear,
            auth::clockalong_auth_get_clockify_credential,
            auth::clockalong_auth_get_github_credential,
            auth::clockalong_auth_get_linear_credential,
            auth::clockalong_auth_get_state,
            auth::clockalong_auth_get_telegram_credential,
            auth::clockalong_auth_connect_telegram,
            auth::clockalong_auth_set_telegram_unavailable,
            auth::clockalong_auth_disconnect_telegram,
            telegram_group::telegram_group_read,
            telegram_group::telegram_group_save,
            telegram_group::telegram_group_remove,
            telegram_image_cache::telegram_image_cache_scope,
            telegram_image_cache::telegram_image_cache_read,
            telegram_image_cache::telegram_image_cache_write,
            telegram_download::telegram_download_begin,
            telegram_download::telegram_download_append,
            telegram_download::telegram_download_finish,
            telegram_download::telegram_download_cancel,
            telegram_media::telegram_media_begin,
            telegram_media::telegram_media_append,
            telegram_media::telegram_media_finish,
            telegram_media::telegram_media_release,
            auth::clockalong_auth_refresh_linear_credential,
            mcp::clockalong_mcp_complete_command,
            mcp::clockalong_mcp_get_state,
            mcp::clockalong_mcp_publish_snapshot,
            mcp::clockalong_mcp_set_enabled,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(&event, tauri::RunEvent::Exit) {
                telegram_download::cleanup(app);
                telegram_media::cleanup(app);
                if let Err(error) = mcp::stop(app) {
                    log::error!("MCP server shutdown failed: {error}");
                }
            }

            #[cfg(target_os = "macos")]
            match event {
                tauri::RunEvent::WindowEvent {
                    label,
                    event: WindowEvent::CloseRequested { api, .. },
                    ..
                } if label == "main" => {
                    api.prevent_close();

                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                tauri::RunEvent::Reopen {
                    has_visible_windows: false,
                    ..
                } => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                _ => {}
            }
        });
}
