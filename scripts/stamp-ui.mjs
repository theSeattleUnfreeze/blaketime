import { writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { root, product, git, uiInventory, digest } from "./release-lib.mjs";
const { version } = await product();
let commit = "development",
  dirty = true;
try {
  commit = git("rev-parse", "HEAD");
  dirty = git("status", "--porcelain").length > 0;
} catch {
  dirty = true;
}
const inventory = await uiInventory(join(root, "dist/ui"));
const uiDigest = digest(JSON.stringify(inventory));
await writeFile(
  join(root, "dist/ui/build.json"),
  JSON.stringify(
    { schemaVersion: 1, version, commit, dirty, uiDigest, files: inventory },
    null,
    2,
  ) + "\n",
);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `version=${version}\ncommit=${commit}\nuiDigest=${uiDigest}\n`,
  );
