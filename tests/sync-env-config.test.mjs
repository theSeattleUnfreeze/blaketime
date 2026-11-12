import { it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseEnv,
  buildLocalConfig,
  syncEnvConfig,
} from "../scripts/sync-env-config.mjs";

it("parses KEY=value lines and ignores comments", () => {
  const env = parseEnv(
    "# comment\nRPC_HOST=https://example.local:57747\nRPC_USER=alice\nRPC_PASS=s3cret\n",
  );
  expect(env.RPC_HOST).toBe("https://example.local:57747");
  expect(env.RPC_USER).toBe("alice");
  expect(env.RPC_PASS).toBe("s3cret");
});

it("builds password-file config without embedding the password", () => {
  const config = buildLocalConfig({
    host: "https://example.local:57747",
    username: "alice",
  });
  expect(config.node.url).toBe("https://example.local:57747/");
  expect(config.node.auth).toEqual({
    type: "password",
    username: "alice",
    file: "secrets/rpc-password",
  });
  expect(JSON.stringify(config)).not.toContain("s3cret");
});

it("writes config and password file from .env without logging secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blaketime-env-sync-"));
  try {
    const envPath = join(directory, ".env");
    const configPath = join(directory, "blaketime.local.json");
    const passwordPath = join(directory, "secrets", "rpc-password");
    await writeFile(
      envPath,
      "RPC_HOST=https://example.local:57747\nRPC_USER=alice\nRPC_PASS=s3cret\n",
      { mode: 0o600 },
    );
    await syncEnvConfig({ envPath, configPath, passwordPath });
    const config = JSON.parse(await readFile(configPath, "utf8"));
    expect(config.node.url).toBe("https://example.local:57747/");
    expect(config.node.auth.username).toBe("alice");
    expect(config.node.auth.file).toBe("secrets/rpc-password");
    expect(await readFile(passwordPath, "utf8")).toBe("s3cret\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects missing RPC fields without echoing values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blaketime-env-miss-"));
  try {
    const envPath = join(directory, ".env");
    await writeFile(envPath, "RPC_HOST=https://example.local:57747\n", {
      mode: 0o600,
    });
    await expect(
      syncEnvConfig({
        envPath,
        configPath: join(directory, "blaketime.local.json"),
        passwordPath: join(directory, "secrets", "rpc-password"),
      }),
    ).rejects.toThrow(/missing RPC_HOST, RPC_USER, or RPC_PASS/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects an invalid RPC_HOST without echoing it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blaketime-env-badhost-"));
  try {
    const envPath = join(directory, ".env");
    await writeFile(
      envPath,
      "RPC_HOST=https://example.local:57747I\nRPC_USER=alice\nRPC_PASS=s3cret\n",
      { mode: 0o600 },
    );
    await expect(
      syncEnvConfig({
        envPath,
        configPath: join(directory, "blaketime.local.json"),
        passwordPath: join(directory, "secrets", "rpc-password"),
      }),
    ).rejects.toThrow(/RPC_HOST is not a valid URL/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
