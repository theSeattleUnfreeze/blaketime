# Living engineering record

## Scope and design source

The approved product is an original circular Knots chain dashboard for web and standalone Tauri desktop, following https://timechaincalendar.com/en and the supplied screenshot as the visual reference. Shared React UI and shared Rust node logic prevent divergent releases. macOS arm64/x64 and Windows x64 are desktop targets; web ships as a self-hosted container. Original code is MIT.

## Decisions and assumptions

| Decision | Rationale / review point |
| --- | --- |
| Direct Knots RPC, not neopd | Inspected neop commit 03f6ceddf55063d32c2324829f74f1cce9072f3f lacks dashboard block/mempool/mining methods. No neop edits. |
| Knots compatibility baseline | v29.4.1.knots20260508, commit 8c85b1585dac23f964e2dd32045624de7f02aa58; verify runtime capabilities, not just version text. |
| Main/testnet4 activation | 961640 / 150308, with 600-second target and 210000-block halvings; regtest is configurable, halving interval 150. |
| No fiat, pool attribution, global node count, or supply claim | A private node alone does not authoritatively supply the reference's external metrics. |
| Recent-block ring | Up to 144 blocks, not a claim about a complete 24-hour period. |
| Rust core + Axum + Tauri | One collector/metrics implementation without bundling a Node sidecar. |
| Config-file-first desktop | Native file selection; secret files are read only by the backend. |
| One release version | Shared UI build, native app builds, and web images must identify the same source commit. User installations upgrade independently. |
| Original assets | System fonts, original SVG geometry/icons. No downloaded reference artwork or tracking code. |

## Execution and acceptance evidence

- Repository started without product files. Existing local tool configuration is preserved and ignored.
- Available: Node 24.13.0, Rust/Cargo 1.94.1, macOS Command Line Tools.
- Docker daemon is stopped; no container build/start has been attempted.
- GitHub currently lacks authentication for the intended pseudonymous publishing account. Public repository creation, pushes, and stacked PRs are blocked pending maintainer authentication.
- Apple/Windows signing and production updater identity/key/source are not configured. Public signed releases remain blocked.
- No real Knots node has been contacted; live-node acceptance is pending.
- Foundation: `cargo test --workspace` passed 9 tests; `cargo clippy --workspace --all-targets -- -D warnings` passed. Coverage currently includes config rejection/relative paths, monetary conversions, epoch boundaries, PoW sample boundaries, rollback/pre-activation RPC snapshots, request-ID/network mismatch, and HTTP host/origin/method boundaries.
- `npm audit` against the HTTPS public registry reported zero vulnerabilities after installation. jsdom 30 required a newer Node minor; selected compatible jsdom 27.4.0 instead. Direct dependency release dates were checked before installation. Transitive dependencies remain lockfile-pinned and need ongoing audit.
- Workspace frontend commands are scaffolded in the foundation; their UI tests/build land in the next stack slice. A planned gate is not a passing result.

## Planned stack

1. Bootstrap (license, project rules, engineering record).
2. Shared core, generated contracts, web HTTP boundary.
3. Shared circular dashboard and browser verification.
4. Native Tauri configuration, lifecycle, updates, and packaging.
5. Version/build/release automation and final validation.
