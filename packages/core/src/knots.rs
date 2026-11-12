use crate::{
    contracts::*,
    metrics::{average_interval, epoch, fee_rate},
    network_profiles::Profile,
    rpc::{Method, RpcClient},
};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
struct ChainInfo {
    chain: String,
    blocks: u32,
    bestblockhash: String,
    initialblockdownload: bool,
}
#[derive(Deserialize)]
struct Header {
    hash: String,
    height: u32,
    time: i64,
    #[serde(alias = "difficulty_blake2b")]
    difficulty: f64,
    header_version: u32,
    previousblockhash: Option<String>,
}
impl Header {
    fn block(&self) -> Result<Block, ErrorCode> {
        if !valid_hash(&self.hash)
            || ![0, 2].contains(&self.header_version)
            || !self.difficulty.is_finite()
            || self.difficulty < 0.0
            || !(0..=9007199254740991).contains(&self.time)
        {
            return Err(ErrorCode::InvalidResponse);
        }
        Ok(Block {
            hash: self.hash.clone(),
            height: self.height,
            time: self.time,
            difficulty: self.difficulty,
            header_version: self.header_version,
        })
    }
}
fn decode<T: serde::de::DeserializeOwned>(v: Value) -> Result<T, ErrorCode> {
    serde_json::from_value(v).map_err(|_| ErrorCode::InvalidResponse)
}
fn valid_hash(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}
fn integer(v: &Value, key: &str) -> Option<u32> {
    v.get(key)?.as_u64()?.try_into().ok()
}
fn number(v: &Value, key: &str) -> Option<f64> {
    v.get(key)?
        .as_f64()
        .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 9007199254740991.0)
}
fn due(at: Option<u64>, now: u64, interval: u64) -> bool {
    at.is_none_or(|t| now.saturating_sub(t) >= interval)
}

