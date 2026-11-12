import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Snapshot } from "@blaketime/contracts";
import { ChainClock } from "./ChainClock";
import { MetricPanels } from "./MetricPanels";
import { StatusBanner } from "./StatusBanner";
afterEach(cleanup);
it("renders unavailable data without fabricated heights or blocks", () => {
  render(<ChainClock snapshot={null} now={0} />);
  expect(screen.getByTestId("block-height").textContent).toBe("—");
  expect(screen.getByText("Showing 0 recent blocks")).toBeTruthy();
  expect(screen.getByText("Halving progress: Unavailable")).toBeTruthy();
});
it("keeps day-long block age and server-timed metrics precise", () => {
  const tipTime = 1_700_000_000;
  const snapshot: Snapshot = {
    state: "connected",
    error: null,
    label: "node",
    network: "main",
    updatedAt: tipTime + 30,
    chain: {
      tip: {
        hash: "ab".repeat(32),
        height: 150987,
        time: tipTime,
        headerVersion: 2,
        difficulty: 1.234e14,
      },
      activationHeight: 961640,
      halvingProgress: 0.123456,
      nextHalving: 210000,
      untilHalving: 1000,
      retargetProgress: 0.5,
      untilRetarget: 1008,
      subsidySats: "312500000",
      feeSats: "1",
      transactions: 100,
      sizeBytes: 12000,
      hashrate: 1.2e21,
      hashrateSampleCount: 120,
      targetInterval: 600,
      averageInterval: 600,
      sampleCount: 10,
      recent: [],
    },
    mempool: {
      count: 4,
      virtualBytes: 2_000_000,
      memoryBytes: 3_000_000,
      memoryLimit: 300_000_000,
      minimumFee: 1,
      updatedAt: tipTime + 30,
    },
    fees: [
      { target: 2, satsPerVbyte: 4.5, updatedAt: tipTime + 30 },
      { target: 6, satsPerVbyte: 9, updatedAt: tipTime - 500 },
    ],
    peers: { count: 8, updatedAt: tipTime - 500 },
  };
  render(
    <>
      <ChainClock snapshot={snapshot} now={(tipTime + 90061) * 1000} />
      <MetricPanels snapshot={snapshot} />
    </>,
  );
  const text = document.body.textContent ?? "";
  expect(text).toContain("1d 1h 1m");
  expect(text).toContain("12.35%");
  expect(text).toContain("50.00%");
  expect(text).toContain("0.012");
  expect(text).toContain("1.2 ZH/s");
  expect(text).toContain("4.5");
  expect(screen.queryByText(/^9$/)).toBeNull();
  expect(
    screen.getByText("Connected peers").closest(".metric")?.querySelector("dd")
      ?.textContent,
  ).toBe("—");
});
it("does not expose raw error details", () => {
  render(
    <StatusBanner
      snapshot={null}
      error={new Error("secret-rpc-password")}
      desktop={false}
      needsReload={false}
    />,
  );
  expect(screen.queryByText(/secret-rpc/)).toBeNull();
  expect(screen.getByRole("status").textContent).toContain(
    "Could not refresh the dashboard",
  );
});
