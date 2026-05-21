import {
  type CreateEntryEventInput,
  createEntryEventInputSchema,
} from "@mikoshi-tracker/contracts/entries";
import {
  type EventIdParams,
  type EventListFilters,
  type UpdateEventInput,
  eventIdParamsSchema,
  eventListFiltersSchema,
  updateEventInputSchema,
} from "@mikoshi-tracker/contracts/events";

export function parseCreateEventInput(input: unknown): CreateEntryEventInput {
  return createEntryEventInputSchema.parse(input);
}

export function parseUpdateEventInput(input: unknown): UpdateEventInput {
  return updateEventInputSchema.parse(input);
}

export function parseEventListFilters(input: unknown): EventListFilters {
  return eventListFiltersSchema.parse(input ?? {});
}

export function parseEventIdParams(input: unknown): EventIdParams {
  return eventIdParamsSchema.parse(input);
}
