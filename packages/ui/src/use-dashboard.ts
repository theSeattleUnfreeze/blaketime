import { useEffect, useState } from "react";
import type { AppInfo, Snapshot } from "@blaketime/contracts";
import type { DashboardClient } from "./transport/client";
import { appVersion } from "./build-info";
export function useDashboard(client: DashboardClient) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const nextInfo = await client.getInfo(controller.signal);
        if (!active) return;
        setInfo(nextInfo);
        if (nextInfo.apiVersion !== 1) {
          setSnapshot(null);
          return;
        }
        const next = await client.getSnapshot(controller.signal);
        if (active) {
          setSnapshot(next);
          setError(null);
        }
      } catch (cause) {
        if (active) setError(cause);
      } finally {
        if (active) timer = setTimeout(() => void refresh(), 5000);
      }
    }
    void refresh();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [client, revision]);
  return {
    snapshot,
    info,
    error,
    refresh: () => setRevision((v) => v + 1),
    needsReload:
      !!info && (info.version !== appVersion || info.apiVersion !== 1),
  };
}
