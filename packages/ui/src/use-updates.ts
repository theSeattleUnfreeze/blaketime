import { useEffect, useState } from "react";
import type { UpdateStatus } from "@blaketime/contracts";
import { updateClient, type UpdateClient } from "./transport/updates";
import type { MessageKey } from "./messages";
import { withDeadline } from "./deadline";
export function useUpdates(
  desktop: boolean,
  client: UpdateClient = updateClient,
) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      let delay = 15000;
      try {
        const next = await withDeadline(
          () => client.status(),
          controller.signal,
          12000,
        );
        if (!active) return;
        setStatus(next);
        setError(null);
        if (
          next.phase === "downloading" ||
          next.phase === "installing" ||
          next.phase === "checking"
        )
          delay = 1000;
      } catch {
        if (active && !controller.signal.aborted)
          setError("updates.checkFailed");
      } finally {
        if (active) timer = setTimeout(() => void poll(), delay);
      }
    }
    void poll();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [desktop, client]);
  async function action(operation: () => Promise<void>, failure: MessageKey) {
    setPending(true);
    setError(null);
    try {
      await operation();
      setStatus(
        await withDeadline(
          () => client.status(),
          new AbortController().signal,
          12000,
        ),
      );
    } catch {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  return {
    status,
    error,
    pending,
    prompt:
      status?.phase === "available" &&
      !!status.version &&
      dismissed !== status.version,
    dismiss: () => setDismissed(status?.version ?? null),
    check: () => action(client.check, "updates.checkFailed"),
    install: () => action(client.install, "updates.installFailed"),
    setAutomatic: (value: boolean) =>
      action(() => client.setAutomatic(value), "updates.checkFailed"),
  };
}
export type UpdatesModel = ReturnType<typeof useUpdates>;
