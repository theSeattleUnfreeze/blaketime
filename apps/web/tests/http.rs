use blaketime_core::{NodeService, config::ServerConfig};
use std::{path::PathBuf, sync::Arc};

#[tokio::test]
async fn host_origin_and_rpc_boundaries() {
    let service = Arc::new(NodeService::start(None).unwrap());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let host = addr.to_string();
    let server = blaketime_web::app(
        service,
        ServerConfig {
            bind: addr,
            allowed_hosts: vec![host.clone()],
        },
        PathBuf::from("missing-test-assets"),
    );
    let task = tokio::spawn(async move {
        axum::serve(listener, server).await.unwrap();
    });
    let http = reqwest::Client::new();
    let url = format!("http://{host}");
    let snapshot = http
        .get(format!("{url}/api/dashboard"))
        .send()
        .await
        .unwrap();
    assert_eq!(snapshot.status(), 200);
    assert!(snapshot.headers().contains_key("content-security-policy"));
    assert_eq!(
        http.get(format!("{url}/api/dashboard"))
            .header("host", "evil.invalid")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        http.post(format!("{url}/api/node/check"))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        http.post(format!("{url}/api/node/check"))
            .header("origin", &url)
            .header("x-blaketime-check", "1")
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert_eq!(
        http.get(format!("{url}/api/rpc?method=sendrawtransaction"))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    task.abort();
}
