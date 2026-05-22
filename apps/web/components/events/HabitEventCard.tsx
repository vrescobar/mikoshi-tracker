"use client";

import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";
import { useState } from "react";

import { archiveEntry, restoreEntry } from "../../lib/entries-client";
import { getEntriesCopy } from "../../lib/i18n/entries";
import { Badge, Button } from "../ui";
import { useLocale } from "../locale";
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

export function HabitEventCard({ entry, onRefresh }: HabitEventCardProps) {
  const { locale } = useLocale();
  const copy = getEntriesCopy(locale);
  const hc = copy.habitCard;
  const [isPending, setIsPending] = useState(false);
  const config = (entry.config ?? {}) as HabitEntryConfig;

  function formatFrequency(cfg: HabitEntryConfig): string {
    switch (cfg.frequencyType) {
      case "daily":
        return hc.frequency.daily;
      case "weekly_count":
        return hc.frequency.perWeek(cfg.frequencyCount ?? 1);
      case "monthly_count":
        return hc.frequency.perMonth(cfg.frequencyCount ?? 1);
      case "weekdays":
        return hc.frequency.selectedWeekdays;
      default:
        return cfg.frequencyType ?? "—";
    }
  }

  function formatTarget(e: EntryRecord, cfg: HabitEntryConfig): string {
    if (e.entryTypeSlug === "habit_quantity") {
      const val = cfg.targetValue ?? 0;
      const unit = cfg.unit ?? hc.target.units;
      return `${val} ${unit}`;
    }
    return hc.target.checkIn;
  }

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

  const typeBadgeLabel = copy.entryTypeBadge[entry.entryTypeSlug as keyof typeof copy.entryTypeBadge];

  return (
    <article className={styles.card} data-testid="habit-event-card" data-entry-id={entry.id}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <div className={styles.badgeRow}>
            <h2 className={styles.heading}>{entry.name}</h2>
            <EntryTypeBadge slug={entry.entryTypeSlug} displayName={typeBadgeLabel} />
            {entry.category ? <Badge tone="info">{entry.category}</Badge> : null}
          </div>
          <p className={styles.description}>{entry.description ?? hc.noDescription}</p>
        </div>
      </div>

      <div className={styles.metaGrid} data-testid="habit-event-card-meta">
        <div>
          <strong className={styles.metaLabel}>{hc.metaLabels.frequency}</strong>
          {formatFrequency(config)}
        </div>
        <div>
          <strong className={styles.metaLabel}>{hc.metaLabels.target}</strong>
          {formatTarget(entry, config)}
        </div>
        <div>
          <strong className={styles.metaLabel}>{hc.metaLabels.startDate}</strong>
          {entry.startDate}
        </div>
        <div>
          <strong className={styles.metaLabel}>{hc.metaLabels.state}</strong>
          {entry.isActive ? hc.state.active : hc.state.archived}
        </div>
      </div>

      <div className={styles.actions}>
        {entry.isActive ? (
          <Button type="button" variant="secondary" onClick={() => void handleArchive()} disabled={isPending}>
            {hc.actions.archive}
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => void handleRestore()} disabled={isPending}>
            {hc.actions.restore}
          </Button>
        )}
      </div>
    </article>
  );
}
