import { z } from "zod";

import type { MikoshiTrackerApiClient } from "../client/api-client.js";
import type { InventoryTool } from "./catalog.js";
import type { ToolOperation } from "./operation-types.js";

// Phase 13 G-MCP-1: end-to-end "log a meal" convenience tools that bounce
// through the tracker's /api/skills/run bridge to the Mikoshi food skill.
// Agents call these directly instead of composing entries.list + events.create
// manually.

const foodLogTextInputSchema = z.object({
  text: z.string().trim().min(1),
});

const foodLogImageInputSchema = z.object({
  imageBase64: z.string().trim().min(1),
});

const foodLogResponseSchema = z
  .object({
    action: z
      .enum(["auto_posted", "pending_confirmation", "needs_enrolment", "error"])
      .optional(),
  })
  .passthrough();

// ── Food vocabulary tools (Epic C) — call the v1 endpoints and unwrap {ok,data}.
const v1Envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ ok: z.literal(true), data });

const foodSearchInputSchema = z.object({
  q: z.string().trim().min(1),
  limit: z.number().int().positive().max(50).optional(),
  sources: z.string().optional(),
});

const foodSearchResultSchema = z.object({
  kind: z.enum(["item", "meal"]),
  eventId: z.string(),
  name: z.string(),
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number().nullable(),
  defaultPortionG: z.number().nullable(),
  isRecipe: z.boolean().nullable(),
  usageCount: z.number(),
  lastUsedAt: z.string(),
});
const foodSearchDataSchema = z.object({ results: z.array(foodSearchResultSchema) });

const foodRelogInputSchema = z.object({
  sourceEventId: z.string().trim().min(1),
  occurredAt: z.string().optional(),
  mealSlot: z.enum(["breakfast", "lunch", "snack", "dinner", "other"]).nullable().optional(),
  portionScale: z.number().positive().optional(),
});
const foodRelogDataSchema = z.object({
  eventId: z.string(),
  name: z.string(),
  kcal: z.number(),
  mealSlot: z.enum(["breakfast", "lunch", "snack", "dinner", "other"]).nullable(),
});

export const foodTools: InventoryTool[] = [
  {
    name: "food_log_text",
    method: "POST",
    path: "/skills/run",
    description:
      "Log a meal from a free-text description (e.g. 'tuna salad with two slices of bread') via the Mikoshi food skill. Returns the skill's stdout: 'auto_posted' carries the saved event, 'pending_confirmation' carries an editable proposal, 'needs_enrolment' means the skill is not configured yet.",
    inputSchema: foodLogTextInputSchema,
    responseSchema: foodLogResponseSchema,
    outputSchema: foodLogResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "food_log_image",
    method: "POST",
    path: "/skills/run",
    description:
      "Log a meal from a base64-encoded photo via the Mikoshi food skill. Same response shape as food_log_text.",
    inputSchema: foodLogImageInputSchema,
    responseSchema: foodLogResponseSchema,
    outputSchema: foodLogResponseSchema,
    adapter: "passthrough",
  },
  {
    name: "food_search",
    method: "GET",
    path: "/v1/food/search",
    description:
      "Fuzzy-search the user's saved food items/recipes and previously-logged meals by name or alias. Returns ranked results (saved items first, then recent/frequent meals) with macros and the eventId to re-log from. Use before food_relog to resolve a vague request like 'log my usual oatmeal'.",
    inputSchema: foodSearchInputSchema,
    responseSchema: foodSearchDataSchema,
    outputSchema: foodSearchDataSchema,
    adapter: "passthrough",
  },
  {
    name: "food_relog",
    method: "POST",
    path: "/v1/food/relog",
    description:
      "Re-log a previous meal or saved item (by its eventId from food_search) as a new meal today. Optionally scale by portionScale and set mealSlot. Copies the source macros and links provenance back to the original.",
    inputSchema: foodRelogInputSchema,
    responseSchema: foodRelogDataSchema,
    outputSchema: foodRelogDataSchema,
    adapter: "passthrough",
  },
];

export function createFoodReadOperations(
  client: MikoshiTrackerApiClient,
): Record<string, ToolOperation> {
  return {
    food_search: async (input: unknown) => {
      const parsed = foodSearchInputSchema.parse(input ?? {});
      const params = new URLSearchParams({ q: parsed.q });
      if (parsed.limit !== undefined) params.set("limit", String(parsed.limit));
      if (parsed.sources !== undefined) params.set("sources", parsed.sources);
      const env = v1Envelope(foodSearchDataSchema).parse(
        await client.request(`/v1/food/search?${params.toString()}`),
      );
      return {
        payload: env.data,
        summary:
          env.data.results.length === 0
            ? `No saved foods or past meals matched "${parsed.q}".`
            : `${env.data.results.length} match(es): ${env.data.results.map((r) => r.name).join(", ")}.`,
      };
    },
  };
}

export function createFoodWriteOperations(
  client: MikoshiTrackerApiClient,
): Record<string, ToolOperation> {
  return {
    food_log_text: async (input: unknown) => {
      const parsed = foodLogTextInputSchema.parse(input);
      const payload = foodLogResponseSchema.parse(
        await client.request("/skills/run", {
          method: "POST",
          body: JSON.stringify({
            skillSlug: "mikoshi-tracker-food",
            input: { tool: "food_log_from_input", text: parsed.text },
          }),
        }),
      );
      const action = typeof payload.action === "string" ? payload.action : "unknown";
      return {
        payload,
        summary: `Food skill ran on text input (${action}).`,
      };
    },
    food_log_image: async (input: unknown) => {
      const parsed = foodLogImageInputSchema.parse(input);
      const payload = foodLogResponseSchema.parse(
        await client.request("/skills/run", {
          method: "POST",
          body: JSON.stringify({
            skillSlug: "mikoshi-tracker-food",
            input: { tool: "food_log_from_input", imageBase64: parsed.imageBase64 },
          }),
        }),
      );
      const action = typeof payload.action === "string" ? payload.action : "unknown";
      return {
        payload,
        summary: `Food skill ran on image input (${action}).`,
      };
    },
    food_relog: async (input: unknown) => {
      const parsed = foodRelogInputSchema.parse(input);
      const env = v1Envelope(foodRelogDataSchema).parse(
        await client.request("/v1/food/relog", {
          method: "POST",
          body: JSON.stringify(parsed),
        }),
      );
      return {
        payload: env.data,
        summary: `Re-logged "${env.data.name}" (${Math.round(env.data.kcal)} kcal).`,
      };
    },
  };
}
