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
- Initial publication was blocked by missing authentication for the intended pseudonymous account. Authentication as `theSeattleUnfreeze` was verified on September 10, 2026, and the maintainer authorized repository creation, branch pushes, and stacked PRs. This resolves the source-publication gate, not the production signing or binary-release gates.
- Apple/Windows signing and production updater identity/key/source are not configured. Public signed releases remain blocked.
- Live Knots contact (2026-11-12): StartOS host `snowy-sip.local:57747` answers on **IPv4** (OpenSSL/curl TLS verify OK; authenticated tip `main` / 981589, Blake2b activation 961640 active). After fixes, local `blaketime-web` dashboard reported `state=connected`, tip height 981589, `headerVersion` 2, recent ring 145. Client blockers fixed in-tree: (1) AAAA records that refuse RPC — prefer IPv4 via `Client::resolve`; (2) rustls-platform-verifier “broken key size” on the StartOS cert despite OpenSSL trust — explicit `allowInsecureTls` / `RPC_TLS_INSECURE=1`; (3) post-activation headers expose `difficulty_blake2b` (pre-activation still `difficulty`) — Header decode accepts both via serde alias.
- Foundation: `cargo test --workspace` passed 9 tests; `cargo clippy --workspace --all-targets -- -D warnings` passed. Coverage currently includes config rejection/relative paths, monetary conversions, epoch boundaries, PoW sample boundaries, rollback/pre-activation RPC snapshots, request-ID/network mismatch, and HTTP host/origin/method boundaries.
- `npm audit` against the HTTPS public registry reported zero vulnerabilities after installation. jsdom 30 required a newer Node minor; selected compatible jsdom 27.4.0 instead. Direct dependency release dates were checked before installation. Transitive dependencies remain lockfile-pinned and need ongoing audit.
- Shared dashboard: original responsive SVG rings, live block/date display, node metrics, accessible native HTML settings dialog, preferences, safe errors, and HTTP/Tauri transport adapters are implemented. Mock data is confined to test fixtures.
- UI verification: TypeScript, ESLint, 5 Vitest tests, Vite production build, and Rust release web build passed. Chromium and WebKit E2E each passed all 4 scenarios (8 total) against the real Rust host and a fake RPC server. Final per-slice reruns are recorded through commits.
- Browser tooling correction: Playwright 1.62.1 failed before app navigation because its PushAPIEnabled protocol setting is unsupported by macOS 14's frozen WebKit. Verified that 1.60.0 lacks that unsupported setting, pinned it, and reran both engines successfully. This is frozen WebKit coverage, not a claim about latest Safari.
- Visual captures were reviewed at desktop and 390px mobile width. The clock uses container-relative typography; desktop height is bounded while mobile panels stack. Screenshots are generated test artifacts, not committed reference artwork.
- Corrected the hashrate caption to show its own RPC sample count (up to 120), distinct from the average-interval sample (up to 144). Target interval now comes from the Rust profile rather than separate UI constants.
- Native implementation: Tauri consumes the same UI and Rust collector, with explicit main-window IPC permissions, denied remote/new-window navigation, native config selection, atomic per-user settings, single-instance focus, and prompted updater state. The updater plugin is registered only when its compile-time source is configured; otherwise development builds start normally with updates disabled.
- Native verification: `cargo check -p blaketime-desktop`, 12 workspace Rust tests, 7 UI unit tests, and the native macOS E2E scenario passed. The native test exercises actual WKWebView/Rust IPC, permission denial, persisted preferences, disabled-update copy, and real collector tip changes against the fake RPC server. Native screenshots were reviewed.
- Native test tooling deviation: WebdriverIO's JavaScript dependency graph introduced 16 npm audit findings (including archive extraction issues). Removed that graph; Node's built-in test runner drives the official Rust embedded WebDriver over standard W3C endpoints. The driver is an optional E2E-only Cargo feature and capability; production does not include it. npm audit returned to zero findings.
- Tauri validates even inactive capability files during build. Test-driver capabilities therefore live only inline in the E2E config, outside the production capability scan. This preserves the production deny-by-default boundary rather than granting test permissions to production.
- An IDE buffer/filesystem conflict after external formatting initially hid Rust fixes from Cargo. The maintainer saved the affected Blaketime files; filesystem search and compilation then agreed. Verify disk state when using formatters followed by editor edits.
- The macOS application and arm64 DMG were built locally. Finder's cosmetic DMG AppleScript failed in this environment; the build helper uses Tauri's documented `CI=true` headless packaging behavior to skip only Finder layout, not signing/security checks. Public signing/notarization remains unconfigured.
- `cargo audit` returned no blocking advisories and seven unsuppressed warnings: proc-macro-error and UNIC crates are unmaintained; glib has an unsoundness warning. Target-filtered Cargo trees show glib absent from macOS/Windows desktop and the Linux web server. Track upstream maintenance; no audit-ignore policy was added.
- Configuration files are trusted operator inputs: they authorize the endpoint and credential-file references they contain. Do not import third-party configurations without reviewing them; use dedicated read-only RPC credentials where supported.
- Still unverified: Windows and Intel Mac execution/installation, real signed N-to-N+1 installation, production signing, and live Knots RPC. The local native E2E does not automate the OS file-picker selection itself; config loading and persistence have separate Rust tests.
- Release implementation: one version command updates npm and Cargo metadata; shared UI builds are inventoried and hashed; native and web artifacts carry the same version/commit/UI digest. Finalization requires every platform, checksums, platform signing verification, and independently verified Tauri signatures. It refuses published-release replacement and mismatched draft assets.
- Release tests: isolated version-bump integration, complete/mismatched platform inventories, UI tampering/symlink rejection, and real Tauri-generated signature/tamper verification passed. No production signing key was generated or read. GitHub workflow syntax passed Actionlint 1.7.12 (download checksum verified).
- Container definition uses digest-pinned Node/Rust/Debian build bases, a non-root Rust-only runtime, read-only mounts/root filesystem in Compose, and process health checks. SIGTERM shutdown and health probes have web-host coverage. Compose config validation passed; image build/runtime tests remain blocked by the stopped Docker daemon.
- Workflow behavior: candidates build without publication; public promotion requires a reviewed tag on main, protected-environment reviewer approval, signing readiness, and signed-installation acceptance for that exact version. First GHCR publication may need owner action to make the package public; promotion checks anonymous pull access. Signing-provider setup, third-party notices review, and actual cloud workflow execution remain release handoff items.
- Production executable inspection passed: the locally built native binary contains no test-driver or test-config markers. The native E2E build is separate and is never a release artifact.
- Final review found an unknown-error edge case: JavaScript prototype names could be mistaken for known error codes and crash the error banner. Added three failing regression cases and changed the lookup to own properties only; these now form part of the final test gate.
- A planned gate is not a passing result.

## Stack structure

| Branch | PR base | Concern |
| --- | --- | --- |
| `main` | Initial repository baseline | License, project rules, engineering record |
| `feat/shared-core` | `main` | Shared Rust service, contracts, HTTP boundary |
| `feat/shared-dashboard` | `feat/shared-core` | Shared circular dashboard and browser verification |
| `feat/tauri-desktop` | `feat/shared-dashboard` | Standalone native host, settings, updates, packaging |
| `feat/coordinated-releases` | `feat/tauri-desktop` | Coordinated builds, versioning, signatures, release gates |

Publish this stack bottom-up, with each PR targeting its immediate parent branch. Track current PR links and merge status in GitHub. Source-code publication does not imply that signed application releases or the remaining platform gates have passed.

## Final local review

The local review covered React, Rust/HTTP/IPC security boundaries, and build/release orchestration. No Next.js, Convex, Clerk, or inherited application design-system rules apply to this greenfield project. The unknown-error prototype lookup was reproduced with three failing tests and fixed. Final unit coverage is 16 JavaScript/tooling tests and 12 Rust tests, with 8 web browser scenarios and the native macOS scenario exercised separately. Publication/OS/signing gaps remain the explicit release gates above, not passing results.
