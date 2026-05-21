import {
  type CreateEntryInput,
  type EntryListFilters,
  type UpdateEntryInput,
  createEntryInputSchema,
  entryListFiltersSchema,
  updateEntryInputSchema,
} from "@mikoshi-tracker/contracts/entries";

const KNOWN_WEEKDAYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export type NormalizedCreateEntryInput = {
  entryTypeSlug: string;
  name: string;
  description: string | null;
  category: string | null;
  config: unknown;
  startDate: string;
  weekdays: string[];
};

type NormalizeCreateEntryOptions = {
  today: string;
};

export function parseCreateEntryInput(input: unknown): CreateEntryInput {
  return createEntryInputSchema.parse(input);
}

export function parseUpdateEntryInput(input: unknown): UpdateEntryInput {
  return updateEntryInputSchema.parse(input);
}

export function parseEntryListFilters(input: unknown): EntryListFilters {
  return entryListFiltersSchema.parse(input ?? {});
}

export function normalizeCreateEntryInput(
  input: CreateEntryInput,
  options: NormalizeCreateEntryOptions,
): NormalizedCreateEntryInput {
  const weekdays = (input.weekdays ?? []).map((day) => {
    const normalized = day.trim().toLowerCase();
    if (!KNOWN_WEEKDAYS.has(normalized)) {
      throw new Error(`Unsupported weekday: ${day}`);
    }
    return normalized;
  });

  return {
    entryTypeSlug: input.entryTypeSlug,
    name: input.name,
    description: input.description ?? null,
    category: input.category ?? null,
    config: input.config,
    startDate: input.startDate ?? options.today,
    weekdays: Array.from(new Set(weekdays)),
  };
}
