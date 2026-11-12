import { expect, it, vi } from "vitest";
import { withDeadline } from "./deadline";

it("settles when the operation never returns", async () => {
  vi.useFakeTimers();
  const parent = new AbortController();
  let seen: AbortSignal | undefined;
  const pending = withDeadline(
    (signal) => {
      seen = signal;
      return new Promise(() => undefined);
    },
    parent.signal,
    1_000,
  );
  const assertion = expect(pending).rejects.toMatchObject({
    name: "TimeoutError",
  });
  await vi.advanceTimersByTimeAsync(1_000);
  await assertion;
  expect(seen?.aborted).toBe(true);
  vi.useRealTimers();
});

it("follows the parent abort", async () => {
  const parent = new AbortController();
  const pending = withDeadline(
    () => new Promise(() => undefined),
    parent.signal,
    30_000,
  );
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  parent.abort();
  await assertion;
});
