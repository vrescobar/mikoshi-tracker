"use client";

import type { AggregationBucket } from "@mikoshi-tracker/contracts/aggregations";

import styles from "./weight-trend.module.css";

type Props = {
  buckets: AggregationBucket[];
  label: string;
  emptyLabel: string;
};

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_X = 12;
const PAD_Y = 12;

type Point = { x: number; y: number; kg: number; date: string };

function buildPoints(buckets: AggregationBucket[]): Point[] {
  const datePoints = buckets.filter((b) => b.key.kind === "date" && !b.missing && b.sum.weight_kg > 0);
  if (datePoints.length === 0) return [];

  const series = datePoints.map((b) => ({
    date: b.key.kind === "date" ? b.key.value : "",
    kg: typeof b.sum.weight_kg === "number" ? b.sum.weight_kg : 0,
  }));

  const maxKg = Math.max(1, ...series.map((s) => s.kg));
  const minKg = Math.min(...series.map((s) => s.kg));
  const range = maxKg - minKg || 1;

  const innerW = VIEW_W - PAD_X * 2;
  const innerH = VIEW_H - PAD_Y * 2;

  if (series.length === 1) {
    return [
      {
        x: PAD_X + innerW / 2,
        y: PAD_Y + innerH / 2,
        kg: series[0].kg,
        date: series[0].date,
      },
    ];
  }

  return series.map((s, i) => {
    const x = PAD_X + (i / (series.length - 1)) * innerW;
    const y = PAD_Y + innerH - ((s.kg - minKg) / range) * innerH;
    return { x, y, kg: s.kg, date: s.date };
  });
}

export function WeightTrend({ buckets, label, emptyLabel }: Props) {
  const points = buildPoints(buckets);

  if (points.length === 0) {
    return (
      <div className={styles.empty} data-testid="weight-trend-empty">
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const path = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  return (
    <div className={styles.wrap} data-testid="weight-trend">
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
          stroke="var(--color-steel, #4a6fa5)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="weight-trend-line"
        />
        {points.map((p) => (
          <circle
            key={`${p.date}-${p.x}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="var(--color-steel, #4a6fa5)"
            data-testid="weight-trend-point"
          >
            <title>{`${p.date}: ${p.kg.toFixed(1)} kg`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
