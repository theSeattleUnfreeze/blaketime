import type { UpdateStatus } from '@blaketime/contracts';
import { t, type MessageKey } from '../messages';
import { percent } from '../format';
import type { UpdatesModel } from '../use-updates';
import { Dialog } from './Dialog';
function statusText(status: UpdateStatus): string {
  if (status.phase === 'available') return t('updates.available', { version: status.version ?? '' });
  if (status.phase === 'downloading' && status.progress != null) return t('updates.progress', { percent: percent(status.progress) });
  const keys: Partial<Record<UpdateStatus['phase'], MessageKey>> = {
    disabled: 'updates.disabled', checking: 'updates.checking', current: 'updates.current', downloading: 'updates.downloading',
    installing: 'updates.installing', checkFailed: 'updates.checkFailed', installFailed: 'updates.installFailed', unverified: 'updates.unverified'
  };
  const key = keys[status.phase];
  return key ? t(key) : '';
}
export function UpdateControls({ model }: { model: UpdatesModel }) {
  const status = model.status;
  const busy = model.pending || ['checking', 'downloading', 'installing'].includes(status?.phase ?? '');
  return <section className="settings-section"><h3>{t('updates.title')}</h3>
    <label>{t('updates.automatic')}<input type="checkbox" checked={status?.automatic ?? true} disabled={!status || busy} onChange={e => void model.setAutomatic(e.target.checked)} /></label>
    <div className="actions"><button disabled={!status || busy || status.phase === 'disabled'} onClick={() => void model.check()}>{t('updates.check')}</button>
      {status?.phase === 'available' && <button className="primary" disabled={busy} onClick={() => void model.install()}>{t('updates.install')}</button>}</div>
    {status && <p role="status">{statusText(status)}</p>}
    {model.error && <p className="error" role="alert">{t(model.error)}</p>}
    <p>{t('updates.privacy')}</p>
  </section>;
}
export function UpdatePrompt({ model }: { model: UpdatesModel }) {
  const status = model.status;
  if (model.prompt && status) return <Dialog title={t('updates.available', { version: status.version ?? '' })} close={model.dismiss}>
    <div className="settings-section"><p>{t('updates.confirm')}</p><div className="actions"><button onClick={model.dismiss}>{t('updates.later')}</button><button className="primary" disabled={model.pending} onClick={() => void model.install()}>{t('updates.install')}</button></div></div>
  </Dialog>;
  if (status && ['downloading', 'installing', 'installFailed', 'unverified'].includes(status.phase)) return <div className="update-toast" role="status">{statusText(status)}</div>;
  return null;
}
