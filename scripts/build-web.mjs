import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
delete env.CARGO_TARGET_DIR;
const result = spawnSync(
  "cargo",
  ["build", "--release", "--locked", "-p", "blaketime-web"],
  { cwd: root, env, stdio: "inherit" },
);
if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}
if (result.status) process.exit(result.status);

const binary = join(
  root,
  "target",
  "release",
  `blaketime-web${process.platform === "win32" ? ".exe" : ""}`,
);
try {
  accessSync(binary, constants.X_OK);
} catch {
  process.stderr.write(`build finished but missing ${binary}\n`);
  process.exit(1);
}
