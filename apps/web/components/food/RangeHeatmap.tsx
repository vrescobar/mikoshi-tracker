"use client";

import type { AggregationBucket } from "@mikoshi-tracker/contracts/aggregations";

import { getFoodCopy } from "../../lib/i18n/food";
import { useLocale } from "../locale";
import styles from "./RangeHeatmap.module.css";

type RangeHeatmapProps = {
  buckets: AggregationBucket[];
  from: string;
  to: string;
};

export function kcalIntensity(kcal: number): 0 | 1 | 2 | 3 {
  if (kcal <= 0) return 0;
  if (kcal < 1000) return 1;
  if (kcal <= 2000) return 2;
  return 3;
}

export function buildDateRange(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    days.push(key);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function formatDayLabel(dateKey: string, localeStr: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString(localeStr === "zh-CN" ? "zh-CN" : localeStr === "es" ? "es" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RangeHeatmap({ buckets, from, to }: RangeHeatmapProps) {
  const { locale } = useLocale();
  const copy = getFoodCopy(locale).insights.heatmap;

  const bucketMap = new Map<string, AggregationBucket>();
  for (const b of buckets) {
    if (b.key.kind === "date") {
      bucketMap.set(b.key.value, b);
    }
  }

  const days = buildDateRange(from, to);

  const hasData = buckets.some((b) => !b.missing && b.count > 0);

  return (
    <div className={styles.heatmap} data-testid="range-heatmap">
      <p className={styles.description}>{copy.description}</p>

      {!hasData ? (
        <p className={styles.noData}>{copy.noData}</p>
      ) : (
        <div className={styles.grid} role="list" aria-label={copy.description}>
          {days.map((day) => {
            const bucket = bucketMap.get(day);
            const kcal = bucket ? (bucket.sum.kcal ?? 0) : 0;
            const intensity = bucket && !bucket.missing ? kcalIntensity(kcal) : 0;
            const label = `${formatDayLabel(day, locale)}: ${bucket && !bucket.missing ? `${Math.round(kcal)} kcal` : "—"}`;

            return (
              <div
                key={day}
                role="listitem"
                className={styles.cell}
                data-intensity={String(intensity)}
                data-missing={bucket?.missing ? "true" : "false"}
                title={label}
                aria-label={label}
              />
            );
          })}
        </div>
      )}

      <div className={styles.legend} aria-hidden="true">
        <div className={styles.legendItem}>
          <div className={styles.legendCell} data-intensity="0" />
          <span>{copy.legend.none}</span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendCell} data-intensity="1" />
          <span>{copy.legend.low}</span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendCell} data-intensity="2" />
          <span>{copy.legend.medium}</span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendCell} data-intensity="3" />
          <span>{copy.legend.high}</span>
        </div>
      </div>
    </div>
  );
}
