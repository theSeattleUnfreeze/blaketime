use crate::{AppState, updates};
use blaketime_core::{
    NodeService,
    config::Config,
    contracts::{AppInfo, ErrorCode, Snapshot, UpdateStatus},
};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo::new(true, updates::source().is_some())
}
#[tauri::command]
pub async fn dashboard(state: State<'_, AppState>) -> Result<Snapshot, ErrorCode> {
    let service = state.service.lock().await.clone();
    let mut snapshot = service.snapshot().await;
    if let Some(error) = *state.config_error.lock().await {
        snapshot.error = Some(error);
    }
    Ok(snapshot)
}
#[tauri::command]
pub async fn check_connection(state: State<'_, AppState>) -> Result<(), ErrorCode> {
    let service = state.service.lock().await.clone();
    service.check().await
}
#[tauri::command]
pub async fn choose_config(app: AppHandle, state: State<'_, AppState>) -> Result<(), ErrorCode> {
    let _selection = state.selection.try_lock().map_err(|_| ErrorCode::Busy)?;
    let selected = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("JSON", &["json"])
            .blocking_pick_file()
    })
    .await
    .map_err(|_| ErrorCode::InvalidConfig)?;
    let Some(selected) = selected else {
        return Ok(());
    };
    let path = selected.into_path().map_err(|_| ErrorCode::InvalidConfig)?;
    let config = Config::load(&path)?;
    let replacement = Arc::new(NodeService::start(Some(config))?);
    {
        let mut settings = state.settings.lock().await;
        let mut updated = settings.clone();
        updated.config_path = Some(path);
        updated.save(&state.settings_path)?;
        *settings = updated;
    }
    let previous = std::mem::replace(&mut *state.service.lock().await, replacement);
    previous.shutdown();
    *state.config_error.lock().await = None;
    Ok(())
}
#[tauri::command]
pub async fn set_automatic_updates(
    state: State<'_, AppState>,
    automatic: bool,
) -> Result<(), ErrorCode> {
    let mut settings = state.settings.lock().await;
    let mut updated = settings.clone();
    updated.automatic_updates = automatic;
    updated.save(&state.settings_path)?;
    *settings = updated;
    Ok(())
}
#[tauri::command]
pub async fn update_status(app: AppHandle) -> Result<UpdateStatus, ErrorCode> {
    updates::status(&app).await
}
#[tauri::command]
pub async fn check_updates(app: AppHandle) -> Result<(), ErrorCode> {
    updates::check(&app, true).await
}
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), ErrorCode> {
    updates::install(&app).await
}
