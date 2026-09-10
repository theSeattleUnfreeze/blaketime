import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const path = resolve(
  process.argv[2] ??
    `target/release/blaketime-desktop${process.platform === "win32" ? ".exe" : ""}`,
);
const bytes = await readFile(path);
assert.ok(bytes.length > 100000, "unexpected executable size");
const magic = bytes.subarray(0, 4).toString("hex");
assert.ok(
  ["cffaedfe", "feedfacf", "cafebabe", "bebafeca", "7f454c46"].includes(
    magic,
  ) || bytes.subarray(0, 2).toString() === "MZ",
  "unknown executable format",
);
for (const marker of [
  "TAURI_WEBDRIVER_PORT",
  "BLAKETIME_TEST_CONFIG",
  "BLAKETIME_TEST_DATA_DIR",
  "test-only:fixture",
]) {
  assert.ok(
    !bytes.includes(Buffer.from(marker)),
    `production contains test instrumentation: ${marker}`,
  );
}
console.log("Production executable excludes test hooks.");
