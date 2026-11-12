import { useEffect, useState } from "react";
import type { AppInfo, Snapshot } from "@blaketime/contracts";
import type { DashboardClient } from "./transport/client";
import { appVersion } from "./build-info";
import { withDeadline } from "./deadline";

export const receivedStaleAfterMs = 45_000;

export function applyFreshness(
  snapshot: Snapshot | null,
  now: number,
  receivedAt: number | null,
): Snapshot | null {
  if (
    !snapshot ||
    receivedAt == null ||
    (snapshot.state !== "connected" && snapshot.state !== "syncing")
  ) {
    return snapshot;
  }
  if (now - receivedAt < receivedStaleAfterMs) return snapshot;
  return { ...snapshot, state: "stale" };
}

export function useDashboard(client: DashboardClient) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let pending = false;
    const controller = new AbortController();
    const arm = (delay: number) => {
      if (!active) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), delay);
    };
    async function run() {
      if (!active) return;
      if (running) {
        pending = true;
        return;
      }
      running = true;
      try {
        const nextInfo = await withDeadline(
          (signal) => client.getInfo(signal),
          controller.signal,
          12_000,
        );
        if (!active) return;
        setInfo(nextInfo);
        if (nextInfo.apiVersion !== 1) {
          setSnapshot(null);
          setReceivedAt(Date.now());
          return;
        }
        const next = await withDeadline(
          (signal) => client.getSnapshot(signal),
          controller.signal,
          12_000,
        );
        if (!active) return;
        setSnapshot(next);
        setReceivedAt(Date.now());
        setError(null);
      } catch (cause) {
        if (!active || controller.signal.aborted) return;
        setError(cause);
      } finally {
        running = false;
        if (!active) return;
        if (pending) {
          pending = false;
          arm(0);
        } else {
          arm(5000);
        }
      }
    }
    const onWake = () => {
      if (!active || document.visibilityState === "hidden") return;
      if (running) {
        pending = true;
        return;
      }
      arm(0);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("online", onWake);
    void run();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [client, revision]);
  return {
    snapshot,
    info,
    error,
    receivedAt,
    refresh: () => setRevision((v) => v + 1),
    needsReload:
      !!info && (info.version !== appVersion || info.apiVersion !== 1),
  };
}
