import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { root, readJson, version } from "./release-lib.mjs";
const next = version(process.argv[2] ?? "");
const paths = [
  "package.json",
  "packages/ui/package.json",
  "packages/contracts/package.json",
  "apps/desktop/package.json",
];
const changes = await Promise.all(
  paths.map(async (path) => [
    join(root, path),
    JSON.stringify(
      { ...(await readJson(join(root, path))), version: next },
      null,
      2,
    ) + "\n",
  ]),
);
const cargoPath = join(root, "Cargo.toml"),
  cargo = await readFile(cargoPath, "utf8");
const expression =
  /(\[workspace\.package\][\s\S]*?\nversion\s*=\s*")[^"]+("\n)/;
assert.ok(expression.test(cargo), "missing workspace version");
changes.push([cargoPath, cargo.replace(expression, (_, a, b) => a + next + b)]);
const npm = process.env.npm_execpath;
assert.ok(npm, "run this command through npm run release:version");
for (const [path, data] of changes) await writeFile(path, data);
for (const [command, args] of [
  [
    process.execPath,
    [
      npm,
      "install",
      "--package-lock-only",
      "--registry=https://registry.npmjs.org",
    ],
  ],
  ["cargo", ["update", "--workspace"]],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Prepared ${next}; no commit, tag, push, or release was created.`);
