import type { ReactNode } from "react";
import type { Snapshot } from "@blaketime/contracts";
import { duration, freshSample, number, scaled } from "../format";
import { t, type MessageKey } from "../messages";
function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: MessageKey;
  value: ReactNode;
  detail?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <dt>{t(label)}</dt>
      <dd>{value}</dd>
      {detail && <small>{detail}</small>}
    </div>
  );
}
function Panel({
  title,
  children,
}: {
  title: MessageKey;
  children: ReactNode;
}) {
  return (
    <section className="metric-panel">
      <h2>
        <span>{t(title)}</span>
      </h2>
      {children}
    </section>
  );
}
export function MetricPanels({ snapshot }: { snapshot: Snapshot | null }) {
  const chain = snapshot?.chain;
  const reference = snapshot?.updatedAt;
  const mempool =
    snapshot?.mempool && freshSample(snapshot.mempool.updatedAt, reference, 60)
      ? snapshot.mempool
      : null;
  const peers =
    snapshot?.peers && freshSample(snapshot.peers.updatedAt, reference, 180)
      ? snapshot.peers
      : null;
  const fees =
    snapshot?.fees.filter((v) => freshSample(v.updatedAt, reference, 120)) ??
    [];
  const memory =
    mempool && mempool.memoryLimit > 0
      ? Math.min(1, mempool.memoryBytes / mempool.memoryLimit)
      : 0;
  return (
    <aside className="metric-panels">
      <Panel title="metrics.estimatedFee">
        <dl className="metric-grid fee-grid">
          {[0, 1].map((index) => (
            <Metric
              key={index}
              label="metrics.estimatedFee"
              value={
                <>
                  {number(fees[index]?.satsPerVbyte, 3)} <em>sat/vB</em>
                </>
              }
              detail={
                fees[index]
                  ? t("metrics.feeTarget", {
                      count: number(fees[index].target),
                    })
                  : t("metrics.estimateUnavailable")
              }
            />
          ))}
        </dl>
      </Panel>
      <Panel title="metrics.mempool">
        <dl className="metric-grid three">
          <Metric label="clock.transactions" value={number(mempool?.count)} />
          <Metric
            label="metrics.virtualSize"
            value={scaled(mempool?.virtualBytes, "vB")}
          />
          <Metric
            label="metrics.minimumFee"
            value={number(mempool?.minimumFee, 3)}
            detail="sat/vB"
          />
        </dl>
        <div
          className="memory-track"
          role="meter"
          aria-label={t("metrics.memory")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(memory * 100)}
        >
          <span style={{ width: `${memory * 100}%` }} />
        </div>
        <p className="memory-label">
          <strong>{scaled(mempool?.memoryBytes, "B")}</strong> /{" "}
          {scaled(mempool?.memoryLimit, "B")}
        </p>
      </Panel>
      <Panel title="metrics.hashrate">
        <dl className="metric-grid">
          <Metric
            label="metrics.blockInterval"
            value={duration(chain?.averageInterval)}
            detail={
              t("metrics.targetInterval") +
              ": " +
              duration(chain?.targetInterval)
            }
          />
          <Metric
            label="metrics.hashrate"
            value={scaled(chain?.hashrate, "H/s")}
            detail={
              chain
                ? t("metrics.sample", {
                    count: number(chain.hashrateSampleCount),
                  })
                : undefined
            }
            accent
          />
        </dl>
      </Panel>
      <Panel title="metrics.difficulty">
        <dl className="metric-grid">
          <Metric
            label="metrics.difficulty"
            value={scaled(chain?.tip.difficulty, "").trim()}
          />
          <Metric
            label="metrics.untilRetarget"
            value={number(chain?.untilRetarget)}
            detail={
              chain && chain.untilRetarget == null
                ? t("metrics.retargetDisabled")
                : undefined
            }
          />
        </dl>
      </Panel>
      <div className="bottom-panels">
        <Panel title="chain.label">
          <dl>
            <Metric label="metrics.peers" value={number(peers?.count)} />
            <Metric
              label="chain.pow"
              value={
                chain
                  ? t(
                      chain.tip.headerVersion === 2
                        ? "chain.blake2b"
                        : "chain.legacy",
                    )
                  : "—"
              }
            />
          </dl>
        </Panel>
        <Panel title="metrics.nextHalving">
          <dl>
            <Metric
              label="metrics.nextHalving"
              value={number(chain?.nextHalving)}
            />
            <Metric
              label="metrics.untilHalving"
              value={number(chain?.untilHalving)}
              accent
            />
          </dl>
        </Panel>
      </div>
      <div className="node-caption">
        <span
          className={`signal-dot ${snapshot?.state === "connected" ? "live" : ""}`}
        />
        {snapshot?.label || t("settings.defaultNode")}
      </div>
    </aside>
  );
}
