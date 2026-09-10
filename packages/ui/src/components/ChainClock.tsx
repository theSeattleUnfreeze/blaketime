import { useId } from "react";
import type { Snapshot } from "@blaketime/contracts";
import { amount, duration, number, percent } from "../format";
import { t } from "../messages";

const point = (radius: number, angle: number) => ({
  x: 350 + radius * Math.sin((angle * Math.PI) / 180),
  y: 350 - radius * Math.cos((angle * Math.PI) / 180),
});
function ProgressRing({
  radius,
  value,
  className,
}: {
  radius: number;
  value: number;
  className: string;
}) {
  const endpoint = point(radius, Math.max(0, Math.min(1, value)) * 360);
  return (
    <g className={className}>
      <circle className="ring-track" cx="350" cy="350" r={radius} />
      <circle
        className="ring-progress"
        cx="350"
        cy="350"
        r={radius}
        pathLength="100"
        strokeDasharray={`${Math.max(0, Math.min(1, value)) * 100} 100`}
        transform="rotate(-90 350 350)"
      />
      {value > 0 && (
        <circle className="ring-marker" cx={endpoint.x} cy={endpoint.y} r="6" />
      )}
    </g>
  );
}
export function ChainClock({
  snapshot,
  now,
}: {
  snapshot: Snapshot | null;
  now: number;
}) {
  const id = useId();
  const chain = snapshot?.chain;
  const age = chain ? now / 1000 - chain.tip.time : null;
  const targetInterval = chain?.targetInterval || 1;
  const unit = snapshot?.network === "main" ? "BTC" : "tBTC";
  const total =
    chain?.subsidySats != null && chain.feeSats != null
      ? (BigInt(chain.subsidySats) + BigInt(chain.feeSats)).toString()
      : null;
  const blocks = chain?.recent.slice(0, 144) ?? [];
  return (
    <div
      className={`chain-clock ${snapshot?.state === "stale" ? "is-stale" : ""}`}
    >
      <svg className="clock-rings" viewBox="0 0 700 700" aria-hidden="true">
        <defs>
          <path id={`${id}-outer`} d="M 350 28 A 322 322 0 1 1 349.99 28" />
          <path id={`${id}-middle`} d="M 350 54 A 296 296 0 1 1 349.99 54" />
        </defs>
        <circle className="outer-guide" cx="350" cy="350" r="333" />
        {Array.from({ length: 60 }, (_, i) => {
          const a = point(i % 5 === 0 ? 327 : 330, i * 6),
            b = point(337, i * 6);
          return (
            <line
              key={i}
              className="clock-graduation"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}
        <ProgressRing
          radius={310}
          value={chain?.halvingProgress ?? 0}
          className="halving-ring"
        />
        <ProgressRing
          radius={282}
          value={chain?.retargetProgress ?? 0}
          className="difficulty-ring"
        />
        <text className="ring-label">
          <textPath href={`#${id}-outer`} startOffset="1%">
            {t("clock.halvingProgress")}{" "}
            {chain ? percent(chain.halvingProgress) : ""}
          </textPath>
        </text>
        <text className="ring-label">
          <textPath href={`#${id}-middle`} startOffset="1%">
            {t("clock.difficultyPeriod")}{" "}
            {chain?.retargetProgress != null
              ? percent(chain.retargetProgress)
              : ""}
          </textPath>
        </text>
        {Array.from({ length: 144 }, (_, i) => {
          const a = point(252, i * 2.5),
            b = point(257, i * 2.5);
          return (
            <line
              key={blocks[i]?.hash ?? i}
              className={
                blocks[i]
                  ? blocks[i].headerVersion === 2
                    ? "block-tick"
                    : "block-tick legacy"
                  : "block-tick empty"
              }
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}
        <circle className="center-guide" cx="350" cy="350" r="235" />
      </svg>
      <div className="center-readout">
        <span
          className={`signal-dot ${snapshot?.state === "connected" ? "live" : ""}`}
        />
        <h1>{t("app.name")}</h1>
        <div className="reward-equation">
          <div>
            <span>{t("clock.subsidy")}</span>
            <strong>{amount(chain?.subsidySats)}</strong>
          </div>
          <b>+</b>
          <div>
            <span>{t("clock.fees")}</span>
            <strong>{amount(chain?.feeSats)}</strong>
          </div>
          <b>=</b>
          <div>
            <span>{t("clock.subsidyAndFees")}</span>
            <strong>{amount(total)}</strong>
          </div>
        </div>
        <span className="coin-unit">{unit}</span>
        <div className="height-label">{t("clock.height")}</div>
        <div className="block-height" data-testid="block-height">
          {chain ? String(chain.tip.height) : "—"}
        </div>
        <div className="block-details">
          <span>
            {number(chain?.transactions)}{" "}
            <small>{t("clock.transactions")}</small>
          </span>
          <span className="separator">·</span>
          <span>
            {number(
              chain?.sizeBytes == null ? null : chain.sizeBytes / 1000000,
              2,
            )}{" "}
            <small>MB</small>
          </span>
        </div>
      </div>
      <div
        className={`block-age ${age != null && age > targetInterval ? "over-target" : ""}`}
        aria-live="off"
      >
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="age-track" cx="60" cy="60" r="56" />
          <circle
            className="age-progress"
            cx="60"
            cy="60"
            r="56"
            pathLength="100"
            strokeDasharray={`${age == null ? 0 : Math.max(0, Math.min(100, (age / targetInterval) * 100))} 100`}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div>
          <span>{t("clock.blockAge")}</span>
          <strong>{duration(age)}</strong>
        </div>
      </div>
      <div className="sr-only">
        <p>
          {t("clock.ringProgress", {
            label: t("clock.halvingProgress"),
            percent: chain
              ? percent(chain.halvingProgress)
              : t("metrics.unavailable"),
          })}
        </p>
        <p>
          {t("clock.ringProgress", {
            label: t("clock.difficultyPeriod"),
            percent:
              chain?.retargetProgress != null
                ? percent(chain.retargetProgress)
                : t("metrics.unavailable"),
          })}
        </p>
        <p>{t("clock.recentSummary", { count: number(blocks.length) })}</p>
      </div>
      {age != null && age < 0 && (
        <p className="clock-notice">{t("clock.timestampAhead")}</p>
      )}
    </div>
  );
}
