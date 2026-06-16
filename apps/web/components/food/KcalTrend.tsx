import type { AggregationBucket } from "@mikoshi-tracker/contracts/aggregations";

import styles from "./KcalTrend.module.css";

type Props = {
  buckets: AggregationBucket[];
  label: string;
  emptyLabel: string;
  /** Optional daily kcal goal — drawn as a dashed reference line. */
  target?: number | null;
  /** Optional label for the target line (e.g. "Goal 2200"). */
  targetLabel?: string;
};

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_X = 12;
const PAD_Y = 12;

type Point = { x: number; y: number; kcal: number; date: string };

const INNER_W = VIEW_W - PAD_X * 2;
const INNER_H = VIEW_H - PAD_Y * 2;

function yFor(kcal: number, maxKcal: number): number {
  return PAD_Y + INNER_H - (kcal / maxKcal) * INNER_H;
}

function buildPoints(buckets: AggregationBucket[], maxKcal: number): Point[] {
  const datePoints = buckets.filter((b) => b.key.kind === "date");
  if (datePoints.length === 0) return [];

  const series = datePoints.map((b) => ({
    date: b.key.kind === "date" ? b.key.value : "",
    kcal: typeof b.sum.kcal === "number" ? b.sum.kcal : 0,
  }));

  if (series.length === 1) {
    return [{ x: PAD_X + INNER_W / 2, y: yFor(series[0].kcal, maxKcal), kcal: series[0].kcal, date: series[0].date }];
  }

  return series.map((s, i) => ({
    x: PAD_X + (i / (series.length - 1)) * INNER_W,
    y: yFor(s.kcal, maxKcal),
    kcal: s.kcal,
    date: s.date,
  }));
}

export function KcalTrend({ buckets, label, emptyLabel, target, targetLabel }: Props) {
  const seriesMax = Math.max(
    1,
    ...buckets.filter((b) => b.key.kind === "date").map((b) => (typeof b.sum.kcal === "number" ? b.sum.kcal : 0)),
  );
  // Keep the goal line on-canvas with a little headroom above whichever is taller.
  const maxKcal = target && target > 0 ? Math.max(seriesMax, target) * 1.08 : seriesMax;
  const points = buildPoints(buckets, maxKcal);

  if (points.length === 0 || points.every((p) => p.kcal === 0)) {
    return (
      <div className={styles.empty} data-testid="kcal-trend-empty">
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const path = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  const targetY = target && target > 0 ? yFor(target, maxKcal) : null;

  return (
    <div className={styles.wrap} data-testid="kcal-trend">
      <svg width="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        {targetY !== null ? (
          <g data-testid="kcal-trend-target">
            <line
              x1={PAD_X}
              y1={targetY}
              x2={VIEW_W - PAD_X}
              y2={targetY}
              stroke="var(--color-accent-diet, #ef7a5a)"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              opacity={0.75}
            />
            {targetLabel ? (
              <text
                x={VIEW_W - PAD_X}
                y={Math.max(targetY - 4, 10)}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-accent-diet, #ef7a5a)"
              >
                {targetLabel}
              </text>
            ) : null}
          </g>
        ) : null}
        <path
          d={path}
          fill="none"
          stroke="var(--color-accent, #111827)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="kcal-trend-line"
        />
        {points.map((p) => (
          <circle
            key={`${p.date}-${p.x}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="var(--color-accent, #111827)"
            data-testid="kcal-trend-point"
          >
            <title>{`${p.date}: ${Math.round(p.kcal)} kcal`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
