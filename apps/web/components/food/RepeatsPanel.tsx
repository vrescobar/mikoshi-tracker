"use client";

import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { EntryEventDetail } from "@mikoshi-tracker/contracts/events";
import { useState, useTransition } from "react";

import type { FoodPayload } from "../../lib/food-client";
import { createFoodEvent, ensureFoodEntry, isFoodPayload } from "../../lib/food-client";
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
};

function buildRows(agg: AggregationResponse | null): RepeatRow[] {
  if (!agg) return [];
  const rows: RepeatRow[] = [];
  for (const bucket of agg.buckets) {
    if (bucket.key.kind !== "payload") continue;
    const sample = bucket.key.sample;
    if (!isFoodPayload(sample)) continue;
    rows.push({
      name: sample.name,
      count: bucket.count,
      totalKcal: bucket.sum.kcal ?? 0,
      sample,
    });
  }
  return rows;
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
                <span className={styles.name}>{row.sample.name}</span>
                <span className={styles.count}>{copy.countLabel(row.count)}</span>
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
