# Blaketime

A Knots chain clock and dashboard for the web, macOS, and Windows, using your own node.

Blaketime connects directly to a compatible Knots node. The current neopd RPC endpoint does not expose all the methods this dashboard needs. Blaketime is read-only: it does not manage wallets, sign transactions, or broadcast transactions.

Original implementation inspired by [Timechain Calendar](https://timechaincalendar.com/en); no affiliation or endorsement is implied. See [ENGINEERING.md](ENGINEERING.md) for assumptions, verification evidence, and outstanding release gates.

## Desktop

Install the macOS or Windows build, open Settings, and choose a node configuration file. The desktop app does not require Node.js, Docker, or a Blaketime web server. Windows uses Microsoft WebView2; the installer may need to install it if it is missing.

Public signed installers are not available until release signing is configured. Local developer builds are produced with:

```sh
npm ci
npm run desktop:build
```

Build tools: Node 24 (see `.node-version`), the pinned Rust toolchain, and the platform prerequisites for Tauri. Bundles are written beneath `target/release/bundle`. macOS packaging skips Finder-only window-layout automation; it does not skip signing checks. The current minimum macOS target is 13.0; actual tested platforms are recorded in the engineering log.

## Node configuration

Copy `blaketime.example.json` to a private configuration file. Configure your node endpoint and expected network, then choose cookie-file authentication or a username and password-file reference. Keep configuration and secret files private. Choosing a file loads that configuration; after editing it outside the app, restart Blaketime.

Cookie authentication:

```json
{"type":"cookie","file":"/path/to/testnet4/.cookie"}
```

Password-file authentication:

```json
{"type":"password","username":"readonly","file":"/path/to/rpc-password"}
```

Relative credential paths resolve from the configuration file's directory. Never place credentials in the RPC URL. `main`, `testnet4`, and `regtest` are supported network profiles; regtest also requires an explicit `activationHeight` matching the node. Mainnet/testnet4 metadata is checked against the supported Knots baseline, not inferred from a node's name.

Configuration files are trusted inputs: review endpoint and credential-file references before selecting one. Do not import untrusted third-party configurations. Remote RPC should use TLS or a trusted private tunnel; `allowInsecureRpc` is an explicit opt-in for a trusted private HTTP connection, not a TLS-verification bypass.

Use dedicated read-only RPC permissions where the node supports them. The app calls only `getblockchaininfo`, `getblockhash`, `getdeploymentinfo`, `getblockheader`, `getblock`, `getblockstats`, `getnetworkinfo`, `getmempoolinfo`, `estimatesmartfee`, and `getnetworkhashps`.

## Run the web app locally

Building from source requires Node 24 and the pinned Rust toolchain.

```sh
npm ci
npm run build:ui
npm run build:web
BLAKETIME_CONFIG=./blaketime.local.json npm start
```

Open http://localhost:3000. The compiled `target/release/blaketime-web` binary can also be run directly without Node.js. If no configuration is supplied, the app displays its unconfigured state and does not contact a node.

## Docker

Configure the local configuration file and read-only secret mounts in `compose.yaml`, then run:

```sh
docker compose up --build
```

The published app port is bound to loopback. A node running on the host is not the container's localhost; configure the appropriate Docker host or service address. Inside the example container, credentials are mounted at `/run/secrets`; refer to those container paths in the node configuration.

The default process UID/GID is `10001:10001`. If needed, set `BLAKETIME_UID`/`BLAKETIME_GID` to a non-root identity that can read the mounted credentials. Do not make secrets world-readable. `BLAKETIME_CONFIG_PATH` and `BLAKETIME_SECRETS_DIR` select host mount sources; missing sources fail rather than creating misleading empty directories.

`local` is the source-building Docker target. `release` consumes the already-verified shared UI artifact, so web and native releases use the same UI bytes. Runtime images contain the Rust web server, not Node.js. `/healthz` is process liveness, not a claim that the node is synced or reachable.

## Updates

Web and desktop releases share one version and source commit. Desktop update checks contact GitHub and can be disabled in Settings. Updates are verified and installed only after confirmation; installation closes and restarts the app. Your node configuration and preferences are kept outside the application bundle.

For self-hosted web deployments, upgrade the container to the chosen release version or digest. Desktop and web installations do not force each other to upgrade. An old browser tab offers to reload when its server version changes.

Public signed installers and in-app updates require release signing to be configured. Development builds are not trusted public releases and do not use the production update channel.

## Security

Keep the node RPC private and use dedicated read-only RPC permissions. Do not expose the web app beyond loopback without an authenticated reverse proxy or a private access network. Set explicit allowed hosts when using a reverse proxy; do not enable permissive CORS.

Blaketime reads data from your node. It does not independently validate proof of work. Credentials remain in the web server or native desktop backend, not the UI. No public-node fallback or analytics.

Fee estimates and hashrate are estimates. Mempool and peer counts describe your node's view. Missing or pruned data is not replaced by invented values. Hashrate samples never cross the SHA-256d/Blake2b boundary.

## Development

Shared React UI lives in `packages/ui`, shared Rust node logic in `packages/core`, and generated public TypeScript types in `packages/contracts`. Web HTTP and desktop IPC are thin adapters; fix shared behavior once rather than copying changes between apps.

```sh
npm run types:check
npm run typecheck
npm run lint
npm test
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
npm run build:ui
npm run build:web
npm run test:e2e
npm run desktop:build:e2e
npm run test:desktop
npm run desktop:build
node scripts/verify-production.mjs
```

Use `npm run desktop:dev` for native development. Browser tests use a local simulated RPC server and the actual Rust HTTP host. Native tests use the actual Tauri app and an E2E-only embedded WebDriver, driven by Node's test runner. Production binaries exclude that driver. Playwright is pinned for this project's macOS 14 WebKit compatibility; see the engineering log before upgrading it.

Automated fixtures are not proof of mainnet compatibility. Live-node validation requires an operator-provided Knots testnet4 or isolated regtest node. Never use production wallets or private credentials in test fixtures.

## Releasing

```sh
npm run release:version -- 0.2.0
npm run release:check
```

The version command synchronizes npm workspaces/lockfile and Cargo workspace/lockfile. It does not commit, tag, push, or publish anything. Make and review the version commit, then create a matching tag through your approved git workflow.

The `Coordinated Release` workflow builds all five targets from one reviewed tag: three desktop architectures and two web-image architectures. It verifies the shared UI digest, platform signatures, updater signatures, and artifact completeness before finalization. Artifact download uses checksum enforcement; published asset URLs are version-specific. The finalizer refuses to replace a published release or overwrite a mismatched draft asset.

Run with `publish=false` to build signed candidates without publication. Test installation and signed upgrades for that version, then authorize publication. A protected `release` environment with required reviewers is mandatory. Configure these public values only after review:

| Variable | Purpose |
| --- | --- |
| `BLAKETIME_BUNDLE_ID` | Approved stable bundle ID, currently `org.blaketime.desktop` |
| `BLAKETIME_SIGNING_READY` | `true` only after publisher/signing readiness is approved |
| `BLAKETIME_UPDATE_KEY` | Tauri updater public key; never the private key |
| `BLAKETIME_INSTALL_TESTS_VERSION` | Exact version whose signed installer/upgrade acceptance passed |
| `BLAKETIME_WINDOWS_SIGN_COMMAND` | Approved, provisioned Windows signing-provider command |

Signing secrets belong in protected GitHub environment secrets, never the repository or chat. The workflow supports Tauri's Apple certificate/notarization inputs and a configured Windows signing command. The Windows signing provider/tool and credentials must be provisioned before enabling release signing; no provider or account is silently created. Apple/Windows certificates can expose legal publisher identity, so resolve pseudonymity requirements before provisioning them.

A first GHCR push may create a private package. Make the package publicly readable before promoting a public release; finalization verifies anonymous access and records the registry digest. GitHub and GHCR are not one atomic transaction: unadvertised versioned images may exist if later promotion fails, but the existing public desktop updater is not moved until all referenced artifacts exist.

Review third-party notices and the unsuppressed dependency-audit warnings before public binary distribution. Workflow code is not evidence that signing, Windows/Intel installation, or registry publication has been exercised locally.

## License

MIT for original Blaketime code. Dependencies retain their respective licenses.
