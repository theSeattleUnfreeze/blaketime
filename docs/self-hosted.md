# Self-hosted Blaketime

Operator guide for running Blaketime against your own Knots node. Complements the quick start in [README.md](../README.md). Placeholders (`STARTOS_HOST`, `LAN_IP`) stand in for real hostnames in public docs.

## What Blaketime needs

| Need | Notes |
| --- | --- |
| Knots JSON-RPC | Direct HTTPS/HTTP to the node. Not Electrum. Not `neopd`. |
| Auth | Cookie file **or** username + **password file** (password never in the URL or JSON value). |
| Network profile | `main`, `testnet4`, or `regtest` (regtest requires `activationHeight`). |
| TLS | Prefer HTTPS with a CA your OS trusts, or a private tunnel to loopback HTTP. |

RPC methods used (read-only): `getblockchaininfo`, `getblockhash`, `getdeploymentinfo`, `getblockheader`, `getblock`, `getblockstats`, `getnetworkinfo`, `getmempoolinfo`, `estimatesmartfee`, `getnetworkhashps`.

## Checkout (today)

Public `main` is the license/rules baseline. Product code lives on the stacked review branches. For a local run, check out the tip of the stack (currently `feat/coordinated-releases`) or a topic branch based on it:

```sh
git clone git@github.com-anon:theSeattleUnfreeze/blaketime.git
cd blaketime
git fetch origin
git checkout feat/coordinated-releases
```

Build tools: Node matching `.node-version` (fnm/nvm install that version first), pinned Rust from `rust-toolchain.toml`.

## StartOS Knots on the LAN

StartOS Bitcoin Knots RPC on the LAN is commonly port **57747**. Fulcrum Electrum SSL uses a **separate dynamic** port from Interfaces — do not reuse the Electrum URL for Blaketime.

1. On StartOS → Bitcoin Knots → Interfaces, copy the LAN RPC URL (`https://STARTOS_HOST:57747` or `https://LAN_IP:57747`).
2. Prefer the `.local` hostname when mDNS works and the certificate CN matches; use the LAN IP if mDNS fails (confirm TLS/SNI still verifies).
3. Create a dedicated **read-only** RPC user when the package supports it.
4. Prefer trusting the StartOS CA in the OS trust store. Blaketime uses rustls + platform verifier; some StartOS certs still fail with a “broken key size” error even when `openssl s_client` / curl verify OK. For a trusted LAN node, set `RPC_TLS_INSECURE=1` (writes `allowInsecureTls: true`). That is separate from `allowInsecureRpc`, which only allows non-loopback **HTTP**.

### `.env` → password-file sync (recommended on LAN)

The Rust runtime still authenticates with a **password file** (never credentials in the RPC URL). For local operators, copy `.env.example` to `.env` and set:

```sh
RPC_HOST=https://STARTOS_HOST:57747
RPC_USER=READONLY_RPC_USER
RPC_PASS=…          # single line; not logged by sync
# optional: RPC_NETWORK=main
# optional: RPC_LABEL=StartOS Knots
# StartOS LAN: RPC_TLS_INSECURE=1 if rustls rejects the cert
```

`npm start` (and `npm run config:sync`) read `.env` and write gitignored:

```text
./blaketime.local.json   # URL, network, username, pointer to password file
./secrets/rpc-password   # one line: password only (mode 600)
```

Do not commit `.env`. A shell-export file such as `~/.secrets` is not used directly as the auth `file` path.

Example private config (gitignored as `*.local.json`):

```json
{
  "schemaVersion": 1,
  "node": {
    "url": "https://STARTOS_HOST:57747/",
    "network": "main",
    "label": "StartOS Knots",
    "auth": {
      "type": "password",
      "username": "READONLY_RPC_USER",
      "file": "secrets/rpc-password"
    },
    "allowInsecureRpc": false,
    "allowInsecureTls": true
  },
  "server": {
    "bind": "127.0.0.1:3000",
    "allowedHosts": ["127.0.0.1:3000", "localhost:3000"]
  }
}
```

Relative credential paths resolve from the configuration file's directory. Compose mounts use `/run/blaketime/config.json` and `/run/secrets/...` instead — see `compose.yaml`.

### Cookie + tunnel (optional)

Cookie auth fits a local datadir or a StartOS-side cookie proxy exposed over SSH to loopback (neop’s Windows helper: `scripts/startos-knots-link.ps1` + `scripts/startos-rpc-auth-proxy.py` in the neop repo). On a Mac with LAN HTTPS and rpcuser/rpcpassword, password-file auth is the direct path; no tunnel required.

## Relationship to neop / Scoop

Scoop (in the neop workspace) catalogs UTXOs via **Fulcrum / Shulcrum (Electrum)**. Blaketime is a **Knots JSON-RPC** chain clock. Same StartOS host can serve both:

| Client | Protocol | Typical StartOS surface |
| --- | --- | --- |
| Scoop / Shrike | Electrum SSL | Fulcrum Interfaces (dynamic port) |
| Blaketime | Knots JSON-RPC | Bitcoin Knots LAN RPC (`:57747`) |

A full dual-flavor `neopd` + shared archive on Linux is **not** required to run Blaketime. Scoop running against remote Electrum peers does not imply a local dual-node Docker stack is up.

## Local web run

```sh
cp .env.example .env
# set RPC_HOST, RPC_USER, RPC_PASS
npm ci
npm run build:ui
npm run build:web
npm start
```

`npm start` syncs `.env` into `blaketime.local.json` + `secrets/rpc-password`, then launches the release binary with `BLAKETIME_CONFIG` set. Open http://127.0.0.1:3000. Without `.env` / config, the app stays unconfigured and does not contact a node.

Desktop: Settings → choose the generated `blaketime.local.json` (or any private config file).

## Setup friction observed (improve next)

| Friction | Improvement |
| --- | --- |
| `main` has no runnable app | Document tip-branch checkout until the stack merges; or cut a tagged preview. |
| Password must be a file | Prefer `.env` → `npm run config:sync` / `npm start` writing `./secrets/rpc-password` (gitignored). |
| StartOS CA / `.local` vs IP | Short TLS checklist (hostname match, trust store, OpenSSL s_client). |
| Confused with Electrum / Scoop | Explicit “not Electrum” callout in README + this doc. |
| Docker daemon optional | Keep native `npm start` / desktop as the primary Mac path; Compose for Linux hosts. |
| fnm/nvm must install `.node-version` | Mention in README before `npm ci`. |
| `.local` publishes broken AAAA | Blaketime pins IPv4 when resolving the RPC host; `curl -6` failing while `curl -4` works is the signal. |

## Acceptance checklist (live node)

- [ ] Config loads without `InvalidConfig`
- [ ] `/healthz` is process-up only; dashboard shows tip/height from Knots
- [ ] Wrong password → safe error, no credential leakage in UI/logs
- [ ] Network profile matches the node (`main` vs `testnet4`)
- [ ] Recent-block ring populates from real headers (not fixtures)
- [ ] Record evidence in [ENGINEERING.md](../ENGINEERING.md) (do not invent pass results)
