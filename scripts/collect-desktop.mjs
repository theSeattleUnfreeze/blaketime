import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import {
  root,
  product,
  git,
  desktopTargets,
  files,
  hashFile,
  verifyUi,
} from "./release-lib.mjs";
const target = process.argv[2],
  triple = desktopTargets[target];
assert.ok(triple, "unsupported desktop target");
const { version } = await product(),
  commit = git("rev-parse", "HEAD");
const ui = await verifyUi(join(root, "dist/ui"), version, commit, true);
const directory = join(root, "target", triple, "release/bundle");
execFileSync(
  process.execPath,
  [
    join(root, "scripts/verify-production.mjs"),
    join(
      root,
      "target",
      triple,
      "release",
      `blaketime-desktop${target.startsWith("windows") ? ".exe" : ""}`,
    ),
  ],
  { stdio: "inherit" },
);
const inventory = await files(directory);
const one = (suffix) => {
  const matched = inventory.filter((p) => p.endsWith(suffix));
  assert.equal(matched.length, 1, `expected one ${suffix}`);
  return matched[0];
};
const updater = one(target.startsWith("darwin") ? ".app.tar.gz" : ".exe");
const installer = target.startsWith("darwin") ? one(".dmg") : updater;
const signature = one(
  target.startsWith("darwin") ? ".app.tar.gz.sig" : ".exe.sig",
);
execFileSync(
  "cargo",
  [
    "run",
    "--quiet",
    "--locked",
    "-p",
    "blaketime-release-verify",
    "--",
    updater,
    signature,
  ],
  { cwd: root, stdio: "inherit" },
);
if (target.startsWith("darwin")) {
  const app = join(directory, "macos/Blaketime.app");
  for (const [command, args] of [
    ["codesign", ["--verify", "--deep", "--strict", app]],
    ["spctl", ["--assess", "--type", "execute", app]],
    ["xcrun", ["stapler", "validate", app]],
  ])
    execFileSync(command, args, { stdio: "inherit" });
} else {
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-File",
      join(root, "scripts/verify-windows.ps1"),
      "-Installer",
      installer,
      "-Binary",
      join(root, "target", triple, "release/blaketime-desktop.exe"),
    ],
    { stdio: "inherit" },
  );
}
const out = join(root, "dist/release", target);
await mkdir(out, { recursive: true });
const name = `Blaketime_${version}_${target}`;
const updaterName =
  name + (target.startsWith("darwin") ? ".app.tar.gz" : ".exe");
const installerName = name + (target.startsWith("darwin") ? ".dmg" : ".exe");
const manifest = {
  target,
  version,
  commit,
  uiDigest: ui.uiDigest,
  platformSignatureVerified: true,
  updater: updaterName,
  installer: installerName,
  files: {},
};
for (const [source, dest] of [
  [updater, updaterName],
  [signature, `${updaterName}.sig`],
  [installer, installerName],
]) {
  await copyFile(source, join(out, dest));
  manifest.files[basename(dest)] = await hashFile(join(out, dest));
}
await writeFile(
  join(out, "artifact.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
