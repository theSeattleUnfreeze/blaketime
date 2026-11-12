import { it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { root } from "../../scripts/release-lib.mjs";
const require = createRequire(import.meta.url);
it("verifies Tauri signatures and rejects a tampered artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blaketime-sign-test-"));
  try {
    const cli = join(dirname(require.resolve("@tauri-apps/cli")), "tauri.js");
    const key = join(directory, "test.key"),
      artifact = join(directory, "artifact.bin");
    execFileSync(
      process.execPath,
      [cli, "signer", "generate", "--ci", "-p", "", "-w", key],
      { stdio: "pipe" },
    );
    await writeFile(artifact, "test-only release artifact");
    execFileSync(
      process.execPath,
      [cli, "signer", "sign", "-f", key, "-p", "", artifact],
      { stdio: "pipe" },
    );
    const publicKey = (await readFile(`${key}.pub`, "utf8")).trim();
    const verify = () =>
      spawnSync(
        "cargo",
        [
          "run",
          "--quiet",
          "--locked",
          "-p",
          "blaketime-release-verify",
          "--",
          artifact,
          `${artifact}.sig`,
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: { ...process.env, BLAKETIME_UPDATE_KEY: publicKey },
        },
      );
    expect(verify().status).toBe(0);
    await writeFile(artifact, "tampered");
    expect(verify().status).not.toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
