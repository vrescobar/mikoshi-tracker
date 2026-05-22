import { z } from "zod";
import type { FastifyInstance } from "fastify";

import {
  commonAuthErrorResponses,
  commonNotFoundResponse,
} from "@mikoshi-tracker/contracts/api";
import {
  entryIdParamsSchema,
} from "@mikoshi-tracker/contracts/entries";
import {
  eventDeleteResponseSchema,
  eventIdParamsSchema,
  eventItemResponseSchema,
  eventListResponseSchema,
  updateEventInputSchema,
} from "@mikoshi-tracker/contracts/events";

import type { PublicApiRouteDefinition } from "../../plugins/openapi";
import {
  createEventHandler,
  deleteEventHandler,
  getEventHandler,
  listEventsHandler,
  undoEventHandler,
  updateEventHandler,
} from "./event.controller";

// Documentation-safe query schema — strips the string->number transform on limit.
const eventListQueryParamsDocSchema = z.object({
  entryId: z.string().optional(),
  entryTypeSlug: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().positive().optional(),
  cursor: z.string().optional(),
});

// Per-type payload schemas for the oneOf documentation of POST /api/entries/:id/events.
const habitBooleanPayloadDocSchema = z.object({
  completed: z.boolean(),
});

const habitQuantityPayloadDocSchema = z.object({
  value: z.number(),
  completed: z.boolean(),
});

const foodMealPayloadDocSchema = z.object({
  name: z.string(),
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative().nullable().optional(),
  sugar_g: z.number().nonnegative().nullable().optional(),
  portion_g: z.number().nonnegative().nullable().optional(),
  mealSlot: z.enum(["breakfast", "lunch", "snack", "dinner", "other"]).nullable().optional(),
  source: z.enum(["label", "similar_to_event", "web_lookup", "vision_only", "manual"]),
  confidence: z.number().min(0).max(1),
  similarToEventId: z.string().nullable().optional(),
  sources: z.array(z.string()).nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Body schema for POST /api/entries/:id/events with payload documented as oneOf the built-in types.
const createEntryEventDocSchema = z.object({
  occurredAt: z.string().datetime({ offset: true }),
  payload: z.union([habitBooleanPayloadDocSchema, habitQuantityPayloadDocSchema, foodMealPayloadDocSchema]),
  attachmentIds: z.array(z.string().trim().min(1)).optional(),
  source: z.enum(["WEB", "AI", "SYSTEM", "CIRCLE"]).default("WEB"),
  note: z.string().trim().min(1).nullable().optional(),
});

const eventBadRequestResponseDoc = {
  description: "The submitted event payload is invalid or fails schema validation.",
  schema: z.object({ code: z.literal("BAD_REQUEST"), message: z.string() }),
} as const;

const eventGoneResponseDoc = {
  description: "The event has been soft-deleted and is no longer accessible.",
  schema: z.object({ code: z.literal("NOT_FOUND"), message: z.string() }),
} as const;

export const eventApiRouteDefinitions: PublicApiRouteDefinition[] = [
  {
    method: "POST",
    path: "/api/entries/:id/events",
    operationId: "createEntryEvent",
    summary: "Create an event",
    description:
      "Creates an event for the given entry. The payload is validated at runtime against the EntryType.payloadSchema. " +
      "For cadence=recurring entries (habit_boolean, habit_quantity), events are upserted per day — a second POST for the same dateKey updates the existing event and adds a new mutation to the audit trail. " +
      "The payload field is one of the three built-in type shapes; custom EntryTypes may define additional schemas.",
    tags: ["Events"],
    security: [{ BearerAuth: [] }],
    request: {
      params: entryIdParamsSchema,
      body: createEntryEventDocSchema,
      bodyExamples: {
        booleanComplete: {
          summary: "Boolean habit complete",
          value: {
            occurredAt: "2026-05-22T08:30:00.000Z",
            payload: { completed: true },
            source: "WEB",
          },
        },
        quantitySet: {
          summary: "Quantity habit set-total",
          value: {
            occurredAt: "2026-05-22T08:30:00.000Z",
            payload: { value: 3, completed: true },
            source: "WEB",
          },
        },
        foodMeal: {
          summary: "Food meal record",
          value: {
            occurredAt: "2026-05-22T12:00:00.000Z",
            payload: {
              name: "Chicken salad",
              kcal: 450,
              protein_g: 35,
              carbs_g: 20,
              fat_g: 18,
              source: "manual",
              confidence: 1.0,
            },
            source: "WEB",
          },
        },
      },
    },
    responses: {
      201: {
        description: "The created or upserted event.",
        schema: eventItemResponseSchema,
      },
      400: eventBadRequestResponseDoc,
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/events",
    operationId: "listEvents",
    summary: "List events",
    description:
      "Returns events for the authenticated user. Filter by entryId, entryTypeSlug, or date range. Supports cursor-based pagination.",
    tags: ["Events"],
    security: [{ BearerAuth: [] }],
    request: {
      query: eventListQueryParamsDocSchema,
    },
    responses: {
      200: {
        description: "Paginated event collection.",
        schema: eventListResponseSchema,
      },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/events/:eventId",
    operationId: "getEvent",
    summary: "Get event detail",
    description: "Returns the full event record including the complete mutation audit trail and any attachments.",
    tags: ["Events"],
    security: [{ BearerAuth: [] }],
    request: {
      params: eventIdParamsSchema,
    },
    responses: {
      200: {
        description: "The requested event with mutations and attachments.",
        schema: eventItemResponseSchema,
      },
      404: eventGoneResponseDoc,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "PATCH",
    path: "/api/events/:eventId",
    operationId: "updateEvent",
    summary: "Update an event",
    description:
      "Partially updates the event payload and/or note. Creates an UPDATE mutation in the audit trail. At least one of payload or note must be provided.",
    tags: ["Events"],
    security: [{ BearerAuth: [] }],
    request: {
      params: eventIdParamsSchema,
      body: updateEventInputSchema,
    },
    responses: {
      200: {
        description: "The updated event.",
        schema: eventItemResponseSchema,
      },
      400: eventBadRequestResponseDoc,
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "DELETE",
    path: "/api/events/:eventId",
    operationId: "deleteEvent",
    summary: "Delete an event",
    description:
      "Soft-deletes the event by creating a DELETE mutation in the audit trail. The underlying row is retained for audit purposes but will not appear in list or get responses.",
    tags: ["Events"],
    security: [{ BearerAuth: [] }],
    request: {
      params: eventIdParamsSchema,
    },
    responses: {
      200: {
        description: "Deletion confirmation with the eventId and new mutationId.",
        schema: eventDeleteResponseSchema,
      },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "POST",
    path: "/api/events/:eventId/undo",
    operationId: "undoEvent",
    summary: "Undo last event mutation",
    description:
      "Reverts the most recent non-UNDO mutation for this event by creating an UNDO mutation in the audit trail. The event payload is restored to its state before the last change.",
    tags: ["Events"],
    security: [{ BearerAuth: [] }],
    request: {
      params: eventIdParamsSchema,
    },
    responses: {
      200: {
        description: "The event after the undo.",
        schema: eventItemResponseSchema,
      },
      400: eventBadRequestResponseDoc,
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
];

export async function registerEventRoutes(app: FastifyInstance) {
  app.post("/api/entries/:id/events", createEventHandler);
  app.get("/api/events", listEventsHandler);
  app.get("/api/events/:eventId", getEventHandler);
  app.patch("/api/events/:eventId", updateEventHandler);
  app.delete("/api/events/:eventId", deleteEventHandler);
  app.post("/api/events/:eventId/undo", undoEventHandler);
}
