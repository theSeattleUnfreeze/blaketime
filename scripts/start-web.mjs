import { spawn } from "node:child_process";
const child = spawn(
  `./target/release/blaketime-web${process.platform === "win32" ? ".exe" : ""}`,
  [],
  { stdio: "inherit" },
);
child.on("error", () => process.exit(1));
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
