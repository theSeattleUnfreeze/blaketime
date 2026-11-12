import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  version,
  fileName,
  targets,
  desktopTargets,
  validateArtifacts,
  updaterManifest,
  uiInventory,
  digest,
  verifyUi,
} from "../../scripts/release-lib.mjs";
const commit = "a".repeat(40),
  hash = "b".repeat(64),
  uiDigest = "c".repeat(64);
function artifacts() {
  return targets.map((target) => {
    const common = { target, version: "0.1.0", commit, uiDigest };
    if (target in desktopTargets) {
      const updater = `${target}${target.startsWith("darwin") ? ".app.tar.gz" : ".exe"}`;
      const installer = target.startsWith("darwin") ? `${target}.dmg` : updater;
      return {
        ...common,
        platformSignatureVerified: true,
        updater,
        installer,
        files: { [updater]: hash, [`${updater}.sig`]: hash, [installer]: hash },
      };
    }
    const arch = target.slice(6),
      archive = `${target}.tar`;
    return {
      ...common,
      archive,
      image: `ghcr.io/theseattleunfreeze/blaketime:0.1.0-${arch}`,
      files: { [archive]: hash },
    };
  });
}
describe("release integrity", () => {
  it("accepts only canonical versions and safe filenames", () => {
    expect(version("1.2.3")).toBe("1.2.3");
    for (const v of ["v1.2.3", "1.2", "01.2.3", "1.2.70000", "1.0.0;echo bad"])
      expect(() => version(v)).toThrow();
    for (const name of ["../secret", "a/b.exe", "a\\b.exe", "a..exe"])
      expect(() => fileName(name)).toThrow();
  });
  it("requires every platform, consistent source/UI, and platform verification", () => {
    expect(() => validateArtifacts(artifacts(), "0.1.0", commit)).not.toThrow();
    expect(() =>
      validateArtifacts(artifacts().slice(1), "0.1.0", commit),
    ).toThrow();
    for (const field of [
      "version",
      "commit",
      "uiDigest",
      "platformSignatureVerified",
    ]) {
      const changed = artifacts();
      changed[0][field] =
        field === "platformSignatureVerified" ? false : "mismatch";
      expect(() => validateArtifacts(changed, "0.1.0", commit)).toThrow();
    }
  });
  it("creates immutable URLs and requires actual signature contents", () => {
    const signatures = Object.fromEntries(
      Object.keys(desktopTargets).map((t) => [t, "signature".repeat(12)]),
    );
    const manifest = updaterManifest(
      "theSeattleUnfreeze/blaketime",
      "0.1.0",
      artifacts(),
      signatures,
    );
    expect(Object.keys(manifest.platforms)).toHaveLength(3);
    expect(manifest.platforms["darwin-aarch64"].url).toContain(
      "/releases/download/v0.1.0/",
    );
    expect(() =>
      updaterManifest("theSeattleUnfreeze/blaketime", "0.1.0", artifacts(), {}),
    ).toThrow();
  });
  it("rejects changed UI files, dirty releases and symlink escape", async () => {
    const directory = await mkdtemp(join(tmpdir(), "blaketime-ui-test-"));
    try {
      await mkdir(join(directory, "assets"));
      await writeFile(join(directory, "index.html"), "test");
      await writeFile(join(directory, "assets/app.js"), "original");
      const files = await uiInventory(directory);
      const meta = {
        version: "0.1.0",
        commit,
        dirty: false,
        files,
        uiDigest: digest(JSON.stringify(files)),
      };
      await writeFile(join(directory, "build.json"), JSON.stringify(meta));
      await expect(verifyUi(directory, "0.1.0", commit, true)).resolves.toEqual(
        meta,
      );
      await writeFile(join(directory, "assets/app.js"), "changed");
      await expect(
        verifyUi(directory, "0.1.0", commit, true),
      ).rejects.toThrow();
      await writeFile(join(directory, "assets/app.js"), "original");
      await writeFile(
        join(directory, "build.json"),
        JSON.stringify({ ...meta, dirty: true }),
      );
      await expect(
        verifyUi(directory, "0.1.0", commit, true),
      ).rejects.toThrow();
      if (process.platform !== "win32") {
        await symlink(
          join(directory, "index.html"),
          join(directory, "assets/link"),
        );
        await expect(uiInventory(directory)).rejects.toThrow();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
