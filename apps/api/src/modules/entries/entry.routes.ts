import { z } from "zod";
import type { FastifyInstance } from "fastify";

import {
  commonAuthErrorResponses,
  commonNotFoundResponse,
} from "@mikoshi-tracker/contracts/api";
import {
  createEntryInputSchema,
  entryIdParamsSchema,
  entryItemResponseSchema,
  entryListResponseSchema,
  updateEntryInputSchema,
} from "@mikoshi-tracker/contracts/entries";

import type { PublicApiRouteDefinition } from "../../plugins/openapi";
import {
  archiveEntryHandler,
  createEntryHandler,
  getEntryHandler,
  listEntriesHandler,
  restoreEntryHandler,
  updateEntryHandler,
} from "./entry.controller";

// Documentation-safe query schema — strips the transform on isActive so z.toJSONSchema succeeds.
const entryListQueryParamsDocSchema = z.object({
  entryTypeSlug: z.string().optional(),
  isActive: z.boolean().optional(),
  query: z.string().optional(),
});

const entryInactiveResponseDoc = {
  description: "The entry is archived and must be restored before it can be changed.",
  schema: z.object({ code: z.literal("ENTRY_INACTIVE"), message: z.string() }),
} as const;

const entryBadRequestResponseDoc = {
  description: "The submitted entry payload is invalid.",
  schema: z.object({ code: z.literal("BAD_REQUEST"), message: z.string() }),
} as const;

export const entryApiRouteDefinitions: PublicApiRouteDefinition[] = [
  {
    method: "GET",
    path: "/api/entries",
    operationId: "listEntries",
    summary: "List entries",
    description:
      "Returns the authenticated user's entries. Filter by entryTypeSlug (comma-separated slugs), isActive, or a free-text query.",
    tags: ["Entries"],
    security: [{ BearerAuth: [] }],
    request: {
      query: entryListQueryParamsDocSchema,
    },
    responses: {
      200: {
        description: "The requested entry collection.",
        schema: entryListResponseSchema,
        examples: {
          habits: {
            summary: "Habit entries",
            value: {
              items: [
                {
                  id: "entry_abc123",
                  userId: "user_123",
                  entryTypeId: "entrytype_habit_boolean",
                  entryTypeSlug: "habit_boolean",
                  name: "Morning Run",
                  description: null,
                  category: "health",
                  config: { frequencyType: "DAILY" },
                  startDate: "2026-05-01",
                  isActive: true,
                  weekdays: [],
                  createdAt: "2026-05-01T08:00:00.000Z",
                  updatedAt: "2026-05-01T08:00:00.000Z",
                },
              ],
            },
          },
        },
      },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "POST",
    path: "/api/entries",
    operationId: "createEntry",
    summary: "Create an entry",
    description:
      "Creates a new entry for the authenticated user. The config field is validated against the EntryType.configSchema at runtime.",
    tags: ["Entries"],
    security: [{ BearerAuth: [] }],
    request: {
      body: createEntryInputSchema,
      bodyExamples: {
        booleanHabit: {
          summary: "Boolean daily habit",
          value: {
            entryTypeSlug: "habit_boolean",
            name: "Morning Run",
            category: "health",
            config: { frequencyType: "DAILY" },
            startDate: "2026-05-01",
          },
        },
        foodMeal: {
          summary: "Food meal entry",
          value: {
            entryTypeSlug: "food_meal",
            name: "Food diary",
            config: {},
            startDate: "2026-05-01",
          },
        },
      },
    },
    responses: {
      201: {
        description: "The created entry.",
        schema: entryItemResponseSchema,
      },
      400: entryBadRequestResponseDoc,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/entries/:id",
    operationId: "getEntry",
    summary: "Get entry",
    description: "Returns the full entry record for the authenticated user.",
    tags: ["Entries"],
    security: [{ BearerAuth: [] }],
    request: {
      params: entryIdParamsSchema,
    },
    responses: {
      200: {
        description: "The requested entry.",
        schema: entryItemResponseSchema,
      },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "PATCH",
    path: "/api/entries/:id",
    operationId: "updateEntry",
    summary: "Update an entry",
    description: "Updates editable entry fields (name, description, category, config). At least one field required.",
    tags: ["Entries"],
    security: [{ BearerAuth: [] }],
    request: {
      params: entryIdParamsSchema,
      body: updateEntryInputSchema,
    },
    responses: {
      200: {
        description: "The updated entry.",
        schema: entryItemResponseSchema,
      },
      400: entryBadRequestResponseDoc,
      404: commonNotFoundResponse,
      409: entryInactiveResponseDoc,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "POST",
    path: "/api/entries/:id/archive",
    operationId: "archiveEntry",
    summary: "Archive an entry",
    description: "Archives the entry while preserving all historical event data.",
    tags: ["Entries"],
    security: [{ BearerAuth: [] }],
    request: {
      params: entryIdParamsSchema,
    },
    responses: {
      200: {
        description: "The archived entry.",
        schema: entryItemResponseSchema,
      },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "POST",
    path: "/api/entries/:id/restore",
    operationId: "restoreEntry",
    summary: "Restore an archived entry",
    description: "Restores an archived entry and makes it writable again.",
    tags: ["Entries"],
    security: [{ BearerAuth: [] }],
    request: {
      params: entryIdParamsSchema,
    },
    responses: {
      200: {
        description: "The restored entry.",
        schema: entryItemResponseSchema,
      },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
];

export async function registerEntryRoutes(app: FastifyInstance) {
  app.get("/api/entries", listEntriesHandler);
  app.post("/api/entries", createEntryHandler);
  app.get("/api/entries/:id", getEntryHandler);
  app.patch("/api/entries/:id", updateEntryHandler);
  app.post("/api/entries/:id/archive", archiveEntryHandler);
  app.post("/api/entries/:id/restore", restoreEntryHandler);
}
