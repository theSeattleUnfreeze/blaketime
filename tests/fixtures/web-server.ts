import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { startFixture } from "./knots-rpc.ts";
const fixture = await startFixture();
const child = spawn(
  `./target/release/blaketime-web${process.platform === "win32" ? ".exe" : ""}`,
  [],
  {
    stdio: "inherit",
    env: { ...process.env, BLAKETIME_CONFIG: fixture.config },
  },
);
child.on("error", () => process.exit(1));
async function close() {
  child.kill("SIGINT");
  fixture.server.close();
  await rm(fixture.directory, { recursive: true, force: true });
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
child.on("exit", (code) => {
  void close().then(() => process.exit(code ?? 1));
});
