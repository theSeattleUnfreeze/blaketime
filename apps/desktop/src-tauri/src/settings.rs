use blaketime_core::contracts::ErrorCode;
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LocalSettings {
    pub config_path: Option<PathBuf>,
    pub automatic_updates: bool,
    pub last_update_check: u64,
}
impl Default for LocalSettings {
    fn default() -> Self {
        Self {
            config_path: None,
            automatic_updates: true,
            last_update_check: 0,
        }
    }
}
impl LocalSettings {
    pub fn load(path: &Path) -> Result<Self, ErrorCode> {
        match std::fs::metadata(path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Ok(meta) if meta.len() <= 65536 => {
                serde_json::from_slice(&std::fs::read(path).map_err(|_| ErrorCode::InvalidConfig)?)
                    .map_err(|_| ErrorCode::InvalidConfig)
            }
            _ => Err(ErrorCode::InvalidConfig),
        }
    }
    pub fn save(&self, path: &Path) -> Result<(), ErrorCode> {
        let parent = path.parent().ok_or(ErrorCode::InvalidConfig)?;
        std::fs::create_dir_all(parent).map_err(|_| ErrorCode::InvalidConfig)?;
        let mut file =
            tempfile::NamedTempFile::new_in(parent).map_err(|_| ErrorCode::InvalidConfig)?;
        file.write_all(&serde_json::to_vec(self).map_err(|_| ErrorCode::InvalidConfig)?)
            .map_err(|_| ErrorCode::InvalidConfig)?;
        file.as_file()
            .sync_all()
            .map_err(|_| ErrorCode::InvalidConfig)?;
        file.persist(path).map_err(|_| ErrorCode::InvalidConfig)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preferences_preserve_config_reference_across_updates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut settings = LocalSettings::load(&path).unwrap();
        assert!(settings.automatic_updates);
        settings.config_path = Some(PathBuf::from("selected config.json"));
        settings.save(&path).unwrap();
        settings.automatic_updates = false;
        settings.save(&path).unwrap();
        let saved = LocalSettings::load(&path).unwrap();
        assert!(!saved.automatic_updates);
        assert_eq!(saved.config_path, settings.config_path);
    }
}
