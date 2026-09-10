import { test, expect } from "@playwright/test";
test("API rejects cross-origin access and exposes no credential config", async ({
  request,
}) => {
  expect((await request.post("/api/node/check")).status()).toBe(403);
  expect(
    (
      await request.post("/api/node/check", {
        headers: { origin: "https://evil.invalid", "x-blaketime-check": "1" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await request.get("/api/rpc?method=sendrawtransaction")).status(),
  ).toBe(404);
  const body = await (await request.get("/api/node")).text();
  for (const privateValue of [
    "test-only:fixture",
    "48193",
    "cookie",
    "password",
    "config.json",
  ])
    expect(body).not.toContain(privateValue);
});
