use axum::{Json, Router, extract::State, routing::post};
use blaketime_core::{
    config::Config,
    contracts::{ErrorCode, Snapshot},
    knots::collect,
    rpc::{Method, RpcClient},
};
use serde_json::{Value, json};
use std::sync::{
    Arc,
    atomic::{AtomicU32, Ordering},
};

#[derive(Clone)]
struct Fake {
    tip: Arc<AtomicU32>,
    mode: Arc<AtomicU32>,
}
async fn handler(State(fake): State<Fake>, Json(request): Json<Value>) -> Json<Value> {
    let tip = fake.tip.load(Ordering::Relaxed);
    let mode = fake.mode.load(Ordering::Relaxed);
    let hash = |height: u32| format!("{height:064x}");
    let method = request["method"].as_str().unwrap();
    let result = match method {
        "getblockchaininfo" => {
            json!({"chain":if mode==1 {"main"} else {"testnet4"},"blocks":tip,"bestblockhash":hash(tip),"initialblockdownload":false})
        }
        "getblockhash" => json!("00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043"),
        "getdeploymentinfo" => {
            json!({"hash":hash(tip),"blake2b":{"height":150308,"active":tip+1>=150308}})
        }
        "getblockheader" => {
            let height = u32::from_str_radix(
                request["params"][0]
                    .as_str()
                    .unwrap()
                    .trim_start_matches('0'),
                16,
            )
            .unwrap();
            json!({"hash":hash(height),"height":height,"time":1700000000_i64+i64::from(height)*600,"header_version":if height>=150308 {2} else {0},"difficulty":1234.0,"previousblockhash":hash(height-1)})
        }
        "getblockstats" => {
            json!({"blockhash":hash(tip),"height":tip,"subsidy":5000000000_u64,"totalfee":12345,"txs":40})
        }
        "getblock" => json!({"hash":hash(tip),"size":12000,"txcount":40}),
        "getnetworkhashps" => {
            assert!(request["params"][0].as_u64().unwrap() <= u64::from(tip - 150308));
            json!(123456.0)
        }
        "getmempoolinfo" => {
            json!({"size":0,"bytes":0,"usage":100,"maxmempool":300000000,"mempoolminfee":0.00001})
        }
        "getnetworkinfo" => json!({"connections":8}),
        "estimatesmartfee" => {
            if mode == 3 {
                json!({"errors":["not enough data"]})
            } else {
                json!({"blocks":request["params"][0],"feerate":0.00001})
            }
        }
        _ => panic!("unexpected RPC"),
    };
    Json(
        json!({"result":result,"error":null,"id":if mode==2 {json!("wrong")} else {request["id"].clone()}}),
    )
}
async fn fixture() -> (
    RpcClient,
    Fake,
    tempfile::TempDir,
    tokio::task::JoinHandle<()>,
) {
    let fake = Fake {
        tip: Arc::new(AtomicU32::new(150310)),
        mode: Arc::new(AtomicU32::new(0)),
    };
    let server = Router::new()
        .route("/", post(handler))
        .with_state(fake.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        axum::serve(listener, server).await.unwrap();
    });
    let dir = tempfile::tempdir().unwrap();
    let cookie = dir.path().join("cookie");
    std::fs::write(&cookie, "test-only:dummy").unwrap();
    let config:Config = serde_json::from_value(json!({"schemaVersion":1,"node":{"url":format!("http://{addr}"),"network":"testnet4","label":"fixture","auth":{"type":"cookie","file":cookie}}})).unwrap();
    (RpcClient::new(config.node).unwrap(), fake, dir, task)
}
#[tokio::test]
async fn snapshot_fork_sampling_pruning_and_rollback() {
    let (rpc, fake, _dir, task) = fixture().await;
    let snapshot = collect(&rpc, &Snapshot::empty(), 100).await.unwrap();
    let chain = snapshot.chain.as_ref().unwrap();
    assert_eq!(chain.sample_count, 2);
    assert_eq!(chain.recent.len(), 145);
    assert_eq!(chain.subsidy_sats.as_deref(), Some("5000000000"));
    assert_eq!(snapshot.mempool.as_ref().unwrap().count, 0);
    assert_eq!(snapshot.fees.len(), 2);
    fake.tip.store(150308, Ordering::Relaxed);
    fake.mode.store(3, Ordering::Relaxed);
    let fork = collect(&rpc, &snapshot, 200).await.unwrap();
    assert_eq!(fork.chain.as_ref().unwrap().tip.height, 150308);
    assert!(fork.chain.as_ref().unwrap().hashrate.is_none());
    assert!(fork.fees.is_empty());
    fake.tip.store(150307, Ordering::Relaxed);
    let before = collect(&rpc, &fork, 201).await.unwrap();
    assert_eq!(before.chain.unwrap().tip.header_version, 0);
    task.abort();
}
#[tokio::test]
async fn rejects_network_and_id_mismatch_without_leaking_responses() {
    let (rpc, fake, _dir, task) = fixture().await;
    fake.mode.store(1, Ordering::Relaxed);
    assert_eq!(
        collect(&rpc, &Snapshot::empty(), 100).await.unwrap_err(),
        ErrorCode::NetworkMismatch
    );
    fake.mode.store(2, Ordering::Relaxed);
    assert_eq!(
        rpc.call(Method::ChainInfo, json!([])).await.unwrap_err(),
        ErrorCode::InvalidResponse
    );
    task.abort();
}
