use crate::contracts::ErrorCode;
use serde::Deserialize;
use std::{
    net::IpAddr,
    path::{Path, PathBuf},
};
use url::Url;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NodeConfig {
    pub url: String,
    pub network: String,
    pub label: String,
    pub auth: Auth,
    #[serde(default)]
    pub allow_insecure_rpc: bool,
    #[serde(default)]
    pub allow_insecure_tls: bool,
    pub activation_height: Option<u32>,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Auth {
    Cookie { file: PathBuf },
    Password { username: String, file: PathBuf },
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerConfig {
    pub bind: std::net::SocketAddr,
    pub allowed_hosts: Vec<String>,
}
impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            bind: "127.0.0.1:3000".parse().unwrap(),
            allowed_hosts: vec!["localhost:3000".into(), "127.0.0.1:3000".into()],
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub schema_version: u32,
    pub node: NodeConfig,
    #[serde(default)]
    pub server: ServerConfig,
}

impl Config {
    pub fn load(path: &Path) -> Result<Self, ErrorCode> {
        if std::fs::metadata(path)
            .map_err(|_| ErrorCode::InvalidConfig)?
            .len()
            > 65536
        {
            return Err(ErrorCode::InvalidConfig);
        }
        let data = std::fs::read(path).map_err(|_| ErrorCode::InvalidConfig)?;
        let mut config: Self =
            serde_json::from_slice(&data).map_err(|_| ErrorCode::InvalidConfig)?;
        config.validate()?;
        let parent = std::fs::canonicalize(path)
            .map_err(|_| ErrorCode::InvalidConfig)?
            .parent()
            .ok_or(ErrorCode::InvalidConfig)?
            .to_owned();
        let file = match &mut config.node.auth {
            Auth::Cookie { file } | Auth::Password { file, .. } => file,
        };
        if file.is_relative() {
            *file = parent.join(&*file);
        }
        Ok(config)
    }

    pub fn validate(&self) -> Result<(), ErrorCode> {
        let bad = ErrorCode::InvalidConfig;
        let url = Url::parse(&self.node.url).map_err(|_| bad)?;
        let host = url.host_str().ok_or(bad)?;
        let loopback = host == "localhost"
            || host
                .trim_matches(['[', ']'])
                .parse::<IpAddr>()
                .is_ok_and(|ip| ip.is_loopback());
        if self.schema_version != 1
            || !["main", "testnet4", "regtest"].contains(&self.node.network.as_str())
            || !["http", "https"].contains(&url.scheme())
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
            || url.query().is_some()
            || (url.scheme() == "http" && !loopback && !self.node.allow_insecure_rpc)
            || self.node.label.trim().is_empty()
            || self.node.label.len() > 80
            || (self.node.network == "regtest" && self.node.activation_height.is_none())
            || (self.node.network != "regtest" && self.node.activation_height.is_some())
            || self.server.allowed_hosts.is_empty()
            || self
                .server
                .allowed_hosts
                .iter()
                .any(|h| h.is_empty() || h.contains(['/', '\\', '@', '*', '\n', '\r', ' ']))
        {
            return Err(bad);
        }
        match &self.node.auth {
            Auth::Cookie { file } if file.as_os_str().is_empty() => Err(bad),
            Auth::Password { file, username }
                if file.as_os_str().is_empty()
                    || username.is_empty()
                    || username.contains([':', '\n', '\r']) =>
            {
                Err(bad)
            }
            _ => Ok(()),
        }
    }
}

impl Auth {
    pub async fn credentials(&self) -> Result<(String, String), ErrorCode> {
        let file = match self {
            Self::Cookie { file } | Self::Password { file, .. } => file,
        };
        if tokio::fs::metadata(file)
            .await
            .map_err(|_| ErrorCode::Auth)?
            .len()
            > 4096
        {
            return Err(ErrorCode::Auth);
        }
        let value = tokio::fs::read_to_string(file)
            .await
            .map_err(|_| ErrorCode::Auth)?;
        let value = value.trim_end_matches(['\r', '\n']);
        if value.is_empty() || value.contains(['\r', '\n']) {
            return Err(ErrorCode::Auth);
        }
        match self {
            Self::Cookie { .. } => value
                .split_once(':')
                .filter(|(u, p)| !u.is_empty() && !p.is_empty())
                .map(|(u, p)| (u.into(), p.into()))
                .ok_or(ErrorCode::Auth),
            Self::Password { username, .. } => Ok((username.clone(), value.into())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn config(url: &str) -> Config {
        serde_json::from_value(serde_json::json!({"schemaVersion":1,"node":{"url":url,"network":"testnet4","label":"test","auth":{"type":"cookie","file":"cookie"}}})).unwrap()
    }
    #[test]
    fn rejects_unsafe_configuration() {
        for url in [
            "file:///a",
            "http://user:pass@localhost",
            "http://example.com",
            "https://example.com/#secret",
        ] {
            assert!(config(url).validate().is_err());
        }
        for url in [
            "http://127.0.0.1:1234",
            "http://[::1]:1234",
            "https://node.example.com",
        ] {
            assert!(config(url).validate().is_ok());
        }
        let mut c = config("https://node.example.com");
        c.node.network = "regtest".into();
        assert!(c.validate().is_err());
    }
    #[test]
    fn resolves_secret_paths_relative_to_config() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, r#"{"schemaVersion":1,"node":{"url":"http://localhost:48332","network":"testnet4","label":"test","auth":{"type":"cookie","file":"secret"}}}"#).unwrap();
        let Auth::Cookie { file } = Config::load(&path).unwrap().node.auth else {
            panic!()
        };
        assert_eq!(file, dir.path().canonicalize().unwrap().join("secret"));
    }
}
