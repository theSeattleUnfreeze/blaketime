use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    InvalidConfig,
    NetworkMismatch,
    Unsupported,
    Auth,
    Permission,
    Unreachable,
    InvalidResponse,
    Busy,
}

impl std::fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for ErrorCode {}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionState {
    NotConfigured,
    Connecting,
    Connected,
    Syncing,
    Stale,
    Disconnected,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub commit: String,
    pub api_version: u32,
    pub desktop: bool,
    pub updates_enabled: bool,
}
impl AppInfo {
    pub fn new(desktop: bool, updates_enabled: bool) -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").into(),
            commit: option_env!("BLAKETIME_COMMIT")
                .unwrap_or("development")
                .into(),
            api_version: 1,
            desktop,
            updates_enabled,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub hash: String,
    pub height: u32,
    #[ts(type = "number")]
    pub time: i64,
    pub header_version: u32,
    pub difficulty: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ChainSnapshot {
    pub tip: Block,
    pub activation_height: u32,
    pub halving_progress: f64,
    pub next_halving: u32,
    pub until_halving: u32,
    pub retarget_progress: Option<f64>,
    pub until_retarget: Option<u32>,
    pub subsidy_sats: Option<String>,
    pub fee_sats: Option<String>,
    pub transactions: Option<u32>,
    pub size_bytes: Option<u32>,
    pub hashrate: Option<f64>,
    pub hashrate_sample_count: u32,
    pub target_interval: u32,
    pub average_interval: Option<f64>,
    pub sample_count: u32,
    pub recent: Vec<Block>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Mempool {
    pub count: u32,
    pub virtual_bytes: f64,
    pub memory_bytes: f64,
    pub memory_limit: f64,
    pub minimum_fee: f64,
    #[ts(type = "number")]
    pub updated_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FeeEstimate {
    pub target: u32,
    pub sats_per_vbyte: f64,
    #[ts(type = "number")]
    pub updated_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Peers {
    pub count: u32,
    #[ts(type = "number")]
    pub updated_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub state: ConnectionState,
    pub error: Option<ErrorCode>,
    pub label: String,
    pub network: Option<String>,
    #[ts(type = "number | null")]
    pub updated_at: Option<u64>,
    pub chain: Option<ChainSnapshot>,
    pub mempool: Option<Mempool>,
    pub fees: Vec<FeeEstimate>,
    pub peers: Option<Peers>,
}
impl Snapshot {
    pub fn empty() -> Self {
        Self {
            state: ConnectionState::NotConfigured,
            error: None,
            label: String::new(),
            network: None,
            updated_at: None,
            chain: None,
            mempool: None,
            fees: vec![],
            peers: None,
        }
    }
}
