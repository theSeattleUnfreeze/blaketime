import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import assert from "node:assert/strict";
import { root, product, readJson, version } from "./release-lib.mjs";
const pkg = await product();
version(pkg.version);
const lock = await readJson(join(root, "package-lock.json"));
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[""].version, pkg.version);
for (const directory of ["packages/ui", "packages/contracts", "apps/desktop"]) {
  assert.equal(
    (await readJson(join(root, directory, "package.json"))).version,
    pkg.version,
    `${directory} version differs`,
  );
  assert.equal(
    lock.packages[directory].version,
    pkg.version,
    `${directory} lockfile version differs`,
  );
}
const cargo = await readFile(join(root, "Cargo.toml"), "utf8");
assert.equal(
  cargo.match(/\[workspace\.package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1],
  pkg.version,
  "Cargo version differs",
);
const metadata = JSON.parse(
  execFileSync(
    "cargo",
    ["metadata", "--format-version", "1", "--no-deps", "--locked"],
    { cwd: root, encoding: "utf8" },
  ),
);
for (const member of metadata.packages.filter((p) =>
  metadata.workspace_members.includes(p.id),
))
  assert.equal(member.version, pkg.version, "Rust workspace version differs");
const tauri = await readJson(
  join(root, "apps/desktop/src-tauri/tauri.conf.json"),
);
assert.equal(tauri.version, "../../../package.json");
assert.deepEqual(tauri.app.security.capabilities, ["main"]);
assert.equal(
  tauri.bundle.createUpdaterArtifacts,
  false,
  "base config must remain a development build",
);
if (process.env.BLAKETIME_RELEASE_TAG)
  assert.equal(
    process.env.BLAKETIME_RELEASE_TAG,
    `v${pkg.version}`,
    "tag/version mismatch",
  );
console.log(`version ${pkg.version}: consistent`);
