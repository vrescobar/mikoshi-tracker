import { z } from "zod";

import { sourceSchema } from "@mikoshi-tracker/contracts/envelope";
import {
  entryEventDetailSchema,
  entryEventRecordSchema,
  eventDeleteResponseSchema,
} from "@mikoshi-tracker/contracts/events";

import {
  deleteEvent,
  getEvent,
  listEvents,
  persistEvent,
  undoEvent,
  updateEvent,
} from "../../modules/events/event.service";
import { registerSchema } from "../apiMeta";
import { envelope, envelopeOne, requireUserId } from "../context";
import { sourceToLegacy } from "../shared";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const EntryEvent = registerSchema("EntryEvent", entryEventDetailSchema);
const EntryEventRecord = registerSchema("EntryEventRecord", entryEventRecordSchema);

const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD");
const isoDateTime = z.iso.datetime({ offset: true });

/**
 * v1 events are an append-only audit feed, so the list keeps cursor pagination
 * (the one legacy list that already paginated) rather than offset `{items,total}`.
 * The `source` field is lowercase in v1 and translated to the stored UPPERCASE
 * value at the service boundary (no data migration).
 */
const eventsListQuerySchema = z.object({
  entryId: nonEmpty.optional(),
  entryTypeSlug: nonEmpty.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  cursor: nonEmpty.optional(),
});

const eventsListResponseSchema = z.object({
  items: z.array(EntryEventRecord),
  cursor: nonEmpty.nullable(),
  hasMore: z.boolean(),
});

const eventsCreateInputSchema = z.object({
  entryId: nonEmpty,
  occurredAt: isoDateTime,
  payload: z.unknown(),
  attachmentIds: z.array(nonEmpty).optional(),
  source: sourceSchema.default("web"),
  /** Circle scope, e.g. an AI logging an event on behalf of a circle (source "ai"). */
  onBehalfOfCircleId: nonEmpty.optional(),
  note: z.string().trim().min(1).nullable().optional(),
});

const eventsUpdateInputSchema = z
  .object({
    eventId: nonEmpty,
    payload: z.unknown().optional(),
    note: z.string().trim().min(1).nullable().optional(),
  })
  .refine((v) => v.payload !== undefined || v.note !== undefined, {
    message: "At least one of payload or note must be provided",
  });

const eventIdInputSchema = z.object({ eventId: nonEmpty });

export function eventsV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "events",
      path: "/events",
      operationId: "eventsList",
      summary: "List the caller's events (cursor-paginated audit feed)",
      auth: "bearer",
      mutating: false,
      list: true,
      querySchema: eventsListQuerySchema,
      outputSchema: envelope(eventsListResponseSchema),
      handler: (ctx) =>
        listEvents({ db: ctx.deps.sqlite }, { userId: requireUserId(ctx), filters: ctx.query }),
    },
    {
      method: "GET",
      resource: "events",
      path: "/events/:eventId",
      operationId: "eventsGet",
      summary: "Get one event with its mutation history",
      auth: "bearer",
      mutating: false,
      paramsSchema: eventIdInputSchema,
      outputSchema: envelopeOne(EntryEvent),
      handler: (ctx) =>
        getEvent({ db: ctx.deps.sqlite }, { userId: requireUserId(ctx), eventId: (ctx.params as { eventId: string }).eventId }),
    },
    {
      method: "POST",
      resource: "events",
      path: "/events/create",
      operationId: "eventsCreate",
      summary: "Record an event for an entry",
      auth: "bearer",
      mutating: true,
      successStatus: 201,
      inputSchema: eventsCreateInputSchema,
      outputSchema: envelopeOne(EntryEvent),
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof eventsCreateInputSchema>;
        return persistEvent({ db: ctx.deps.sqlite }, {
          entryId: input.entryId,
          userId: requireUserId(ctx),
          occurredAt: new Date(input.occurredAt),
          payload: input.payload,
          source: sourceToLegacy(input.source),
          note: input.note,
          onBehalfOfCircleId: input.onBehalfOfCircleId,
          attachmentIds: input.attachmentIds ?? [],
        });
      },
    },
    {
      method: "POST",
      resource: "events",
      path: "/events/update",
      operationId: "eventsUpdate",
      summary: "Update an event's payload or note",
      auth: "bearer",
      mutating: true,
      inputSchema: eventsUpdateInputSchema,
      outputSchema: envelopeOne(EntryEvent),
      handler: (ctx) => {
        const { eventId, ...patch } = ctx.input as z.infer<typeof eventsUpdateInputSchema>;
        return updateEvent({ db: ctx.deps.sqlite }, { userId: requireUserId(ctx), eventId, input: patch });
      },
    },
    {
      method: "POST",
      resource: "events",
      path: "/events/delete",
      operationId: "eventsDelete",
      summary: "Soft-delete an event",
      auth: "bearer",
      mutating: true,
      inputSchema: eventIdInputSchema,
      outputSchema: envelope(eventDeleteResponseSchema),
      handler: (ctx) =>
        deleteEvent({ db: ctx.deps.sqlite }, { userId: requireUserId(ctx), eventId: (ctx.input as { eventId: string }).eventId }),
    },
    {
      method: "POST",
      resource: "events",
      path: "/events/undo",
      operationId: "eventsUndo",
      summary: "Undo the latest mutation on an event",
      auth: "bearer",
      mutating: true,
      inputSchema: eventIdInputSchema,
      outputSchema: envelopeOne(EntryEvent),
      handler: (ctx) =>
        undoEvent({ db: ctx.deps.sqlite }, { userId: requireUserId(ctx), eventId: (ctx.input as { eventId: string }).eventId }),
    },
  ];
}
