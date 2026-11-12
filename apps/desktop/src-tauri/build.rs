fn main() {
    for name in [
        "BLAKETIME_RELEASE",
        "BLAKETIME_UPDATE_URL",
        "BLAKETIME_UPDATE_KEY",
        "BLAKETIME_COMMIT",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
    }
    if std::env::var("BLAKETIME_RELEASE").as_deref() == Ok("1") {
        assert!(
            std::env::var_os("CARGO_FEATURE_E2E").is_none(),
            "release must exclude E2E instrumentation"
        );
        for name in [
            "BLAKETIME_UPDATE_URL",
            "BLAKETIME_UPDATE_KEY",
            "BLAKETIME_COMMIT",
        ] {
            assert!(
                std::env::var(name).is_ok_and(|v| !v.trim().is_empty()),
                "missing release metadata"
            );
        }
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "app_info",
            "dashboard",
            "check_connection",
            "choose_config",
            "set_automatic_updates",
            "update_status",
            "check_updates",
            "install_update",
        ]),
    ))
    .expect("invalid desktop build configuration");
}
