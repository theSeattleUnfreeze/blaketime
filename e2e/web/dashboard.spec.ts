import { test, expect } from "@playwright/test";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:48193/control", {
    data: { scenario: "connected", tip: 150987 },
  });
});
test("live data, local preferences, responsive layout and no public requests", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4173"))
      external.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByTestId("block-height")).toHaveText("150987", {
    timeout: 20000,
  });
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Sample: 120 block intervals")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Time zone").selectOption("UTC");
  await page.getByLabel("Clock format").selectOption("24");
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Time zone")).toHaveValue("UTC");
  await expect(page.getByLabel("Clock format")).toHaveValue("24");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
});
test("tip updates and same-height replacements use the real backend", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("block-height")).toHaveText("150987", {
    timeout: 20000,
  });
  await request.post("http://127.0.0.1:48193/control", {
    data: { tip: 150988 },
  });
  await expect(page.getByTestId("block-height")).toHaveText("150988", {
    timeout: 20000,
  });
  const before = (await (await request.get("/api/dashboard")).json()) as {
    chain: { tip: { hash: string } };
  };
  await request.post("http://127.0.0.1:48193/control", {
    data: { reorg: true },
  });
  await expect
    .poll(
      async () =>
        (
          (await (await request.get("/api/dashboard")).json()) as {
            chain: { tip: { hash: string } };
          }
        ).chain.tip.hash,
      { timeout: 20000 },
    )
    .not.toBe(before.chain.tip.hash);
});
test("wrong network errors are visible and recover", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("block-height")).toHaveText("150987", {
    timeout: 20000,
  });
  await request.post("http://127.0.0.1:48193/control", {
    data: { scenario: "wrongNetwork" },
  });
  await expect(page.getByRole("status")).toContainText(
    "does not match the configured network",
    { timeout: 20000 },
  );
  await expect(page.getByTestId("block-height")).toHaveText("—");
  await request.post("http://127.0.0.1:48193/control", {
    data: { scenario: "connected" },
  });
  await expect(page.getByTestId("block-height")).toHaveText("150987", {
    timeout: 20000,
  });
});
