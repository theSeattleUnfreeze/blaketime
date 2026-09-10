use blaketime_core::contracts::*;
use ts_rs::TS;
fn main() {
    let config = ts_rs::Config::default();
    for declaration in [
        ErrorCode::decl(&config),
        ConnectionState::decl(&config),
        AppInfo::decl(&config),
        Block::decl(&config),
        ChainSnapshot::decl(&config),
        Mempool::decl(&config),
        FeeEstimate::decl(&config),
        Peers::decl(&config),
        Snapshot::decl(&config),
    ] {
        println!("export {declaration}");
    }
}