pub async fn collect(
    client: &RpcClient,
    previous: &Snapshot,
    now: u64,
) -> Result<Snapshot, ErrorCode> {
    let profile = Profile::from_config(&client.config)?;
    let info: ChainInfo = decode(client.call(Method::ChainInfo, json!([])).await?)?;
    if info.chain != client.config.network {
        return Err(ErrorCode::NetworkMismatch);
    }
    if client.call(Method::BlockHash, json!([0])).await?.as_str() != Some(profile.genesis) {
        return Err(ErrorCode::NetworkMismatch);
    }
    if !valid_hash(&info.bestblockhash) {
        return Err(ErrorCode::InvalidResponse);
    }
    let mut result = previous.clone();
    let new_tip = previous
        .chain
        .as_ref()
        .is_none_or(|c| c.tip.hash != info.bestblockhash);
    if new_tip {
        let deployment = client
            .call(Method::Deployment, json!([info.bestblockhash]))
            .await?;
        if deployment.get("hash").and_then(Value::as_str) != Some(info.bestblockhash.as_str())
            || deployment
                .pointer("/blake2b/height")
                .and_then(Value::as_u64)
                != Some(u64::from(profile.activation))
            || deployment
                .pointer("/blake2b/active")
                .and_then(Value::as_bool)
                != Some(info.blocks.saturating_add(1) >= profile.activation)
        {
            return Err(ErrorCode::Unsupported);
        }
        let mut header: Header = decode(
            client
                .call(Method::Header, json!([info.bestblockhash, true]))
                .await?,
        )?;
        if header.hash != info.bestblockhash
            || header.height != info.blocks
            || header.header_version
                != if info.blocks >= profile.activation {
                    2
                } else {
                    0
                }
        {
            return Err(ErrorCode::Unsupported);
        }
        let tip = header.block()?;
        let mut recent = vec![tip.clone()];
        while recent.len() < 145 && header.height > 0 {
            let hash = header.previousblockhash.ok_or(ErrorCode::InvalidResponse)?;
            if let Some(old) = previous.chain.as_ref().and_then(|c| {
                c.recent
                    .iter()
                    .position(|b| b.hash == hash)
                    .map(|index| &c.recent[index..])
            }) {
                if old[0].height + 1 != header.height {
                    return Err(ErrorCode::InvalidResponse);
                }
                recent.extend(old.iter().take(145 - recent.len()).cloned());
                break;
            }
            let parent: Header = decode(client.call(Method::Header, json!([hash, true])).await?)?;
            if parent.hash != hash || parent.height + 1 != header.height {
                return Err(ErrorCode::InvalidResponse);
            }
            let block = parent.block()?;
            if block.header_version
                != if block.height >= profile.activation {
                    2
                } else {
                    0
                }
            {
                return Err(ErrorCode::Unsupported);
            }
            recent.push(block);
            header = parent;
        }
        let (stats, block) = tokio::join!(
            client.call(
                Method::BlockStats,
                json!([
                    tip.hash,
                    ["blockhash", "height", "subsidy", "totalfee", "txs"]
                ])
            ),
            client.call(Method::Block, json!([tip.hash, 1]))
        );
        let stats = stats.ok().filter(|v| {
            v.get("blockhash").and_then(Value::as_str) == Some(&tip.hash)
                && integer(v, "height") == Some(tip.height)
        });
        let block = block
            .ok()
            .filter(|v| v.get("hash").and_then(Value::as_str) == Some(&tip.hash));
        let sats = |key| {
            stats
                .as_ref()
                .and_then(|v| v.get(key)?.as_u64())
                .map(|v| v.to_string())
        };
        let window = tip.height.saturating_sub(profile.activation).min(120);
        let hashrate = if tip.header_version == 2 && window > 0 {
            client
                .call(Method::Hashrate, json!([window, tip.height]))
                .await
                .ok()
                .and_then(|v| v.as_f64())
                .filter(|v| v.is_finite() && *v > 0.0)
        } else {
            None
        };
        let (average_interval, sample_count) = average_interval(&recent);
        let (halving_progress, next_halving, until_halving) =
            epoch(tip.height, profile.halving_interval);
        let retarget = profile.retarget_interval.map(|i| epoch(tip.height, i));
        result.chain = Some(ChainSnapshot {
            tip,
            activation_height: profile.activation,
            halving_progress,
            next_halving,
            until_halving,
            retarget_progress: retarget.map(|v| v.0),
            until_retarget: retarget.map(|v| v.2),
            subsidy_sats: sats("subsidy"),
            fee_sats: sats("totalfee"),
            transactions: stats.as_ref().and_then(|v| integer(v, "txs")).or_else(|| {
                block
                    .as_ref()
                    .and_then(|v| integer(v, "txcount").or_else(|| integer(v, "nTx")))
            }),
            size_bytes: block.as_ref().and_then(|v| integer(v, "size")),
            hashrate,
            hashrate_sample_count: if hashrate.is_some() { window } else { 0 },
            target_interval: crate::network_profiles::TARGET_INTERVAL,
            average_interval,
            sample_count,
            recent,
        });
    }
    if due(result.mempool.as_ref().map(|v| v.updated_at), now, 15) {
        result.mempool = client
            .call(Method::Mempool, json!([]))
            .await
            .ok()
            .and_then(|v| {
                Some(Mempool {
                    count: integer(&v, "size")?,
                    virtual_bytes: number(&v, "bytes")?,
                    memory_bytes: number(&v, "usage")?,
                    memory_limit: number(&v, "maxmempool")?,
                    minimum_fee: fee_rate(v.get("mempoolminfee")?)?,
                    updated_at: now,
                })
            });
    }
    if due(result.peers.as_ref().map(|v| v.updated_at), now, 60) {
        result.peers = client
            .call(Method::NetworkInfo, json!([]))
            .await
            .ok()
            .and_then(|v| {
                Some(Peers {
                    count: integer(&v, "connections")?,
                    updated_at: now,
                })
            });
    }
    if due(result.fees.first().map(|v| v.updated_at), now, 60) {
        result.fees.clear();
        for target in [2, 6] {
            if let Ok(value) = client
                .call(Method::EstimateFee, json!([target, "economical"]))
                .await
                && let (Some(target), Some(rate)) = (
                    integer(&value, "blocks"),
                    value.get("feerate").and_then(fee_rate),
                )
            {
                result.fees.push(FeeEstimate {
                    target,
                    sats_per_vbyte: rate,
                    updated_at: now,
                });
            }
        }
    }
    let final_info: ChainInfo = decode(client.call(Method::ChainInfo, json!([])).await?)?;
    if final_info.chain != info.chain {
        return Err(ErrorCode::NetworkMismatch);
    }
    result.state = if info.initialblockdownload || final_info.initialblockdownload {
        ConnectionState::Syncing
    } else {
        ConnectionState::Connected
    };
    result.error = None;
    result.updated_at = Some(now);
    result.label = client.config.label.clone();
    result.network = Some(client.config.network.clone());
    Ok(result)
}
