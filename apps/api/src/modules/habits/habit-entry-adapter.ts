/**
 * Adapter between the legacy habit shapes and the generic Entry engine (tarea 41).
 *
 * Habits are now stored as `Entry` rows of type `habit_boolean` / `habit_quantity`,
 * and check-ins as `EntryEvent` + `EventMutation`. The habit/today/checkin services
 * keep their byte-identical external contracts by having their *repositories* read and
 * write the generic tables through these helpers, which translate to and from the
 * legacy in-memory shapes the services already consume.
 *
 * Casing contract (must match the rest of the system):
 *  - habit kind is the stored UPPERCASE form ("BOOLEAN"/"QUANTITY"); EntryType slug is
 *    lowercase ("habit_boolean"/"habit_quantity").
 *  - config.frequencyType is stored UPPERCASE ("DAILY"…); EntryWeekday.day is lowercase
 *    ("monday"), while the legacy habit weekday shape is UPPERCASE ("MONDAY").
 */

export const HABIT_ENTRY_TYPE_SLUGS = ["habit_boolean", "habit_quantity"] as const;

const FREQUENCY_TYPE_TO_STORED: Record<string, string> = {
  daily: "DAILY",
  weekly_count: "WEEKLY_COUNT",
  weekdays: "WEEKDAYS",
  monthly_count: "MONTHLY_COUNT",
};

export function habitKindToSlug(kind: "boolean" | "quantity"): string {
  return kind === "quantity" ? "habit_quantity" : "habit_boolean";
}

export function slugToStoredKind(slug: string): string {
  return slug === "habit_quantity" ? "QUANTITY" : "BOOLEAN";
}

function frequencyToStored(frequencyType: string): string {
  const stored = FREQUENCY_TYPE_TO_STORED[frequencyType];
  if (!stored) {
    throw new Error(`Unsupported frequency type: ${frequencyType}`);
  }
  return stored;
}

type HabitConfig = {
  frequencyType: string;
  frequencyCount: number | null;
  targetValue?: number | null;
  unit?: string | null;
};

/**
 * Serialize a normalized habit (lowercase kind/frequency) into the entry `config`
 * JSON string. Quantity habits carry `targetValue`/`unit`; boolean habits do not
 * (the habit_boolean config schema is `additionalProperties: false`).
 */
export function buildHabitConfig(input: {
  kind: "boolean" | "quantity";
  frequencyType: string;
  frequencyCount: number | null;
  targetValue: number | null;
  unit: string | null;
}): string {
  const config: HabitConfig = {
    frequencyType: frequencyToStored(input.frequencyType),
    frequencyCount: input.frequencyCount,
  };
  if (input.kind === "quantity") {
    config.targetValue = input.targetValue ?? 0;
    config.unit = input.unit;
  }
  return JSON.stringify(config);
}

/** Build an `EntryEvent.payload` for a habit check-in by kind. */
export function buildHabitPayload(storedKind: string, value: number | null, completed: boolean): string {
  if (storedKind === "QUANTITY") {
    return JSON.stringify({ value: value ?? 0, completed });
  }
  return JSON.stringify({ completed });
}

export type EntryRowForHabit = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  category: string | null;
  config: string;
  startDate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  entryType: { slug: string };
  weekdays: Array<{ day: string }>;
};

export type MappedHabit = {
  id: string;
  userId: string;
  name: string;
  kind: string;
  description: string | null;
  category: string | null;
  targetValue: number | null;
  unit: string | null;
  startDate: string;
  isActive: boolean;
  frequencyType: string;
  frequencyCount: number | null;
  weekdays: Array<{ day: string }>;
  createdAt: Date;
  updatedAt: Date;
};

/** Map an `Entry` (with its entryType slug + weekdays) back to the legacy habit shape. */
export function mapEntryToHabit(entry: EntryRowForHabit): MappedHabit {
  const config = JSON.parse(entry.config) as HabitConfig;
  return {
    id: entry.id,
    userId: entry.userId,
    name: entry.name,
    kind: slugToStoredKind(entry.entryType.slug),
    description: entry.description,
    category: entry.category,
    targetValue: config.targetValue ?? null,
    unit: config.unit ?? null,
    startDate: entry.startDate,
    isActive: entry.isActive,
    frequencyType: config.frequencyType,
    frequencyCount: config.frequencyCount ?? null,
    weekdays: entry.weekdays.map((weekday) => ({ day: weekday.day.toUpperCase() })),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}
