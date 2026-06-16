import { z } from "zod";

const isoDateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD");
const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/, "monthKey must use YYYY-MM");
const weekKeySchema = z.string().regex(/^\d{4}-W\d{2}$/, "weekKey must use YYYY-Www");
const nonEmptyString = z.string().trim().min(1);

export const todayStatusSchema = z.enum(["pending", "available", "completed"]);
export const todayHabitKindSchema = z.enum(["boolean", "quantity"]);
export const todayFrequencyTypeSchema = z.enum(["daily", "weekly_count", "weekdays", "monthly_count"]);
export const todayWeekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export const todayProgressSchema = z.object({
  currentValue: z.number().int().nonnegative().nullable(),
  targetValue: z.number().int().positive().nullable(),
  unit: nonEmptyString.nullable(),
  periodCompletions: z.number().int().nonnegative().nullable(),
  periodTarget: z.number().int().positive().nullable(),
});

export const todayItemSchema = z.object({
  habitId: nonEmptyString,
  name: nonEmptyString,
  kind: todayHabitKindSchema,
  frequencyType: todayFrequencyTypeSchema,
  status: todayStatusSchema,
  canUndo: z.boolean(),
  date: isoDateKeySchema,
  progress: todayProgressSchema,
});

/**
 * Today's diet roll-up (kcal + macros logged vs target). Present only for users
 * who actually log food (have an active food_meal entry); null otherwise so the
 * habit-only experience is unchanged. Sums exclude soft-deleted events.
 */
export const todayMealSlotSchema = z.enum(["breakfast", "lunch", "snack", "dinner", "other"]);

/** Consumed-vs-target kcal for one meal slot, when the active goal sets slot targets. */
export const todaySlotProgressSchema = z.object({
  slot: todayMealSlotSchema,
  kcal: z.number().nonnegative(),
  kcalTarget: z.number().positive().nullable(),
});

export const todayNutritionSchema = z.object({
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  mealCount: z.number().int().nonnegative(),
  kcalTarget: z.number().positive().nullable(),
  /** Macro targets from the active diet_goal (grams). Null when unset. */
  proteinTargetG: z.number().nonnegative().nullable(),
  carbsTargetG: z.number().nonnegative().nullable(),
  fatTargetG: z.number().nonnegative().nullable(),
  /** Goal objective, surfaced for copy ("on track to maintain"). */
  objective: z.enum(["lose", "maintain", "gain"]).nullable(),
  /** Per-slot consumed vs target; empty when the goal sets no slot targets. */
  bySlot: z.array(todaySlotProgressSchema),
});

export const todaySummarySchema = z.object({
  date: isoDateKeySchema,
  totalCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1),
  pendingItems: z.array(todayItemSchema),
  completedItems: z.array(todayItemSchema),
  /** Diet roll-up; null for users who don't log food. */
  nutrition: todayNutritionSchema.nullable().optional(),
});

export const todayPeriodKeySchema = z.object({
  date: isoDateKeySchema,
  weekKey: weekKeySchema,
  monthKey: monthKeySchema,
});

export const todayAffectedHabitSchema = z.object({
  id: nonEmptyString,
  userId: nonEmptyString,
  name: nonEmptyString,
  kind: todayHabitKindSchema,
  frequencyType: todayFrequencyTypeSchema,
  frequencyCount: z.number().int().positive().nullable(),
  targetValue: z.number().int().positive().nullable(),
  unit: nonEmptyString.nullable(),
  startDate: isoDateKeySchema,
  weekdays: z.array(todayWeekdaySchema),
});

export const todaySummaryResponseSchema = z.object({
  summary: todaySummarySchema,
});

export const todayActionResponseSchema = z.object({
  affectedHabit: todayAffectedHabitSchema,
  summary: todaySummarySchema,
  /** Id of the CheckInMutation produced by this action; attachments hang off it. */
  mutationId: nonEmptyString.nullable(),
});

export type TodayStatus = z.infer<typeof todayStatusSchema>;
export type TodayHabitKind = z.infer<typeof todayHabitKindSchema>;
export type TodayFrequencyType = z.infer<typeof todayFrequencyTypeSchema>;
export type TodayWeekday = z.infer<typeof todayWeekdaySchema>;
export type TodayProgress = z.infer<typeof todayProgressSchema>;
export type TodayItem = z.infer<typeof todayItemSchema>;
export type TodayMealSlot = z.infer<typeof todayMealSlotSchema>;
export type TodaySlotProgress = z.infer<typeof todaySlotProgressSchema>;
export type TodayNutrition = z.infer<typeof todayNutritionSchema>;
export type TodaySummary = z.infer<typeof todaySummarySchema>;
export type TodayAffectedHabit = z.infer<typeof todayAffectedHabitSchema>;
