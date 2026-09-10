use crate::AppState;
use blaketime_core::{
    collector::now,
    contracts::{ErrorCode, UpdatePhase, UpdateStatus},
};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

pub struct UpdateRuntime {
    pub phase: UpdatePhase,
    pub version: Option<String>,
    pub progress: Option<f64>,
    pub pending: Option<Update>,
    pub last_attempt: Option<std::time::Instant>,
}
impl Default for UpdateRuntime {
    fn default() -> Self {
        Self {
            phase: if source().is_some() {
                UpdatePhase::Idle
            } else {
                UpdatePhase::Disabled
            },
            version: None,
            progress: None,
            pending: None,
            last_attempt: None,
        }
    }
}
fn valid_endpoint(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path().starts_with("/theSeattleUnfreeze/")
        && url
            .path()
            .ends_with("/releases/latest/download/latest.json")
}
pub fn source() -> Option<(Url, &'static str)> {
    let url = Url::parse(option_env!("BLAKETIME_UPDATE_URL")?).ok()?;
    let key = option_env!("BLAKETIME_UPDATE_KEY")?;
    (valid_endpoint(&url) && !key.trim().is_empty()).then_some((url, key))
}
pub async fn status(app: &AppHandle) -> Result<UpdateStatus, ErrorCode> {
    let state = app.state::<AppState>();
    let automatic = state.settings.lock().await.automatic_updates;
    let data = state
        .updates
        .lock()
        .map_err(|_| ErrorCode::InvalidResponse)?;
    Ok(UpdateStatus {
        phase: data.phase,
        version: data.version.clone(),
        progress: data.progress,
        automatic,
    })
}
pub async fn check(app: &AppHandle, manual: bool) -> Result<(), ErrorCode> {
    let Some((url, key)) = source() else {
        return Ok(());
    };
    let state = app.state::<AppState>();
    let now = now();
    {
        let mut settings = state.settings.lock().await;
        if !manual
            && (!settings.automatic_updates
                || now.saturating_sub(settings.last_update_check) < 86400)
        {
            return Ok(());
        }
        let mut data = state
            .updates
            .lock()
            .map_err(|_| ErrorCode::InvalidResponse)?;
        if matches!(
            data.phase,
            UpdatePhase::Checking | UpdatePhase::Downloading | UpdatePhase::Installing
        ) || data
            .last_attempt
            .is_some_and(|last| last.elapsed() < Duration::from_secs(10))
        {
            return Err(ErrorCode::Busy);
        }
        settings.last_update_check = now;
        settings.save(&state.settings_path)?;
        data.phase = UpdatePhase::Checking;
        data.pending = None;
        data.version = None;
        data.last_attempt = Some(std::time::Instant::now());
    }
    let result = match app.updater_builder().pubkey(key).endpoints(vec![url]) {
        Ok(builder) => match builder.timeout(Duration::from_secs(15)).build() {
            Ok(updater) => updater.check().await,
            Err(error) => Err(error),
        },
        Err(error) => Err(error),
    };
    let mut data = state
        .updates
        .lock()
        .map_err(|_| ErrorCode::InvalidResponse)?;
    match result {
        Ok(Some(update)) => {
            data.version = Some(update.version.clone());
            data.pending = Some(update);
            data.phase = UpdatePhase::Available;
        }
        Ok(None) => {
            data.phase = UpdatePhase::Current;
        }
        Err(_) => {
            data.phase = UpdatePhase::CheckFailed;
        }
    }
    Ok(())
}
fn set_phase(shared: &Arc<Mutex<UpdateRuntime>>, phase: UpdatePhase) {
    if let Ok(mut data) = shared.lock() {
        data.phase = phase;
    }
}
pub async fn install(app: &AppHandle) -> Result<(), ErrorCode> {
    let state = app.state::<AppState>();
    let update = {
        let mut data = state
            .updates
            .lock()
            .map_err(|_| ErrorCode::InvalidResponse)?;
        if data.phase != UpdatePhase::Available {
            return Err(ErrorCode::Busy);
        }
        let update = data.pending.take().ok_or(ErrorCode::InvalidResponse)?;
        data.phase = UpdatePhase::Downloading;
        data.progress = None;
        update
    };
    let progress = state.updates.clone();
    let finished = progress.clone();
    let mut downloaded = 0_u64;
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded = downloaded.saturating_add(chunk as u64);
                if let Ok(mut data) = progress.lock() {
                    data.progress = total
                        .filter(|t| *t > 0)
                        .map(|t| (downloaded as f64 / t as f64).min(1.0));
                }
            },
            move || {
                set_phase(&finished, UpdatePhase::Downloading);
            },
        )
        .await;
    let bytes = match bytes {
        Ok(bytes) => bytes,
        Err(error) => {
            let phase = if matches!(
                error,
                tauri_plugin_updater::Error::Minisign(_)
                    | tauri_plugin_updater::Error::Base64(_)
                    | tauri_plugin_updater::Error::SignatureUtf8(_)
            ) {
                UpdatePhase::Unverified
            } else {
                UpdatePhase::InstallFailed
            };
            set_phase(&state.updates, phase);
            return Ok(());
        }
    };
    set_phase(&state.updates, UpdatePhase::Installing);
    if update.install(bytes).is_err() {
        set_phase(&state.updates, UpdatePhase::InstallFailed);
        return Ok(());
    }
    state.service.lock().await.shutdown();
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn update_source_is_fixed_https_without_credentials() {
        for url in [
            "http://github.com/theSeattleUnfreeze/blaketime/releases/latest/download/latest.json",
            "https://evil.invalid/theSeattleUnfreeze/blaketime/releases/latest/download/latest.json",
            "https://secret@github.com/theSeattleUnfreeze/blaketime/releases/latest/download/latest.json",
        ] {
            assert!(!valid_endpoint(&Url::parse(url).unwrap()));
        }
        assert!(valid_endpoint(&Url::parse("https://github.com/theSeattleUnfreeze/blaketime/releases/latest/download/latest.json").unwrap()));
    }
}
