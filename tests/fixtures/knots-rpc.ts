import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export async function startFixture(port = 48193, appPort = 4173) {
  const initialHeight = 150987;
  const initialTime = Math.floor(Date.now() / 1000) - 549;
  let tip = initialHeight,
    generation = 0,
    scenario = "connected";
  const timestamps = new Map<number, number>();
  const hash = (height: number) =>
    ((BigInt(generation) << 32n) + BigInt(height))
      .toString(16)
      .padStart(64, "0");
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += String(chunk);
      if (body.length > 65536) {
        response.writeHead(413).end();
        return;
      }
    }
    const input = JSON.parse(body || "{}") as {
      scenario?: string;
      tip?: number;
      reorg?: boolean;
      method?: string;
      id?: unknown;
      params?: unknown[];
    };
    if (request.url === "/control" && request.method === "POST") {
      scenario = input.scenario ?? "connected";
      if (input.tip != null) {
        tip = input.tip;
        timestamps.set(tip, Math.floor(Date.now() / 1000));
      }
      if (input.reorg) generation++;
      response.writeHead(204).end();
      return;
    }
    if (scenario === "offline") {
      request.socket.destroy();
      return;
    }
    if (
      scenario === "auth" ||
      request.headers.authorization !==
        `Basic ${Buffer.from("test-only:fixture").toString("base64")}`
    ) {
      response.writeHead(401).end();
      return;
    }
    const params = input.params ?? [];
    let result: unknown;
    switch (input.method) {
      case "getblockchaininfo":
        result = {
          chain: scenario === "wrongNetwork" ? "main" : "testnet4",
          blocks: tip,
          headers: tip,
          bestblockhash: hash(tip),
          initialblockdownload: scenario === "syncing",
        };
        break;
      case "getblockhash":
        result =
          "00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043";
        break;
      case "getdeploymentinfo":
        result = {
          hash: hash(tip),
          blake2b: { height: 150308, active: tip + 1 >= 150308 },
        };
        break;
      case "getblockheader": {
        const height = Number(BigInt(`0x${String(params[0])}`) & 0xffffffffn);
        result = {
          hash: hash(height),
          height,
          time:
            timestamps.get(height) ??
            initialTime - (initialHeight - height) * 600,
          header_version: height >= 150308 ? 2 : 0,
          difficulty: 127.458,
          previousblockhash: hash(Math.max(0, height - 1)),
        };
        break;
      }
      case "getblock":
        result = { hash: hash(tip), size: 154000, txcount: 392 };
        break;
      case "getblockstats":
        result = {
          blockhash: hash(tip),
          height: tip,
          subsidy: 5000000000,
          totalfee: 2310000,
          txs: 392,
        };
        break;
      case "getnetworkhashps":
        result = 497900000000000;
        break;
      case "getnetworkinfo":
        result = { connections: 12 };
        break;
      case "getmempoolinfo":
        result = {
          size: 80093,
          bytes: 80459032,
          usage: 237000000,
          maxmempool: 300000000,
          mempoolminfee: 0.00001,
        };
        break;
      case "estimatesmartfee":
        result =
          scenario === "feeUnavailable"
            ? { errors: ["fixture unavailable"] }
            : {
                blocks: params[0],
                feerate: params[0] === 2 ? 0.000011 : 0.000002,
              };
        break;
      default:
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ id: input.id, error: { code: -32601 } }));
        return;
    }
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ id: input.id, result, error: null }));
  });
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  const directory = await mkdtemp(join(tmpdir(), "blaketime-test-"));
  const cookie = join(directory, "cookie");
  const config = join(directory, "config.json");
  await writeFile(cookie, "test-only:fixture", { mode: 0o600 });
  await writeFile(
    config,
    JSON.stringify({
      schemaVersion: 1,
      node: {
        url: `http://127.0.0.1:${port}`,
        network: "testnet4",
        label: "Test fixture",
        auth: { type: "cookie", file: cookie },
      },
      server: {
        bind: `127.0.0.1:${appPort}`,
        allowedHosts: [`127.0.0.1:${appPort}`, `localhost:${appPort}`],
      },
    }),
  );
  return { server, config, directory };
}
