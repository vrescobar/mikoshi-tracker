"use client";

import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";
import { useState } from "react";

import { listEntries } from "../../lib/entries-client";
import { getEntriesCopy } from "../../lib/i18n/entries";
import type { EntryTypeRecord } from "../../lib/server-auth";
import { EventCard } from "../events/EventCard";
import { useLocale } from "../locale";
import { PageFrame, PageHeader, StatePanel, Surface } from "../ui";
import { EntryTypeFilter } from "./entry-type-filter";
import styles from "./entries-page.module.css";

type EntriesPageProps = {
  initialItems: EntryRecord[];
  entryTypeSlug?: string;
  entryTypes?: EntryTypeRecord[];
};

export function EntriesPage({ initialItems, entryTypeSlug, entryTypes }: EntriesPageProps) {
  const { locale } = useLocale();
  const copy = getEntriesCopy(locale);
  const [items, setItems] = useState(initialItems);

  async function handleRefresh() {
    const nextItems = await listEntries({ entryTypeSlug, isActive: true });
    setItems(nextItems);
  }

  function resolveTitle(): string {
    if (!entryTypeSlug) return copy.page.titles.entries;
    if (entryTypeSlug.includes("habit")) return copy.page.titles.habits;
    if (entryTypeSlug.includes("food")) return copy.page.titles.food;
    return copy.page.titles.entries;
  }

  return (
    <div className={styles.stack} data-testid="entries-page">
      <Surface variant="hero">
        <PageFrame>
          <PageHeader
            eyebrow={copy.page.header.eyebrow}
            title={resolveTitle()}
            description={copy.page.header.description}
          />
        </PageFrame>
      </Surface>

      {entryTypes && entryTypes.length > 0 ? (
        <EntryTypeFilter
          entryTypes={entryTypes}
          copy={{
            label: copy.filter.label,
            all: copy.filter.all,
            slugs: copy.entryTypeBadge,
          }}
        />
      ) : null}

      <div className={styles.list}>
        {items.length > 0 ? (
          items.map((entry) => <EventCard key={entry.id} entry={entry} onRefresh={() => void handleRefresh()} />)
        ) : (
          <StatePanel title={copy.page.emptyState.title} description={copy.page.emptyState.description} />
        )}
      </div>
    </div>
  );
}
