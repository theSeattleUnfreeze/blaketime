use blaketime_core::{
    NodeService,
    config::{Config, ServerConfig},
};
use std::{path::PathBuf, sync::Arc};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = std::env::var_os("BLAKETIME_CONFIG")
        .map(|v| Config::load(&PathBuf::from(v)))
        .transpose()?;
    let mut server = config
        .as_ref()
        .map(|c| c.server.clone())
        .unwrap_or_else(ServerConfig::default);
    if let Ok(bind) = std::env::var("BLAKETIME_BIND") {
        server.bind = bind.parse()?;
    }
    if let Ok(hosts) = std::env::var("BLAKETIME_ALLOWED_HOSTS") {
        server.allowed_hosts = hosts.split(',').map(str::to_owned).collect();
    }
    let service = Arc::new(NodeService::start(config)?);
    let assets = std::env::var_os("BLAKETIME_ASSETS")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("dist/ui"));
    let listener = tokio::net::TcpListener::bind(server.bind).await?;
    eprintln!("blaketime-web ready");
    axum::serve(
        listener,
        blaketime_web::app(service.clone(), server, assets),
    )
    .with_graceful_shutdown(shutdown())
    .await?;
    service.shutdown();
    Ok(())
}

async fn shutdown() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("failed to register termination signal");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => (),
            _ = terminate.recv() => (),
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
