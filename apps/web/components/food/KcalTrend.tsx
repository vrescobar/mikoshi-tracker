"use client";

import type { AggregationBucket } from "@mikoshi-tracker/contracts/aggregations";

import styles from "./KcalTrend.module.css";

type Props = {
  buckets: AggregationBucket[];
  label: string;
  emptyLabel: string;
};

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_X = 12;
const PAD_Y = 12;

type Point = { x: number; y: number; kcal: number; date: string };

function buildPoints(buckets: AggregationBucket[]): Point[] {
  const datePoints = buckets.filter((b) => b.key.kind === "date");
  if (datePoints.length === 0) return [];

  const series = datePoints.map((b) => ({
    date: b.key.kind === "date" ? b.key.value : "",
    kcal: typeof b.sum.kcal === "number" ? b.sum.kcal : 0,
  }));

  const maxKcal = Math.max(1, ...series.map((s) => s.kcal));

  const innerW = VIEW_W - PAD_X * 2;
  const innerH = VIEW_H - PAD_Y * 2;

  if (series.length === 1) {
    return [
      {
        x: PAD_X + innerW / 2,
        y: PAD_Y + innerH - (series[0].kcal / maxKcal) * innerH,
        kcal: series[0].kcal,
        date: series[0].date,
      },
    ];
  }

  return series.map((s, i) => {
    const x = PAD_X + (i / (series.length - 1)) * innerW;
    const y = PAD_Y + innerH - (s.kcal / maxKcal) * innerH;
    return { x, y, kcal: s.kcal, date: s.date };
  });
}

export function KcalTrend({ buckets, label, emptyLabel }: Props) {
  const points = buildPoints(buckets);

  if (points.length === 0 || points.every((p) => p.kcal === 0)) {
    return (
      <div className={styles.empty} data-testid="kcal-trend-empty">
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const path = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  return (
    <div className={styles.wrap} data-testid="kcal-trend">
      <svg
        width="100%"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
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
