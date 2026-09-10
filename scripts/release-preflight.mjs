import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  root,
  product,
  repository,
  version,
  git,
  verifyUi,
} from "./release-lib.mjs";
const env = process.env;
const repo = repository(env.GITHUB_REPOSITORY ?? "");
const pkg = await product();
version(pkg.version);
assert.equal(env.BLAKETIME_RELEASE_TAG, `v${pkg.version}`);
assert.equal(git("status", "--porcelain"), "", "release requires a clean tree");
assert.equal(
  git("rev-parse", `${env.BLAKETIME_RELEASE_TAG}^{commit}`),
  git("rev-parse", "HEAD"),
);
git("merge-base", "--is-ancestor", "HEAD", "origin/main");
assert.equal(
  env.BLAKETIME_SIGNING_READY,
  "true",
  "signing/publisher approval is pending",
);
if (!process.argv[2])
  assert.equal(
    env.BLAKETIME_INSTALL_TESTS_VERSION,
    pkg.version,
    "signed installation acceptance for this version is pending",
  );
assert.ok(env.BLAKETIME_UPDATE_KEY?.trim(), "missing updater public key");
assert.equal(
  env.BLAKETIME_BUNDLE_ID,
  "org.blaketime.desktop",
  "bundle identity must be approved",
);
const url = `https://github.com/${repo}/releases/latest/download/latest.json`;
if (env.BLAKETIME_PREBUILT_UI === "1")
  await verifyUi(
    join(root, "dist/ui"),
    pkg.version,
    git("rev-parse", "HEAD"),
    true,
  );
const target = process.argv[2];
if (target) {
  for (const name of [
    "TAURI_SIGNING_PRIVATE_KEY",
    ...(target.startsWith("darwin")
      ? [
          "APPLE_SIGNING_IDENTITY",
          "APPLE_CERTIFICATE",
          "APPLE_CERTIFICATE_PASSWORD",
          "APPLE_API_ISSUER",
          "APPLE_API_KEY",
          "APPLE_API_KEY_PATH",
        ]
      : ["BLAKETIME_WINDOWS_SIGN_COMMAND"]),
  ]) {
    assert.ok(env[name]?.trim(), `missing signing configuration: ${name}`);
  }
  await mkdir(join(root, "dist"), { recursive: true });
  const config = {
    bundle: {
      createUpdaterArtifacts: true,
      ...(target.startsWith("windows")
        ? { windows: { signCommand: env.BLAKETIME_WINDOWS_SIGN_COMMAND } }
        : {}),
    },
    plugins: {
      updater: { pubkey: env.BLAKETIME_UPDATE_KEY, endpoints: [url] },
    },
  };
  await writeFile(
    join(root, "dist/tauri-release.json"),
    JSON.stringify(config),
  );
}
console.log(
  JSON.stringify({
    version: pkg.version,
    commit: git("rev-parse", "HEAD"),
    repository: repo,
    updateUrl: url,
  }),
);
