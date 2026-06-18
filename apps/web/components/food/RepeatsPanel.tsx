import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventDetail } from "@mikoshi-tracker/contracts/events";
import { useState, useTransition } from "react";

import type { FoodPayload } from "../../lib/food-client";
import { createFoodEvent, ensureFoodEntry, isFoodPayload } from "../../lib/food-client";
import { groupSimilarMeals } from "../../lib/food-grouping";
import { Button, Notice } from "../ui";

import styles from "./RepeatsPanel.module.css";

type RepeatsCopy = {
  title: string;
  description: string;
  empty: string;
  logAgain: string;
  logging: string;
  errorTitle: string;
  countLabel: (count: number) => string;
  /** Subline shown when a row bundles several spellings of the same product. */
  variantsLabel: (count: number) => string;
};

type Props = {
  aggregations: AggregationResponse | null;
  copy: RepeatsCopy;
  onLogged?: (event: EntryEventDetail) => void;
};

type RepeatRow = {
  name: string;
  count: number;
  totalKcal: number;
  sample: FoodPayload;
  /** How many distinct spellings of this product were folded into the row. */
  variantCount: number;
};

function buildRows(agg: AggregationResponse | null): RepeatRow[] {
  if (!agg) return [];
  const raw: RepeatRow[] = [];
  for (const bucket of agg.buckets) {
    if (bucket.key.kind !== "payload") continue;
    const sample = bucket.key.sample;
    if (!isFoodPayload(sample)) continue;
    raw.push({
      name: sample.name,
      count: bucket.count,
      totalKcal: bucket.sum.kcal ?? 0,
      sample,
      variantCount: 1,
    });
  }

  // Fold near-identical product spellings (e.g. the several "yfood …" names)
  // into a single routine row: combined count, the most-logged variant as the
  // label/relog target, and a count of how many spellings were merged.
  const clusters = groupSimilarMeals(raw, (r) => r.name);
  const merged = clusters.map((members): RepeatRow => {
    const representative = [...members].sort(
      (a, b) => b.count - a.count || a.name.length - b.name.length,
    )[0];
    return {
      name: representative.name,
      sample: representative.sample,
      count: members.reduce((sum, m) => sum + m.count, 0),
      totalKcal: members.reduce((sum, m) => sum + m.totalKcal, 0),
      variantCount: members.length,
    };
  });
  return merged.sort((a, b) => b.count - a.count);
}

export function RepeatsPanel({ aggregations, copy, onLogged }: Props) {
  const rows = buildRows(aggregations);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleLogAgain(row: RepeatRow) {
    startTransition(async () => {
      setError(null);
      setPendingName(row.name);
      try {
        const entry = await ensureFoodEntry();
        const next: FoodPayload = {
          ...row.sample,
          source: "similar_to_event",
          confidence: 1.0,
          similarToEventId: null,
        };
        const event = await createFoodEvent(entry.id, next);
        onLogged?.(event);
      } catch (err) {
        setError(err instanceof Error ? err.message : copy.errorTitle);
      } finally {
        setPendingName(null);
      }
    });
  }

  return (
    <section className={styles.section} data-testid="repeats-panel">
      <h2 className={styles.title}>{copy.title}</h2>
      <p className={styles.description}>{copy.description}</p>

      {error ? (
        <Notice tone="danger" title={copy.errorTitle}>
          {error}
        </Notice>
      ) : null}

      {rows.length === 0 ? (
        <p className={styles.empty} data-testid="repeats-panel-empty">
          {copy.empty}
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.name} className={styles.row} data-testid="repeats-row">
              <div className={styles.meta}>
                <div className={styles.nameRow}>
                  <span className={styles.name}>{row.sample.name}</span>
                  <span className={styles.count}>{copy.countLabel(row.count)}</span>
                </div>
                {row.variantCount > 1 ? (
                  <span className={styles.variants}>{copy.variantsLabel(row.variantCount)}</span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleLogAgain(row)}
                disabled={pendingName !== null}
                data-testid={`repeats-row-log-again-${row.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {pendingName === row.name ? copy.logging : copy.logAgain}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
