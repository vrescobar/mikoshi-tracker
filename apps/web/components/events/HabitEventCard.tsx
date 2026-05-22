"use client";

import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";
import { useState } from "react";

import { archiveEntry, restoreEntry } from "../../lib/entries-client";
import { Badge, Button } from "../ui";
import { EntryTypeBadge } from "../entry-types/EntryTypeBadge";
import styles from "./HabitEventCard.module.css";

type HabitEntryConfig = {
  frequencyType?: string;
  frequencyCount?: number | null;
  targetValue?: number | null;
  unit?: string | null;
};

type HabitEventCardProps = {
  entry: EntryRecord;
  onRefresh?: () => void;
};

function formatFrequency(config: HabitEntryConfig): string {
  switch (config.frequencyType) {
    case "daily":
      return "Daily";
    case "weekly_count":
      return `${config.frequencyCount ?? 1}× per week`;
    case "monthly_count":
      return `${config.frequencyCount ?? 1}× per month`;
    case "weekdays":
      return "Selected weekdays";
    default:
      return config.frequencyType ?? "—";
  }
}

function formatTarget(entry: EntryRecord, config: HabitEntryConfig): string {
  if (entry.entryTypeSlug === "habit_quantity") {
    const val = config.targetValue ?? 0;
    const unit = config.unit ?? "units";
    return `${val} ${unit}`;
  }
  return "Check-in";
}

export function HabitEventCard({ entry, onRefresh }: HabitEventCardProps) {
  const [isPending, setIsPending] = useState(false);
  const config = (entry.config ?? {}) as HabitEntryConfig;

  async function handleArchive() {
    setIsPending(true);
    try {
      await archiveEntry(entry.id);
      onRefresh?.();
    } finally {
      setIsPending(false);
    }
  }

  async function handleRestore() {
    setIsPending(true);
    try {
      await restoreEntry(entry.id);
      onRefresh?.();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <article className={styles.card} data-testid="habit-event-card" data-entry-id={entry.id}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <div className={styles.badgeRow}>
            <h2 className={styles.heading}>{entry.name}</h2>
            <EntryTypeBadge slug={entry.entryTypeSlug} />
            {entry.category ? <Badge tone="info">{entry.category}</Badge> : null}
          </div>
          <p className={styles.description}>{entry.description ?? "No description yet."}</p>
        </div>
      </div>

      <div className={styles.metaGrid} data-testid="habit-event-card-meta">
        <div>
          <strong className={styles.metaLabel}>Frequency</strong>
          {formatFrequency(config)}
        </div>
        <div>
          <strong className={styles.metaLabel}>Target</strong>
          {formatTarget(entry, config)}
        </div>
        <div>
          <strong className={styles.metaLabel}>Start date</strong>
          {entry.startDate}
        </div>
        <div>
          <strong className={styles.metaLabel}>State</strong>
          {entry.isActive ? "Active" : "Archived"}
        </div>
      </div>

      <div className={styles.actions}>
        {entry.isActive ? (
          <Button type="button" variant="secondary" onClick={() => void handleArchive()} disabled={isPending}>
            Archive
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => void handleRestore()} disabled={isPending}>
            Restore
          </Button>
        )}
      </div>
    </article>
  );
}
