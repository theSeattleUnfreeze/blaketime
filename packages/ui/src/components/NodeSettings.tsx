import { useState, type ReactNode } from "react";
import type { AppInfo, Snapshot } from "@blaketime/contracts";
import type { DashboardClient } from "../transport/client";
import type { Preferences } from "../format";
import { errorText, t } from "../messages";
import { Dialog } from "./Dialog";
export function NodeSettings({
  info,
  snapshot,
  client,
  close,
  refresh,
  preferences,
  setPreferences,
  children,
}: {
  info: AppInfo | null;
  snapshot: Snapshot | null;
  client: DashboardClient;
  close: () => void;
  refresh: () => void;
  preferences: Preferences;
  setPreferences: (value: Preferences) => void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function action(operation: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await operation();
      refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={t("settings.title")} close={close}>
      <section className="settings-section">
        <h3>{t("settings.node")}</h3>
        <dl className="settings-values">
          <dt>{t("settings.nodeLabel")}</dt>
          <dd>{snapshot?.label || t("settings.defaultNode")}</dd>
          <dt>{t("settings.network")}</dt>
          <dd>{snapshot?.network ?? "—"}</dd>
        </dl>
        <p>
          {t(info?.desktop ? "settings.desktopManaged" : "settings.managed")}
        </p>
        <div className="actions">
          <button disabled={busy} onClick={() => void action(client.check)}>
            {t(busy ? "status.checking" : "settings.check")}
          </button>
          {client.chooseConfig && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void action(client.chooseConfig!)}
            >
              {t("settings.chooseConfig")}
            </button>
          )}
        </div>
        {error != null && (
          <p className="error" role="alert">
            {errorText(error)}
          </p>
        )}
      </section>
      <section className="settings-section">
        <h3>{t("settings.display")}</h3>
        <label>
          {t("settings.timezone")}
          <select
            value={preferences.zone}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                zone: e.target.value === "UTC" ? "UTC" : "local",
              })
            }
          >
            <option value="local">{t("settings.local")}</option>
            <option value="UTC">{t("settings.utc")}</option>
          </select>
        </label>
        <label>
          {t("settings.clockFormat")}
          <select
            value={preferences.hour12 ? "12" : "24"}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                hour12: e.target.value === "12",
              })
            }
          >
            <option value="12">{t("settings.twelveHour")}</option>
            <option value="24">{t("settings.twentyFourHour")}</option>
          </select>
        </label>
      </section>
      {children}
      <footer className="settings-footer">
        <p>{t("settings.trust")}</p>
        <p>
          {t(info?.desktop ? "settings.desktopPrivacy" : "settings.privacy")}
        </p>
        <span>{t("app.version", { version: info?.version ?? "—" })}</span>
      </footer>
    </Dialog>
  );
}
