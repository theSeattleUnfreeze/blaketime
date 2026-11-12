import { mkdir, writeFile, chmod, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseEnv(text) {
  const out = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function buildLocalConfig({
  host,
  username,
  passwordFile = "secrets/rpc-password",
  network = "main",
  label = "StartOS Knots",
  allowInsecureTls = false,
}) {
  const url = host.endsWith("/") ? host : `${host}/`;
  return {
    schemaVersion: 1,
    node: {
      url,
      network,
      label,
      auth: {
        type: "password",
        username,
        file: passwordFile,
      },
      allowInsecureRpc: false,
      allowInsecureTls: Boolean(allowInsecureTls),
    },
    server: {
      bind: "127.0.0.1:3000",
      allowedHosts: ["127.0.0.1:3000", "localhost:3000"],
    },
  };
}

export async function syncEnvConfig({
  envPath = join(root, ".env"),
  configPath = join(root, "blaketime.local.json"),
  passwordPath = join(root, "secrets", "rpc-password"),
} = {}) {
  await access(envPath);
  const env = parseEnv(readFileSync(envPath, "utf8"));
  const host = env.RPC_HOST?.trim();
  const username = env.RPC_USER?.trim();
  const password = env.RPC_PASS;
  if (!host || !username || password === undefined || password === "") {
    throw new Error(
      "missing RPC_HOST, RPC_USER, or RPC_PASS in .env (values are not logged)",
    );
  }
  if (username.includes(":") || /[\n\r]/.test(username)) {
    throw new Error("RPC_USER contains unsupported characters");
  }
  if (/[\n\r]/.test(password)) {
    throw new Error("RPC_PASS must be a single line");
  }
  let parsedHost;
  try {
    parsedHost = new URL(host.endsWith("/") ? host : `${host}/`);
  } catch {
    throw new Error(
      "RPC_HOST is not a valid URL (example: https://snowy-sip.local:57747)",
    );
  }
  if (!["http:", "https:"].includes(parsedHost.protocol)) {
    throw new Error("RPC_HOST must use http or https");
  }
  if (parsedHost.username || parsedHost.password) {
    throw new Error("RPC_HOST must not include credentials; use RPC_USER/RPC_PASS");
  }
  if (!parsedHost.hostname) {
    throw new Error("RPC_HOST is missing a hostname");
  }
  const network = (env.RPC_NETWORK || "main").trim();
  if (!["main", "testnet4", "regtest"].includes(network)) {
    throw new Error("RPC_NETWORK must be main, testnet4, or regtest");
  }
  const label = (env.RPC_LABEL || "StartOS Knots").trim();
  if (!label || label.length > 80) {
    throw new Error("RPC_LABEL must be 1–80 characters");
  }
  const insecureTls = ["1", "true", "yes", "on"].includes(
    String(env.RPC_TLS_INSECURE || "").trim().toLowerCase(),
  );
  const relativePassword = "secrets/rpc-password";
  const config = buildLocalConfig({
    host: parsedHost.toString(),
    username,
    passwordFile: relativePassword,
    network,
    label,
    allowInsecureTls: insecureTls,
  });
  await mkdir(dirname(passwordPath), { recursive: true });
  await writeFile(passwordPath, `${password}\n`, { mode: 0o600 });
  await chmod(passwordPath, 0o600);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  return { configPath, passwordPath };
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) {
  syncEnvConfig()
    .then(({ configPath }) => {
      process.stderr.write(`wrote ${configPath} from .env\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
      process.exit(1);
    });
}
