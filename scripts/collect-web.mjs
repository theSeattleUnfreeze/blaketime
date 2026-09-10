import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  product,
  root,
  git,
  repository,
  hashFile,
  verifyUi,
} from "./release-lib.mjs";
const arch = process.argv[2];
assert.ok(["amd64", "arm64"].includes(arch));
const { version } = await product(),
  commit = git("rev-parse", "HEAD");
const repo = repository(process.env.GITHUB_REPOSITORY ?? "").toLowerCase();
const ui = await verifyUi(join(root, "dist/ui"), version, commit, true);
const target = `linux-${arch}`,
  archive = `Blaketime_${version}_${target}.tar`,
  out = join(root, "dist/release", target);
await mkdir(out, { recursive: true });
const hash = await hashFile(join(out, archive));
await writeFile(
  join(out, "artifact.json"),
  JSON.stringify(
    {
      target,
      version,
      commit,
      uiDigest: ui.uiDigest,
      image: `ghcr.io/${repo}:${version}-${arch}`,
      archive,
      files: { [archive]: hash },
    },
    null,
    2,
  ) + "\n",
);
