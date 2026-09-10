import { useState } from "react";
import { ChainClock } from "./components/ChainClock";
import { MetricPanels } from "./components/MetricPanels";
import { NodeSettings } from "./components/NodeSettings";
import { StatusBanner } from "./components/StatusBanner";
import { client } from "./transport";
import { useDashboard } from "./use-dashboard";
import { useDisplay } from "./use-display";
import { clockParts } from "./format";
import { locale, t } from "./messages";
export function App() {
  const { snapshot, info, error, refresh, needsReload } = useDashboard(client);
  const { preferences, setPreferences, now } = useDisplay();
  const [settings, setSettings] = useState(false);
  const clock = clockParts(now, preferences);
  const network = snapshot?.network;
  const state = error ? "disconnected" : (snapshot?.state ?? "connecting");
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="wordmark">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="13" />
            <path d="M16 6v7l6 3-6 3v7M8 12h8M8 20h8" />
          </svg>
          <span>{t("app.name")}</span>
          <small>{t("app.subtitle")}</small>
        </div>
        <nav aria-label={t("app.settings")}>
          <span className={`connection-state ${state}`}>
            <i />
            {t(`status.${state}`)}
          </span>
          <button onClick={() => setSettings(true)}>{t("app.settings")}</button>
        </nav>
      </header>
      <StatusBanner
        snapshot={snapshot}
        error={error}
        desktop={info?.desktop ?? false}
        needsReload={needsReload}
      />
      <main className="dashboard-layout">
        <section className="clock-column">
          <div className="chain-identity">
            <span>{t("chain.label")}</span>
            <span className="network-badge">
              {network === "main" ||
              network === "testnet4" ||
              network === "regtest"
                ? t(`chain.${network}`)
                : "—"}
            </span>
            <span className="pow-badge">
              {snapshot?.chain
                ? t(
                    snapshot.chain.tip.headerVersion === 2
                      ? "chain.active"
                      : "chain.preActivation",
                  )
                : ""}
            </span>
          </div>
          <ChainClock snapshot={snapshot} now={now} />
          <div className="calendar">
            <time className="wall-clock">{clock.time}</time>
            <div className="calendar-date">
              <span>{clock.day}</span>
              <time>{clock.date}</time>
            </div>
          </div>
          <div className="time-rule">
            <i />
            <span>{t("clock.recentBlocks")}</span>
            <i />
          </div>
        </section>
        <MetricPanels snapshot={snapshot} now={now} />
      </main>
      <footer className="app-footer">
        <span>
          {t("chain.label")} / {t("chain.blake2b")}
        </span>
        <span>
          {snapshot?.updatedAt
            ? t("status.lastUpdated", {
                time: new Intl.DateTimeFormat(locale, {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(snapshot.updatedAt * 1000),
              })
            : t(`status.${state}`)}
        </span>
      </footer>
      {settings && (
        <NodeSettings
          info={info}
          snapshot={snapshot}
          client={client}
          close={() => setSettings(false)}
          refresh={refresh}
          preferences={preferences}
          setPreferences={setPreferences}
        />
      )}
    </div>
  );
}
