import { createHash } from "node:crypto";
import { readFile, readdir, lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import assert from "node:assert/strict";
export const root = fileURLToPath(new URL("../", import.meta.url));
export const desktopTargets = {
  "darwin-aarch64": "aarch64-apple-darwin",
  "darwin-x86_64": "x86_64-apple-darwin",
  "windows-x86_64": "x86_64-pc-windows-msvc",
};
export const targets = [
  ...Object.keys(desktopTargets),
  "linux-amd64",
  "linux-arm64",
];
export const readJson = async (path) =>
  JSON.parse(await readFile(path, "utf8"));
export const product = () => readJson(join(root, "package.json"));
export const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
export function version(value) {
  assert.match(value, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.ok(
    value.split(".").every((n) => Number(n) <= 65535),
    "version exceeds platform limits",
  );
  return value;
}
export function repository(value) {
  assert.match(value, /^theSeattleUnfreeze\/[a-zA-Z0-9_.-]+$/);
  assert.ok(![".", ".."].includes(value.split("/")[1]));
  return value;
}
export function fileName(value) {
  assert.match(value, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
  assert.ok(!value.includes(".."), "unsafe artifact name");
  return value;
}
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const hashFile = async (path) => digest(await readFile(path));
export async function files(directory) {
  const found = [];
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry),
      stat = await lstat(path);
    assert.ok(!stat.isSymbolicLink(), "artifact symlinks are not allowed");
    if (stat.isDirectory()) found.push(...(await files(path)));
    else if (stat.isFile()) found.push(path);
  }
  return found.sort();
}
export async function uiInventory(directory) {
  const inventory = Object.create(null);
  for (const path of await files(directory)) {
    const name = relative(directory, path).replaceAll("\\", "/");
    assert.ok(
      !/(^|\/)\.env|\.(key|p8|p12|pfx|pem)$/.test(name),
      "credential-like file in UI output",
    );
    if (name !== "build.json") inventory[name] = await hashFile(path);
  }
  assert.ok(inventory["index.html"], "missing built UI");
  return { ...inventory };
}
export async function verifyUi(
  directory,
  expectedVersion,
  expectedCommit,
  release = false,
) {
  const meta = await readJson(join(directory, "build.json"));
  assert.equal(meta.version, expectedVersion, "UI version mismatch");
  if (expectedCommit)
    assert.equal(meta.commit, expectedCommit, "UI commit mismatch");
  if (release) {
    assert.equal(meta.dirty, false, "release UI came from a dirty tree");
    assert.match(meta.commit, /^[a-f0-9]{40}$/);
  }
  const inventory = await uiInventory(directory);
  assert.deepEqual(meta.files, inventory, "UI files were changed");
  assert.equal(
    meta.uiDigest,
    digest(JSON.stringify(inventory)),
    "UI digest mismatch",
  );
  return meta;
}
export function validateArtifacts(
  artifacts,
  expectedVersion,
  expectedCommit,
  repo,
) {
  assert.equal(artifacts.length, targets.length, "incomplete platform set");
  assert.deepEqual(
    artifacts.map((a) => a.target).sort(),
    [...targets].sort(),
    "missing or duplicate platform",
  );
  const names = new Set();
  const uiDigest = artifacts[0].uiDigest;
  assert.match(uiDigest, /^[a-f0-9]{64}$/);
  for (const artifact of artifacts) {
    assert.equal(artifact.version, version(expectedVersion));
    assert.equal(artifact.commit, expectedCommit);
    assert.match(artifact.commit, /^[a-f0-9]{40}$/);
    assert.equal(artifact.uiDigest, uiDigest, "platform UI mismatch");
    for (const [name, hash] of Object.entries(artifact.files)) {
      fileName(name);
      assert.match(hash, /^[a-f0-9]{64}$/);
      assert.ok(!names.has(name), "artifact collision");
      names.add(name);
    }
    let expected;
    if (artifact.target in desktopTargets) {
      assert.equal(
        artifact.platformSignatureVerified,
        true,
        "platform signing not verified",
      );
      const mac = artifact.target.startsWith("darwin");
      assert.ok(artifact.updater.endsWith(mac ? ".app.tar.gz" : ".exe"));
      assert.ok(artifact.installer.endsWith(mac ? ".dmg" : ".exe"));
      expected = [
        ...new Set([
          artifact.updater,
          `${artifact.updater}.sig`,
          artifact.installer,
        ]),
      ];
    } else {
      assert.ok(artifact.archive.endsWith(".tar"));
      assert.match(
        artifact.image,
        /^ghcr\.io\/theseattleunfreeze\/[a-z0-9_.-]+:[a-z0-9_.-]+$/,
      );
      if (repo)
        assert.equal(
          artifact.image,
          `ghcr.io/${repository(repo).toLowerCase()}:${expectedVersion}-${artifact.target.slice(6)}`,
        );
      expected = [artifact.archive];
    }
    assert.deepEqual(
      Object.keys(artifact.files).sort(),
      expected.sort(),
      "missing or unexpected artifact files",
    );
  }
}
export function updaterManifest(repo, releaseVersion, artifacts, signatures) {
  repository(repo);
  version(releaseVersion);
  const platforms = {};
  for (const target of Object.keys(desktopTargets)) {
    const artifact = artifacts.find((a) => a.target === target);
    assert.ok(artifact, "missing updater platform");
    const name = fileName(artifact.updater),
      signature = signatures[target];
    assert.equal(typeof signature, "string");
    assert.ok(signature.trim().length > 40, "missing signature content");
    platforms[target] = {
      url: `https://github.com/${repo}/releases/download/v${releaseVersion}/${name}`,
      signature: signature.trim(),
    };
  }
  return { version: releaseVersion, platforms };
}
export async function publicImageDigest(repo, releaseVersion) {
  const image = repository(repo).toLowerCase();
  version(releaseVersion);
  const query = new URLSearchParams({
    service: "ghcr.io",
    scope: `repository:${image}:pull`,
  });
  const auth = await fetch(`https://ghcr.io/token?${query}`, {
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(
    auth.ok,
    "GHCR package is not anonymously accessible; make it public before promotion",
  );
  const { token } = await auth.json();
  assert.equal(typeof token, "string");
  const response = await fetch(
    `https://ghcr.io/v2/${image}/manifests/${releaseVersion}`,
    {
      method: "HEAD",
      headers: {
        authorization: `Bearer ${token}`,
        accept:
          "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  assert.ok(response.ok, "public image manifest is unavailable");
  const value = response.headers.get("docker-content-digest");
  assert.match(value, /^sha256:[a-f0-9]{64}$/);
  return value;
}
