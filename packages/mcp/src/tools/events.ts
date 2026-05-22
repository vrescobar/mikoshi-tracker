import { z } from "zod";

import {
  eventDeleteResponseSchema,
  eventIdParamsSchema,
  eventItemResponseSchema,
  eventListFiltersSchema,
  eventListResponseSchema,
  updateEventInputSchema,
} from "../contracts/events.js";

import type { MikoshiTrackerApiClient } from "../client/api-client.js";
import type { InventoryTool } from "./catalog.js";
import type { ToolOperation } from "./operation-types.js";

const nonEmptyString = z.string().trim().min(1);

export const updateEventToolInputSchema = z
  .object({
    eventId: nonEmptyString,
    payload: z.unknown().optional(),
    note: z.string().trim().min(1).nullable().optional(),
  })
  .refine((v) => v.payload !== undefined || v.note !== undefined, {
    message: "At least one of payload or note must be provided",
  });

export const eventsTools: InventoryTool[] = [
  {
    name: "events_list",
    method: "GET",
    path: "/events",
    description:
      "List events for a user's entries, with optional filters for entry, type, date range, and pagination.",
    inputSchema: eventListFiltersSchema,
    responseSchema: eventListResponseSchema,
    outputSchema: eventListResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "events_get",
    method: "GET",
    path: "/events/:eventId",
    description:
      "Read one event's full payload, mutations, and attachments by its id.",
    inputSchema: eventIdParamsSchema,
    responseSchema: eventItemResponseSchema,
    outputSchema: eventItemResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "events_update",
    method: "PATCH",
    path: "/events/:eventId",
    description:
      "Partially update an event's payload or note, creating an UPDATE mutation in the audit trail.",
    inputSchema: updateEventToolInputSchema,
    responseSchema: eventItemResponseSchema,
    outputSchema: eventItemResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "events_delete",
    method: "DELETE",
    path: "/events/:eventId",
    description:
      "Soft-delete an event by recording a DELETE mutation; the event remains in the audit trail.",
    inputSchema: eventIdParamsSchema,
    responseSchema: eventDeleteResponseSchema,
    outputSchema: eventDeleteResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "events_undo",
    method: "POST",
    path: "/events/:eventId/undo",
    description:
      "Revert the last non-UNDO mutation on an event by replaying the audit trail.",
    inputSchema: eventIdParamsSchema,
    responseSchema: eventItemResponseSchema,
    outputSchema: eventItemResponseSchema,
    adapter: "passthrough",
  },
];

export function createEventsReadOperations(client: MikoshiTrackerApiClient): Record<string, ToolOperation> {
  return {
    events_list: async (input: unknown) => {
      const parsed = eventListFiltersSchema.parse(input ?? {});
      const params = new URLSearchParams();

      if (parsed.entryId !== undefined) params.set("entryId", parsed.entryId);
      if (parsed.entryTypeSlug !== undefined) params.set("entryTypeSlug", parsed.entryTypeSlug);
      if (parsed.from !== undefined) params.set("from", parsed.from);
      if (parsed.to !== undefined) params.set("to", parsed.to);
      if (parsed.limit !== undefined) params.set("limit", String(parsed.limit));
      if (parsed.cursor !== undefined) params.set("cursor", parsed.cursor);

      const payload = eventListResponseSchema.parse(
        await client.request(`/events?${params.toString()}`),
      );

      return {
        payload,
        summary:
          payload.items.length === 0
            ? "No events found for the requested filters."
            : `${payload.items.length} event(s) returned${payload.hasMore ? "; more available" : ""}.`,
      };
    },
    events_get: async (input: unknown) => {
      const parsed = eventIdParamsSchema.parse(input);
      const payload = eventItemResponseSchema.parse(
        await client.request(`/events/${encodeURIComponent(parsed.eventId)}`),
      );

      return {
        payload,
        summary: `Event ${parsed.eventId} on ${payload.item.dateKey} with ${payload.item.mutations.length} mutation(s).`,
      };
    },
  };
}

export function createEventsWriteOperations(client: MikoshiTrackerApiClient): Record<string, ToolOperation> {
  return {
    events_update: async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const eventId = String(raw.eventId ?? "");
      const { eventId: _rawEventId, ...rest } = raw;
      const parsed = updateEventInputSchema.parse(rest);
      const payload = eventItemResponseSchema.parse(
        await client.request(`/events/${encodeURIComponent(eventId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed),
        }),
      );

      return {
        payload,
        summary: `Updated event ${eventId}.`,
      };
    },
    events_delete: async (input: unknown) => {
      const parsed = eventIdParamsSchema.parse(input);
      const payload = eventDeleteResponseSchema.parse(
        await client.request(`/events/${encodeURIComponent(parsed.eventId)}`, {
          method: "DELETE",
        }),
      );

      return {
        payload,
        summary: `Deleted event ${parsed.eventId} (mutation ${payload.mutationId} recorded in audit trail).`,
      };
    },
    events_undo: async (input: unknown) => {
      const parsed = eventIdParamsSchema.parse(input);
      const payload = eventItemResponseSchema.parse(
        await client.request(`/events/${encodeURIComponent(parsed.eventId)}/undo`, {
          method: "POST",
        }),
      );

      return {
        payload,
        summary: `Undid last mutation on event ${parsed.eventId}.`,
      };
    },
  };
}
