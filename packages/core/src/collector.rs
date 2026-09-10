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
                    let previous = data.read().await.clone();
                    let response = tokio::select! {
                        _ = stopped.changed() => break,
                        result = collect(&client,&previous,now()) => result,
                    };
                    match response {
                        Ok(next) => {
                            *data.write().await = next;
                            failures = 0;
                        }
                        Err(ErrorCode::Busy) => {
                            failures = 0;
                        }
                        Err(error) => {
                            failures = failures.saturating_add(1);
                            let mut state = data.write().await;
                            if matches!(error, ErrorCode::NetworkMismatch | ErrorCode::Unsupported)
                            {
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
}
