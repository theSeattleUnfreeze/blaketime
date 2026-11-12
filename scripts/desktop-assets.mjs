import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { root, product, git, verifyUi } from "./release-lib.mjs";
if (process.env.BLAKETIME_PREBUILT_UI === "1") {
  await verifyUi(
    join(root, "dist/ui"),
    (await product()).version,
    process.env.BLAKETIME_COMMIT || git("rev-parse", "HEAD"),
    process.env.BLAKETIME_RELEASE === "1",
  );
} else {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "build:ui"],
    { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
