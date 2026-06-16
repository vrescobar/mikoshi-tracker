import { z } from "zod";

import type { MikoshiTrackerApiClient } from "../client/api-client.js";
import type { InventoryTool } from "./catalog.js";
import type { ToolOperation } from "./operation-types.js";

// Diet goal + preferences tools (Epic C). Thin wrappers over the v1 diet
// endpoints; they unwrap the {ok,data} envelope and validate the data shape.

const v1Envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ ok: z.literal(true), data });

const dietGoalInputSchema = z.object({
  kcalTarget: z.number().positive(),
  proteinTargetG: z.number().nonnegative().nullable().optional(),
  carbsTargetG: z.number().nonnegative().nullable().optional(),
  fatTargetG: z.number().nonnegative().nullable().optional(),
  macroMode: z.enum(["grams", "percent"]).nullable().optional(),
  proteinPct: z.number().min(0).max(100).nullable().optional(),
  carbsPct: z.number().min(0).max(100).nullable().optional(),
  fatPct: z.number().min(0).max(100).nullable().optional(),
  breakfastKcal: z.number().nonnegative().nullable().optional(),
  lunchKcal: z.number().nonnegative().nullable().optional(),
  dinnerKcal: z.number().nonnegative().nullable().optional(),
  snackKcal: z.number().nonnegative().nullable().optional(),
  objective: z.enum(["lose", "maintain", "gain"]).nullable().optional(),
  linkedWeightGoalKg: z.number().positive().nullable().optional(),
  effectiveFrom: z.string().nullable().optional(),
  source: z.enum(["manual", "ai", "computed"]).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  notes: z.string().nullable().optional(),
});

const dietGoalDataSchema = z.object({ goal: z.record(z.string(), z.unknown()).nullable() });

const dietPreferencesSchema = z.object({
  dietStyle: z.string().nullable().optional(),
  allergies: z.array(z.string()).nullable().optional(),
  dislikes: z.array(z.string()).nullable().optional(),
  defaultMealSlot: z.enum(["breakfast", "lunch", "snack", "dinner", "other"]).nullable().optional(),
  units: z.enum(["metric", "imperial"]).nullable().optional(),
});
const dietPreferencesDataSchema = z.object({ preferences: dietPreferencesSchema });

const emptyInputSchema = z.object({}).strict();

export const dietTools: InventoryTool[] = [
  {
    name: "diet_get_goal",
    method: "GET",
    path: "/v1/diet/goal",
    description:
      "Get the user's active diet goal (daily kcal + macro/per-meal targets, objective), or null if none is set.",
    inputSchema: emptyInputSchema,
    responseSchema: dietGoalDataSchema,
    outputSchema: dietGoalDataSchema,
    adapter: "passthrough",
  },
  {
    name: "diet_set_goal",
    method: "POST",
    path: "/v1/diet/goal",
    description:
      "Set the user's diet goal. Appends a dated revision (history is preserved). At minimum provide kcalTarget; macro targets, per-meal-slot kcal, and objective (lose/maintain/gain) are optional.",
    inputSchema: dietGoalInputSchema,
    responseSchema: dietGoalDataSchema,
    outputSchema: dietGoalDataSchema,
    adapter: "passthrough",
  },
  {
    name: "diet_get_preferences",
    method: "GET",
    path: "/v1/diet/preferences",
    description:
      "Get the user's dietary preferences (diet style, allergies, dislikes, default meal slot, units).",
    inputSchema: emptyInputSchema,
    responseSchema: dietPreferencesDataSchema,
    outputSchema: dietPreferencesDataSchema,
    adapter: "passthrough",
  },
  {
    name: "diet_set_preferences",
    method: "POST",
    path: "/v1/diet/preferences",
    description:
      "Replace the user's dietary preferences. Used by the food skill to tune estimation (allergy warnings, default slot, units).",
    inputSchema: dietPreferencesSchema,
    responseSchema: dietPreferencesDataSchema,
    outputSchema: dietPreferencesDataSchema,
    adapter: "passthrough",
  },
];

export function createDietReadOperations(
  client: MikoshiTrackerApiClient,
): Record<string, ToolOperation> {
  return {
    diet_get_goal: async () => {
      const env = v1Envelope(dietGoalDataSchema).parse(await client.request("/v1/diet/goal"));
      const target =
        env.data.goal && typeof env.data.goal.kcalTarget === "number" ? env.data.goal.kcalTarget : null;
      return {
        payload: env.data,
        summary: target === null ? "No diet goal set yet." : `Active goal: ${target} kcal/day.`,
      };
    },
    diet_get_preferences: async () => {
      const env = v1Envelope(dietPreferencesDataSchema).parse(
        await client.request("/v1/diet/preferences"),
      );
      return { payload: env.data, summary: "Dietary preferences." };
    },
  };
}

export function createDietWriteOperations(
  client: MikoshiTrackerApiClient,
): Record<string, ToolOperation> {
  return {
    diet_set_goal: async (input: unknown) => {
      const parsed = dietGoalInputSchema.parse(input);
      const env = v1Envelope(dietGoalDataSchema).parse(
        await client.request("/v1/diet/goal", { method: "POST", body: JSON.stringify(parsed) }),
      );
      return { payload: env.data, summary: `Diet goal set to ${parsed.kcalTarget} kcal/day.` };
    },
    diet_set_preferences: async (input: unknown) => {
      const parsed = dietPreferencesSchema.parse(input);
      const env = v1Envelope(dietPreferencesDataSchema).parse(
        await client.request("/v1/diet/preferences", { method: "POST", body: JSON.stringify(parsed) }),
      );
      return { payload: env.data, summary: "Dietary preferences updated." };
    },
  };
}
