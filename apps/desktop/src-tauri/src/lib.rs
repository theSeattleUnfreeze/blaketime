mod commands;
mod settings;
mod updates;

use blaketime_core::{NodeService, config::Config, contracts::ErrorCode};
use settings::LocalSettings;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex as StdMutex},
};
use tauri::Manager;
use tokio::sync::Mutex;

pub struct AppState {
    service: Mutex<Arc<NodeService>>,
    config_error: Mutex<Option<ErrorCode>>,
    settings: Mutex<LocalSettings>,
    settings_path: PathBuf,
    selection: Mutex<()>,
    updates: Arc<StdMutex<updates::UpdateRuntime>>,
}
fn allowed_navigation(url: &url::Url, development: bool) -> bool {
    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (["http", "https"].contains(&url.scheme()) && url.host_str() == Some("tauri.localhost"))
        || (development
            && url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.port() == Some(5173))
}
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init());
    let builder = if updates::source().is_some() {
        builder.plugin(tauri_plugin_updater::Builder::new().build())
    } else {
        builder
    };
    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());
    builder
        .setup(|app| {
            let directory = app.path().app_config_dir()?;
            #[cfg(feature = "e2e")]
            let directory = {
                let _ = directory;
                PathBuf::from(
                    std::env::var_os("BLAKETIME_TEST_DATA_DIR").ok_or(ErrorCode::InvalidConfig)?,
                )
            };
            let path = directory.join("settings.json");
            let (settings, mut error) = match LocalSettings::load(&path) {
                Ok(v) => (v, None),
                Err(e) => (LocalSettings::default(), Some(e)),
            };
            #[cfg(feature = "e2e")]
            let settings = LocalSettings {
                config_path: Some(PathBuf::from(
                    std::env::var_os("BLAKETIME_TEST_CONFIG").ok_or(ErrorCode::InvalidConfig)?,
                )),
                ..settings
            };
            let config = match settings
                .config_path
                .as_ref()
                .map(|p| Config::load(p))
                .transpose()
            {
                Ok(v) => v,
                Err(e) => {
                    error = Some(e);
                    None
                }
            };
            let service = tauri::async_runtime::block_on(async { NodeService::start(config) })?;
            app.manage(AppState {
                service: Mutex::new(Arc::new(service)),
                config_error: Mutex::new(error),
                settings: Mutex::new(settings),
                settings_path: path,
                selection: Mutex::new(()),
                updates: Arc::new(StdMutex::new(updates::UpdateRuntime::default())),
            });
            let config = app
                .config()
                .app
                .windows
                .first()
                .ok_or(ErrorCode::InvalidConfig)?;
            let window = tauri::WebviewWindowBuilder::from_config(app, config)?
                .on_navigation(|url| allowed_navigation(url, cfg!(debug_assertions)))
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            let handle = app.handle().clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Focused(true)) {
                    let app = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let service = app.state::<AppState>().service.lock().await.clone();
                        let _ = service.check().await;
                    });
                }
            });
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let _ = updates::check(&handle, false).await;
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::dashboard,
            commands::check_connection,
            commands::choose_config,
            commands::set_automatic_updates,
            commands::update_status,
            commands::check_updates,
            commands::install_update
        ])
        .run(tauri::generate_context!())
        .expect("desktop runtime failed");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn denies_remote_navigation_including_untrusted_https() {
        assert!(allowed_navigation(
            &url::Url::parse("tauri://localhost/").unwrap(),
            false
        ));
        assert!(!allowed_navigation(
            &url::Url::parse("https://evil.invalid/").unwrap(),
            false
        ));
        assert!(!allowed_navigation(
            &url::Url::parse("http://127.0.0.1:5173/").unwrap(),
            false
        ));
        assert!(allowed_navigation(
            &url::Url::parse("http://127.0.0.1:5173/").unwrap(),
            true
        ));
    }
}
