use crate::{
    config::{Auth, NodeConfig},
    contracts::ErrorCode,
};
use serde_json::{Value, json};
use std::{
    net::{SocketAddr, ToSocketAddrs},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::sync::Semaphore;
use url::Url;

#[derive(Clone, Copy)]
pub enum Method {
    ChainInfo,
    BlockHash,
    Deployment,
    Header,
    Block,
    BlockStats,
    NetworkInfo,
    Mempool,
    EstimateFee,
    Hashrate,
}
impl Method {
    pub fn name(self) -> &'static str {
        match self {
            Self::ChainInfo => "getblockchaininfo",
            Self::BlockHash => "getblockhash",
            Self::Deployment => "getdeploymentinfo",
            Self::Header => "getblockheader",
            Self::Block => "getblock",
            Self::BlockStats => "getblockstats",
            Self::NetworkInfo => "getnetworkinfo",
            Self::Mempool => "getmempoolinfo",
            Self::EstimateFee => "estimatesmartfee",
            Self::Hashrate => "getnetworkhashps",
        }
    }
}

pub struct RpcClient {
    pub config: NodeConfig,
    http: reqwest::Client,
    id: AtomicU64,
    limit: Arc<Semaphore>,
}
fn prefer_ipv4(host: &str, port: u16) -> Option<SocketAddr> {
    let addrs = (host, port).to_socket_addrs().ok()?.collect::<Vec<_>>();
    addrs
        .iter()
        .copied()
        .find(SocketAddr::is_ipv4)
        .or_else(|| addrs.into_iter().next())
}

impl RpcClient {
    pub fn new(config: NodeConfig) -> Result<Self, ErrorCode> {
        let mut builder = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(4))
            .timeout(Duration::from_secs(8))
            .danger_accept_invalid_certs(config.allow_insecure_tls)
            .user_agent(concat!("Blaketime/", env!("CARGO_PKG_VERSION")));
        // mDNS/.local hosts often publish AAAA records that do not serve RPC.
        // Pin the first IPv4 address when available so TLS still uses the hostname.
        if let Ok(url) = Url::parse(&config.url)
            && let Some(host) = url.host_str()
            && let Some(port) = url.port_or_known_default()
            && let Some(addr) = prefer_ipv4(host, port)
        {
            builder = builder.resolve(host, addr);
        }
        let http = builder.build().map_err(|_| ErrorCode::InvalidConfig)?;
        Ok(Self {
            config,
            http,
            id: AtomicU64::new(0),
            limit: Arc::new(Semaphore::new(2)),
        })
    }
    pub async fn call(&self, method: Method, params: Value) -> Result<Value, ErrorCode> {
        let _permit = self
            .limit
            .acquire()
            .await
            .map_err(|_| ErrorCode::Unreachable)?;
        let result = self.request(method, &params).await;
        if result == Err(ErrorCode::Auth) && matches!(self.config.auth, Auth::Cookie { .. }) {
            self.request(method, &params).await
        } else {
            result
        }
    }
    async fn request(&self, method: Method, params: &Value) -> Result<Value, ErrorCode> {
        let id = self.id.fetch_add(1, Ordering::Relaxed);
        let (user, password) = self.config.auth.credentials().await?;
        let mut response = self
            .http
            .post(&self.config.url)
            .basic_auth(user, Some(password))
            .json(&json!({"jsonrpc":"1.0","id":id,"method":method.name(),"params":params}))
            .send()
            .await
            .map_err(|_| ErrorCode::Unreachable)?;
        match response.status().as_u16() {
            401 => return Err(ErrorCode::Auth),
            403 => return Err(ErrorCode::Permission),
            200 | 500 => (),
            _ => return Err(ErrorCode::InvalidResponse),
        }
        const MAX_BODY: usize = 8 * 1024 * 1024;
        if response
            .content_length()
            .is_some_and(|n| n > MAX_BODY as u64)
        {
            return Err(ErrorCode::InvalidResponse);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| ErrorCode::Unreachable)? {
            if body.len() + chunk.len() > MAX_BODY {
                return Err(ErrorCode::InvalidResponse);
            }
            body.extend_from_slice(&chunk);
        }
        let data: Value = serde_json::from_slice(&body).map_err(|_| ErrorCode::InvalidResponse)?;
        if data.get("id") != Some(&json!(id)) {
            return Err(ErrorCode::InvalidResponse);
        }
        if let Some(error) = data.get("error").filter(|e| !e.is_null()) {
            return Err(match error.get("code").and_then(Value::as_i64) {
                Some(-32601) => ErrorCode::Unsupported,
                Some(-28) => ErrorCode::Unreachable,
                _ => ErrorCode::InvalidResponse,
            });
        }
        data.get("result")
            .cloned()
            .ok_or(ErrorCode::InvalidResponse)
    }
}
