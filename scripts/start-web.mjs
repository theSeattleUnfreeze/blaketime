import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncEnvConfig } from "./sync-env-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const configPath = process.env.BLAKETIME_CONFIG
  ? resolve(process.env.BLAKETIME_CONFIG)
  : join(root, "blaketime.local.json");
const binary = join(
  root,
  "target",
  "release",
  `blaketime-web${process.platform === "win32" ? ".exe" : ""}`,
);

try {
  await access(envPath);
  await syncEnvConfig({ envPath, configPath });
} catch (error) {
  if (error && error.code !== "ENOENT") {
    process.stderr.write(
      `${error instanceof Error ? error.message : error}\n`,
    );
    process.exit(1);
  }
}

try {
  await access(binary, constants.X_OK);
} catch {
  process.stderr.write(
    `missing ${binary}\nrun: npm run build:ui && npm run build:web\n`,
  );
  process.exit(1);
}

const child = spawn(binary, [], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, BLAKETIME_CONFIG: configPath },
});
child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
