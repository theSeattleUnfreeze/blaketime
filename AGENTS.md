# Blaketime engineering rules

- Product: original Knots chain clock inspired by https://timechaincalendar.com/en. MIT; never copy the reference's code/assets or neop's unlicensed implementation.
- Reuse first: search before adding code. Shared Rust node/metrics logic belongs in packages/core; shared React UI belongs in packages/ui. Web HTTP and Tauri IPC are adapters, not independent implementations.
- No wallet operations, public RPC fallback, analytics, PoW implementation, or modifications to a user's node.
- Secrets stay in the native/server backend. Never read live environment/credential files with agent tools, log config/RPC bodies, expose secret paths in public DTOs, or commit local config.
- Publishing identity: theSeattleUnfreeze only. Verify GitHub identity before writes; never change Git configuration. Local commits must use the confirmed pseudonymous identity. No personal identities/paths in public artifacts.
- Work on topic branches; stacked PRs target their immediate parent. Preserve unrelated local changes. Do not rewrite history or force-push without explicit approval.
- Keep ENGINEERING.md current with assumptions, deviations, evidence, and blocked acceptance gates. No invented test results.
- Node 24 and pinned Rust are build tools; no Node runtime ships in production. Use lockfiles and maintained dependency versions at least seven days old.
- Code contains no new explanatory comments unless requested. UI English lives in the shared message catalog; preserve approved wording.
- Production never includes test WebDriver hooks, remote Tauri capabilities, arbitrary file/RPC commands, or unsigned update bypasses.
- Signing credentials, bundle identity, GitHub publication, and real-node verification are independent release gates. Do not publish unsigned development artifacts as trusted releases.
