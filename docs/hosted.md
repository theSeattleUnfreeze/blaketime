# Hosted Blaketime (proposed)

Status: **not implemented**. Current product architecture is self-hosted only: Rust Axum (or Tauri) talks to **your** Knots node, secrets stay in the native/server backend, and HTTP responses use `cache-control: no-store`. There is no public-node fallback.

This document sketches a hosted deployment so a public web UI (for example on Vercel) can stay fast without every visitor hitting a personal VPS or StartOS Knots RPC.

## Goal

- **Public site** on Vercel (static UI or edge/serverless BFF).
- **Backend cache** filled from the operator’s personal Knots node.
- **Personal node** is not opened to the internet and does not serve every page view.

## Why the current app cannot sit on Vercel as-is

| Constraint today | Hosted implication |
| --- | --- |
| Collector is a long-lived Rust process with a private RPC URL + credential files | Vercel serverless has no durable local secret files and no always-on process talking to LAN StartOS |
| Knots on home/StartOS LAN is not reachable from Vercel | Needs an operator-run collector or a private tunnel into the node |
| No public RPC fallback (product rule) | Cache misses must degrade honestly, not call a third-party explorer RPC |
| `no-store` on live RPC-backed responses | Public CDN caching requires a **deliberate** cached snapshot API with TTLs and trust boundaries |

Treat hosted mode as a **new adapter**, not a config flag on the self-hosted binary.

## Proposed shape

```text
[StartOS / VPS Knots]
        ^  JSON-RPC (private)
        |
[Operator collector]  --writes-->  [Snapshot store]
   (always-on mini host)              Redis / KV / Blob / DB
        ^                               |
        | poll / push                   | read-only API
        |                               v
   secrets stay here              [Vercel UI / BFF]
                                  (no Knots credentials)
```

### 1. Operator collector (trusted)

Runs where the node is reachable: same LAN as StartOS, the VPS that peers with Knots, or a small always-on host with a private tunnel.

Responsibilities:

- Reuse `packages/core` snapshot/metrics logic (same contracts as desktop/web).
- Authenticate to Knots with cookie or password **file** (same rules as self-host).
- Publish **sanitized snapshots** on a schedule (for example every 15–60s) to the snapshot store.
- Never expose raw RPC, wallet RPCs, or credential material.

Optional: the existing self-hosted `blaketime-web` binary could grow a `publish-snapshot` mode; a separate `blaketime-collector` crate is fine if it keeps the same contracts.

### 2. Snapshot store

Holds the last good dashboard payload (tip, recent headers ring, mempool summary, fee/hashrate samples already computed by core).

Suggested fields beyond the public DTO:

- `collectedAt`, `nodeLabel` (non-identifying), `network`, `schemaVersion`
- `stalenessMs` / `expiresAt` for honest UI copy when the collector is down

Storage options (pick one; keep it boring):

- Vercel KV / Upstash Redis
- Object storage (Blob/S3) with a single `latest.json` + short history
- Postgres row `snapshots(id, payload, collected_at)`

### 3. Vercel host

- **UI:** build from `packages/ui` (same visuals as self-host). Prefer static assets + client fetch to a read API, or a thin Route Handler that only reads the snapshot store.
- **No** `BITCOIN_RPC_*` / Knots URL in Vercel env for the public project.
- Auth to the snapshot store: public read of non-sensitive chain metrics **or** a low-privilege read token if you want to keep the mirror semi-private.
- On miss/stale: show the last snapshot with a visible “last updated” / degraded state — never fall back to a random public node.

### 4. Caching policy

| Layer | Policy |
| --- | --- |
| Collector → Knots | Private; rate-limit; read-only RPC user |
| Snapshot store | TTL aligned with poll interval; retain last-good on failure |
| Vercel CDN / `Cache-Control` | Short public cache (for example 10–30s) on the **snapshot API** only |
| Self-hosted live mode | Remains `no-store` when proxying live RPC |

Hashrate samples must still respect the SHA-256d / Blake2b boundary already enforced in core.

## Threat model (hosted)

| Risk | Mitigation |
| --- | --- |
| Knots RPC reachable from the internet | Keep RPC on LAN/VPN; collector initiates outbound or uses SSH/WireGuard |
| Vercel project leak exposes node credentials | Credentials never enter Vercel; only snapshot read credentials if any |
| Stale or forged snapshots | Sign or HMAC payloads from the collector; pin collector identity; show staleness |
| Privacy of node label / peer info | Strip identifying fields before publish; generic public label |
| Confusion with “official” chain clock | Clear copy: mirror of **one** operator node’s view, not network consensus proof |

Blaketime still does **not** independently validate proof of work. Hosted mode does not change that.

## What not to do

- Point the current Axum server’s Knots URL at a home node from Vercel.
- Put rpc passwords in Vercel environment variables “just for SSR”.
- Use mempool.space / other explorers as a silent fallback when the collector is down.
- Claim hosted metrics are more authoritative than self-host; they are a delayed mirror.

## Implementation slices (when prioritized)

1. Define a versioned `PublicSnapshot` contract (subset of today’s UI DTO + staleness metadata).
2. Collector binary or web mode: load config → build snapshot → PUT to store.
3. Read API + Vercel UI wired to `packages/ui` in “mirror” transport mode.
4. Runbooks: collector systemd/Docker next to the node; rotate store tokens; failure banners.
5. Document that self-host remains the sovereignty-default path; hosted is convenience mirroring.

## Decision log

| Decision | Default proposal |
| --- | --- |
| Where credentials live | Only on the collector host |
| Who serves browsers | Vercel reads snapshots only |
| Relation to self-host | Shared UI + core math; different transport adapter |
| Product priority | Optional; does not block self-hosted live-node acceptance |
