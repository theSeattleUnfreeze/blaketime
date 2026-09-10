import type { Snapshot } from "@blaketime/contracts";
import { t, errorText } from "../messages";
export function StatusBanner({
  snapshot,
  error,
  desktop,
  needsReload,
}: {
  snapshot: Snapshot | null;
  error: unknown;
  desktop: boolean;
  needsReload: boolean;
}) {
  if (needsReload && !desktop)
    return (
      <div className="status-banner" role="status">
        {t("web.updateAvailable")}
        <button onClick={() => window.location.reload()}>
          {t("web.reload")}
        </button>
      </div>
    );
  const cause = error ?? snapshot?.error;
  if (cause != null)
    return (
      <div className="status-banner warning" role="status">
        {errorText(cause)}
      </div>
    );
  if (snapshot?.state === "notConfigured")
    return (
      <div className="status-banner" role="status">
        <strong>{t("status.notConfigured")}</strong>
        <span>{t(desktop ? "settings.desktopSetup" : "settings.setup")}</span>
      </div>
    );
  if (snapshot?.state === "stale" || snapshot?.state === "syncing")
    return (
      <div className="status-banner warning" role="status">
        {t(`status.${snapshot.state}`)}
      </div>
    );
  return null;
}
