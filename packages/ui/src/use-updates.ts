import { useEffect, useState } from 'react';
import type { UpdateStatus } from '@blaketime/contracts';
import { updateClient, type UpdateClient } from './transport/updates';
import type { MessageKey } from './messages';
export function useUpdates(desktop: boolean, client: UpdateClient = updateClient) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const next = await client.status(); if (active) setStatus(next); }
      catch { if (active) setError('updates.checkFailed'); }
      finally { if (active) timer = setTimeout(() => void poll(), 1000); }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [desktop, client]);
  async function action(operation: () => Promise<void>, failure: MessageKey) {
    setPending(true); setError(null);
    try { await operation(); setStatus(await client.status()); }
    catch { setError(failure); }
    finally { setPending(false); }
  }
  return {
    status, error, pending,
    prompt: status?.phase === 'available' && !!status.version && dismissed !== status.version,
    dismiss: () => setDismissed(status?.version ?? null),
    check: () => action(client.check, 'updates.checkFailed'),
    install: () => action(client.install, 'updates.installFailed'),
    setAutomatic: (value: boolean) => action(() => client.setAutomatic(value), 'updates.checkFailed')
  };
}
export type UpdatesModel = ReturnType<typeof useUpdates>;
