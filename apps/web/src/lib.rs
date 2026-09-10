use axum::{
    Json, Router,
    extract::{Request, State},
    http::{HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use blaketime_core::{
    NodeService,
    config::ServerConfig,
    contracts::{AppInfo, ErrorCode},
};
use std::{path::PathBuf, sync::Arc};
use tower_http::services::{ServeDir, ServeFile};

pub fn app(service: Arc<NodeService>, config: ServerConfig, assets: PathBuf) -> Router {
    Router::new()
        .route("/healthz", get(|| async { StatusCode::NO_CONTENT }))
        .route(
            "/api/app",
            get(|| async { Json(AppInfo::new(false, false)) }),
        )
        .route("/api/dashboard", get(snapshot))
        .route("/api/node", get(snapshot))
        .route("/api/node/check", post(check))
        .fallback_service(
            ServeDir::new(&assets).not_found_service(ServeFile::new(assets.join("index.html"))),
        )
        .with_state(service)
        .layer(middleware::from_fn_with_state(config, security))
}
async fn snapshot(State(service): State<Arc<NodeService>>) -> impl IntoResponse {
    Json(service.snapshot().await)
}
async fn check(State(service): State<Arc<NodeService>>) -> Response {
    match service.check().await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => (
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({"error":error})),
        )
            .into_response(),
    }
}
async fn security(State(config): State<ServerConfig>, request: Request, next: Next) -> Response {
    let host = request
        .headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let origin = request
        .headers()
        .get("origin")
        .and_then(|v| v.to_str().ok());
    let same_origin =
        origin.is_none_or(|v| v == format!("http://{host}") || v == format!("https://{host}"));
    let check = request.method() == "POST" && request.uri().path() == "/api/node/check";
    if !config.allowed_hosts.iter().any(|v| v == host)
        || !same_origin
        || request
            .headers()
            .get("sec-fetch-site")
            .is_some_and(|v| v == "cross-site")
        || (check
            && (origin.is_none()
                || request
                    .headers()
                    .get("x-blaketime-check")
                    .is_none_or(|v| v != "1")))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error":ErrorCode::Permission})),
        )
            .into_response();
    }
    if request.uri().path().starts_with("/api/")
        && !["/api/app", "/api/dashboard", "/api/node", "/api/node/check"]
            .contains(&request.uri().path())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert("cache-control", HeaderValue::from_static("no-store"));
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    headers.insert("content-security-policy",HeaderValue::from_static("default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"));
    response
}
