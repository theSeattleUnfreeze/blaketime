import { expect, it } from "vitest";
import type { Snapshot } from "@blaketime/contracts";
import { applyFreshness, receivedStaleAfterMs } from "./use-dashboard";

const snapshot = {
  state: "connected",
  error: null,
  label: "node",
  network: "main",
  updatedAt: 1_000,
  chain: null,
  mempool: null,
  fees: [],
  peers: null,
} satisfies Snapshot;

it("marks a snapshot stale only after the browser stops receiving it", () => {
  const now = 1_700_000_000_000;
  expect(applyFreshness(snapshot, now, now - 5_000)?.state).toBe("connected");
  expect(applyFreshness(snapshot, now, now - receivedStaleAfterMs)?.state).toBe(
    "stale",
  );
  expect(
    applyFreshness(
      { ...snapshot, state: "disconnected" },
      now,
      now - receivedStaleAfterMs,
    )?.state,
  ).toBe("disconnected");
  expect(applyFreshness(null, now, now)).toBeNull();
});
