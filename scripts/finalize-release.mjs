import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import {
  root,
  product,
  git,
  repository,
  targets,
  readJson,
  validateArtifacts,
  updaterManifest,
  hashFile,
  publicImageDigest,
} from "./release-lib.mjs";
const { version } = await product(),
  commit = git("rev-parse", "HEAD"),
  repo = repository(process.env.GITHUB_REPOSITORY ?? "");
const directory = join(root, "dist/staged");
const artifacts = await Promise.all(
  targets.map((t) =>
    readJson(join(directory, `release-${t}`, "artifact.json")),
  ),
);
validateArtifacts(artifacts, version, commit, repo);
const signatures = {},
  assets = [];
for (const artifact of artifacts) {
  const folder = join(directory, `release-${artifact.target}`);
  for (const [name, hash] of Object.entries(artifact.files)) {
    const path = join(folder, name);
    assert.equal(await hashFile(path), hash, "artifact checksum mismatch");
    if (!artifact.target.startsWith("linux")) assets.push(path);
  }
  if (artifact.updater) {
    execFileSync(
      "cargo",
      [
        "run",
        "--quiet",
        "--locked",
        "-p",
        "blaketime-release-verify",
        "--",
        join(folder, artifact.updater),
        join(folder, `${artifact.updater}.sig`),
      ],
      { cwd: root, stdio: "inherit" },
    );
    signatures[artifact.target] = await readFile(
      join(folder, `${artifact.updater}.sig`),
      "utf8",
    );
  }
}
await mkdir(join(root, "dist/final"), { recursive: true });
await writeFile(
  join(root, "dist/final/latest.json"),
  JSON.stringify(
    updaterManifest(repo, version, artifacts, signatures),
    null,
    2,
  ) + "\n",
);
await writeFile(
  join(root, "dist/final/checksums.json"),
  JSON.stringify(
    { version, commit, uiDigest: artifacts[0].uiDigest, artifacts },
    null,
    2,
  ) + "\n",
);
if (!process.argv.includes("--publish")) {
  console.log("Artifacts verified; publication was not requested.");
  process.exit(0);
}
assert.equal(
  process.env.BLAKETIME_PUBLISH_APPROVED,
  "true",
  "publication approval is missing",
);
execFileSync(process.execPath, [join(root, "scripts/release-preflight.mjs")], {
  cwd: root,
  stdio: "inherit",
});
const gh = (...args) =>
  execFileSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const remote = JSON.parse(gh("api", `repos/${repo}`));
assert.equal(remote.private, false, "release repository must be public");
assert.equal(
  remote.permissions?.push,
  true,
  "release token lacks repository write access",
);
const environment = JSON.parse(gh("api", `repos/${repo}/environments/release`));
assert.ok(
  environment.protection_rules?.some(
    (rule) => rule.type === "required_reviewers" && rule.reviewers?.length,
  ),
  "release environment must require a reviewer",
);
let release = null;
try {
  release = JSON.parse(gh("api", `repos/${repo}/releases/tags/v${version}`));
} catch (error) {
  if (!String(error.stderr).includes("HTTP 404"))
    throw new Error("cannot verify existing release state");
}
assert.ok(!release || release.draft, "refusing to modify a published release");
for (const artifact of artifacts.filter((a) => a.archive)) {
  execFileSync(
    "docker",
    [
      "load",
      "--input",
      join(directory, `release-${artifact.target}`, artifact.archive),
    ],
    { stdio: "inherit" },
  );
  const labels = JSON.parse(
    execFileSync(
      "docker",
      [
        "image",
        "inspect",
        artifact.image,
        "--format",
        "{{json .Config.Labels}}",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(labels["org.opencontainers.image.version"], version);
  assert.equal(labels["org.opencontainers.image.revision"], commit);
  execFileSync("docker", ["push", artifact.image], { stdio: "inherit" });
}
const image = `ghcr.io/${repo.toLowerCase()}:${version}`;
execFileSync(
  "docker",
  [
    "buildx",
    "imagetools",
    "create",
    "--tag",
    image,
    ...artifacts.filter((a) => a.archive).map((a) => a.image),
  ],
  { stdio: "inherit" },
);
const imageDigest = await publicImageDigest(repo, version);
await writeFile(
  join(root, "dist/final/image.json"),
  JSON.stringify({ image, digest: imageDigest, version, commit }, null, 2) +
    "\n",
);
if (!release)
  gh(
    "release",
    "create",
    `v${version}`,
    "--repo",
    repo,
    "--verify-tag",
    "--draft",
    "--title",
    `Blaketime ${version}`,
    "--notes",
    `Shared web and desktop release. Source: ${commit}. Web image: ${image}@${imageDigest}.`,
  );
const pending = [];
for (const path of [
  ...assets,
  ...["latest.json", "checksums.json", "image.json"].map((n) =>
    join(root, "dist/final", n),
  ),
]) {
  const existing = release?.assets.find((a) => a.name === basename(path));
  if (existing)
    assert.equal(
      existing.digest,
      `sha256:${await hashFile(path)}`,
      "draft asset differs; resolve it explicitly before retrying",
    );
  else pending.push(path);
}
if (pending.length)
  gh("release", "upload", `v${version}`, "--repo", repo, ...pending);
gh(
  "release",
  "edit",
  `v${version}`,
  "--repo",
  repo,
  "--draft=false",
  "--latest",
);
console.log(`Published Blaketime ${version}.`);
