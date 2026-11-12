import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("@tauri-apps/cli")), "tauri.js");
const result = spawnSync(
  process.execPath,
  [cli, "build", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, CI: "true" } },
);
process.exit(result.status ?? 1);
