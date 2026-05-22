"use client";

import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";
import { useState } from "react";

import { listEntries } from "../../lib/entries-client";
import { EventCard } from "../events/EventCard";
import { PageFrame, PageHeader, StatePanel, Surface } from "../ui";
import styles from "./entries-page.module.css";

type EntriesPageProps = {
  initialItems: EntryRecord[];
  entryTypeSlug?: string;
};

function resolveTitle(entryTypeSlug: string | undefined): string {
  if (!entryTypeSlug) return "Entries";
  if (entryTypeSlug.includes("habit")) return "Habits";
  if (entryTypeSlug.includes("food")) return "Food";
  return "Entries";
}

export function EntriesPage({ initialItems, entryTypeSlug }: EntriesPageProps) {
  const [items, setItems] = useState(initialItems);

  async function handleRefresh() {
    const nextItems = await listEntries({ entryTypeSlug, isActive: true });
    setItems(nextItems);
  }

  const title = resolveTitle(entryTypeSlug);

  return (
    <div className={styles.stack} data-testid="entries-page">
      <Surface variant="hero">
        <PageFrame>
          <PageHeader eyebrow="Entries" title={title} description="Review and manage your entries." />
        </PageFrame>
      </Surface>

      <div className={styles.list}>
        {items.length > 0 ? (
          items.map((entry) => <EventCard key={entry.id} entry={entry} onRefresh={() => void handleRefresh()} />)
        ) : (
          <StatePanel title="No entries" description="No entries match the current filters." />
        )}
      </div>
    </div>
  );
}
