import { z } from "zod";

/**
 * Diet goal + preferences contracts (Epic B). These are the single source of
 * truth shared by REST (GUI), /api/v1, and the food skill tools, so a goal set
 * in the GUI and one set over WhatsApp validate identically. The field set
 * mirrors the diet_goal EntryType payloadSchema and the diet_prefs EntryType
 * configSchema (see apps/api/src/modules/entry-types/seed.ts).
 */

const nonEmptyString = z.string().trim().min(1);
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const dietObjectiveSchema = z.enum(["lose", "maintain", "gain"]);
export const dietGoalSourceSchema = z.enum(["manual", "ai", "computed"]);
export const macroModeSchema = z.enum(["grams", "percent"]);
export const dietMealSlotSchema = z.enum(["breakfast", "lunch", "snack", "dinner", "other"]);

/** The mutable shape of a diet goal — what the GUI/skill submit to set a target. */
export const dietGoalInputSchema = z.object({
  kcalTarget: z.number().positive(),
  proteinTargetG: z.number().nonnegative().nullable().optional(),
  carbsTargetG: z.number().nonnegative().nullable().optional(),
  fatTargetG: z.number().nonnegative().nullable().optional(),
  macroMode: macroModeSchema.nullable().optional(),
  proteinPct: z.number().min(0).max(100).nullable().optional(),
  carbsPct: z.number().min(0).max(100).nullable().optional(),
  fatPct: z.number().min(0).max(100).nullable().optional(),
  breakfastKcal: z.number().nonnegative().nullable().optional(),
  lunchKcal: z.number().nonnegative().nullable().optional(),
  dinnerKcal: z.number().nonnegative().nullable().optional(),
  snackKcal: z.number().nonnegative().nullable().optional(),
  objective: dietObjectiveSchema.nullable().optional(),
  linkedWeightGoalKg: z.number().positive().nullable().optional(),
  effectiveFrom: z.string().nullable().optional(),
  source: dietGoalSourceSchema.nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  notes: z.string().nullable().optional(),
});

/** The active diet goal as returned by GET — the latest goal event, or null. */
export const dietGoalRecordSchema = dietGoalInputSchema.extend({
  /** EntryEvent id of the goal revision (for audit drill-in); null when none set. */
  eventId: nonEmptyString.nullable(),
  updatedAt: isoDateTimeSchema.nullable(),
});

export const dietGoalResponseSchema = z.object({
  goal: dietGoalRecordSchema.nullable(),
});

/** Per-user dietary preferences — stored on the diet_prefs Entry.config. */
export const dietPreferencesSchema = z.object({
  dietStyle: z.string().nullable().optional(),
  allergies: z.array(z.string()).nullable().optional(),
  dislikes: z.array(z.string()).nullable().optional(),
  defaultMealSlot: dietMealSlotSchema.nullable().optional(),
  units: z.enum(["metric", "imperial"]).nullable().optional(),
  /** Opt-in for the scheduled weekly WhatsApp report (default off). */
  weeklyReportOptIn: z.boolean().nullable().optional(),
});

export const dietPreferencesResponseSchema = z.object({
  preferences: dietPreferencesSchema,
});

export type DietObjective = z.infer<typeof dietObjectiveSchema>;
export type DietGoalInput = z.infer<typeof dietGoalInputSchema>;
export type DietGoalRecord = z.infer<typeof dietGoalRecordSchema>;
export type DietPreferences = z.infer<typeof dietPreferencesSchema>;
