import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { root, readJson } from "../../scripts/release-lib.mjs";
it("bumps an isolated workspace without committing or touching the real project", async () => {
  const before = await readFile(join(root, "package.json"), "utf8");
  const directory = await mkdtemp(join(tmpdir(), "blaketime-version-test-"));
  try {
    for (const path of [
      "scripts",
      "packages/ui",
      "packages/contracts",
      "apps/desktop",
      "core/src",
    ])
      await mkdir(join(directory, path), { recursive: true });
    for (const name of ["version.mjs", "release-lib.mjs"])
      await copyFile(
        join(root, "scripts", name),
        join(directory, "scripts", name),
      );
    await copyFile(
      join(root, "rust-toolchain.toml"),
      join(directory, "rust-toolchain.toml"),
    );
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "version-fixture",
        version: "0.1.0",
        private: true,
        type: "module",
        workspaces: ["packages/*", "apps/*"],
      }),
    );
    for (const [path, name] of [
      ["packages/ui", "ui"],
      ["packages/contracts", "contracts"],
      ["apps/desktop", "desktop"],
    ])
      await writeFile(
        join(directory, path, "package.json"),
        JSON.stringify({
          name: `@fixture/${name}`,
          version: "0.1.0",
          private: true,
        }),
      );
    await writeFile(
      join(directory, "Cargo.toml"),
      '[workspace]\nmembers=["core"]\nresolver="2"\n[workspace.package]\nversion = "0.1.0"\nedition="2024"\n',
    );
    await writeFile(
      join(directory, "core/Cargo.toml"),
      '[package]\nname="version-fixture"\nversion.workspace=true\nedition.workspace=true\n',
    );
    await writeFile(join(directory, "core/src/lib.rs"), "");
    const run = spawnSync(
      process.execPath,
      [join(directory, "scripts/version.mjs"), "0.2.0"],
      { cwd: directory, encoding: "utf8", env: process.env },
    );
    expect(run.status, run.stderr).toBe(0);
    for (const path of [
      "",
      "packages/ui",
      "packages/contracts",
      "apps/desktop",
    ])
      expect(
        (await readJson(join(directory, path, "package.json"))).version,
      ).toBe("0.2.0");
    expect((await readJson(join(directory, "package-lock.json"))).version).toBe(
      "0.2.0",
    );
    expect(await readFile(join(directory, "Cargo.lock"), "utf8")).toContain(
      'version = "0.2.0"',
    );
    const invalid = spawnSync(
      process.execPath,
      [join(directory, "scripts/version.mjs"), "bad-version"],
      { cwd: directory, encoding: "utf8", env: process.env },
    );
    expect(invalid.status).not.toBe(0);
    expect((await readJson(join(directory, "package.json"))).version).toBe(
      "0.2.0",
    );
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
