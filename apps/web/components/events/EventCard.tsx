import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";

import { HabitEventCard } from "./HabitEventCard";

type EventCardProps = {
  entry: EntryRecord;
  onRefresh?: () => void;
};

const HABIT_SLUGS = new Set(["habit_boolean", "habit_quantity"]);

export function EventCard({ entry, onRefresh }: EventCardProps) {
  if (HABIT_SLUGS.has(entry.entryTypeSlug)) {
    return <HabitEventCard entry={entry} onRefresh={onRefresh} />;
  }

  return (
    <article data-testid="default-event-card" data-entry-type-slug={entry.entryTypeSlug} data-entry-id={entry.id}>
      <span>{entry.name}</span>
    </article>
  );
}
