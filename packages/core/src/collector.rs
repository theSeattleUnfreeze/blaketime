use crate::{config::Config, contracts::*, knots::collect, rpc::RpcClient};
use std::{
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{Mutex, Notify, RwLock, watch};

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub struct NodeService {
    snapshot: Arc<RwLock<Snapshot>>,
    wake: Arc<Notify>,
    stop: watch::Sender<bool>,
    last_check: Mutex<Option<tokio::time::Instant>>,
}
impl NodeService {
    pub fn start(config: Option<Config>) -> Result<Self, ErrorCode> {
        let (stop, mut stopped) = watch::channel(false);
        let mut initial = Snapshot::empty();
        let client = if let Some(config) = config {
            config.validate()?;
            initial.state = ConnectionState::Connecting;
            initial.label = config.node.label.clone();
            initial.network = Some(config.node.network.clone());
            Some(RpcClient::new(config.node)?)
        } else {
            None
        };
        let snapshot = Arc::new(RwLock::new(initial));
        let wake = Arc::new(Notify::new());
        if let Some(client) = client {
            let data = snapshot.clone();
            let notify = wake.clone();
            tokio::spawn(async move {
                let mut failures = 0_u32;
                loop {
                    if *stopped.borrow() {
                        break;
                    }
                    let previous = data.read().await.clone();
                    let cycle = tokio::spawn({
                        let client = client.clone();
                        async move { collect(&client, &previous, now()).await }
                    });
                    let abort = cycle.abort_handle();
                    let response = tokio::select! {
                        _ = stopped.changed() => {
                            abort.abort();
                            break;
                        }
                        joined = cycle => joined,
                    };
                    match response {
                        Ok(Ok(next)) => {
                            *data.write().await = stamp_snapshot(next, now());
                            failures = 0;
                        }
                        Ok(Err(ErrorCode::Busy)) => {
                            failures = 0;
                        }
                        Ok(Err(error)) => {
                            failures = failures.saturating_add(1);
                            record_failure(&data, error).await;
                        }
                        Err(_panic) => {
                            failures = failures.saturating_add(1);
                            record_failure(&data, ErrorCode::Unreachable).await;
                        }
                    }
                    let delay = (5_u64 * (1_u64 << failures.min(4))).min(60);
                    tokio::select! {
                        _ = stopped.changed() => break,
                        _ = notify.notified() => (),
                        _ = tokio::time::sleep(Duration::from_secs(delay)) => (),
                    }
                }
            });
        }
        Ok(Self {
            snapshot,
            wake,
            stop,
            last_check: Mutex::new(None),
        })
    }
    pub async fn snapshot(&self) -> Snapshot {
        let mut data = self.snapshot.read().await.clone();
        if data
            .updated_at
            .is_some_and(|t| now().saturating_sub(t) >= 30)
        {
            data.state = ConnectionState::Stale;
        }
        data
    }
    pub async fn check(&self) -> Result<(), ErrorCode> {
        let mut last = self.last_check.lock().await;
        if last.is_some_and(|v| v.elapsed() < Duration::from_secs(2)) {
            return Err(ErrorCode::Busy);
        }
        *last = Some(tokio::time::Instant::now());
        self.wake.notify_one();
        Ok(())
    }
    pub fn shutdown(&self) {
        let _ = self.stop.send(true);
    }
}
impl Drop for NodeService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn stamp_snapshot(mut next: Snapshot, stamped: u64) -> Snapshot {
    let stamped = next
        .updated_at
        .map_or(stamped, |previous| stamped.max(previous));
    if let Some(previous) = next.updated_at {
        let carry = |value: &mut u64| {
            if *value == previous {
                *value = stamped;
            }
        };
        if let Some(mempool) = next.mempool.as_mut() {
            carry(&mut mempool.updated_at);
        }
        if let Some(peers) = next.peers.as_mut() {
            carry(&mut peers.updated_at);
        }
        for fee in &mut next.fees {
            carry(&mut fee.updated_at);
        }
    }
    next.updated_at = Some(stamped);
    next
}

async fn record_failure(data: &Arc<RwLock<Snapshot>>, error: ErrorCode) {
    let mut state = data.write().await;
    if matches!(error, ErrorCode::NetworkMismatch | ErrorCode::Unsupported) {
        state.chain = None;
        state.mempool = None;
        state.peers = None;
        state.fees.clear();
        state.updated_at = None;
    }
    state.error = Some(error);
    if state.updated_at.is_none() {
        state.state = ConnectionState::Disconnected;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn unconfigured_and_check_limits() {
        let service = NodeService::start(None).unwrap();
        assert_eq!(
            service.snapshot().await.state,
            ConnectionState::NotConfigured
        );
        assert!(service.check().await.is_ok());
        assert_eq!(service.check().await, Err(ErrorCode::Busy));
    }

    #[test]
    fn publish_time_keeps_fresh_samples_and_ages_older_ones() {
        let mut snapshot = Snapshot::empty();
        snapshot.updated_at = Some(1_000);
        snapshot.mempool = Some(Mempool {
            count: 2,
            virtual_bytes: 10.0,
            memory_bytes: 20.0,
            memory_limit: 30.0,
            minimum_fee: 1.0,
            updated_at: 1_000,
        });
        snapshot.peers = Some(Peers {
            count: 8,
            updated_at: 900,
        });
        snapshot.fees.push(FeeEstimate {
            target: 2,
            sats_per_vbyte: 1.0,
            updated_at: 1_000,
        });
        let published = stamp_snapshot(snapshot, 1_040);
        assert_eq!(published.updated_at, Some(1_040));
        assert_eq!(published.mempool.unwrap().updated_at, 1_040);
        assert_eq!(published.fees[0].updated_at, 1_040);
        assert_eq!(published.peers.unwrap().updated_at, 900);
        let mut backward = Snapshot::empty();
        backward.updated_at = Some(5_000);
        let held = stamp_snapshot(backward, 4_000);
        assert_eq!(held.updated_at, Some(5_000));
    }
}
