import { z } from "zod";

import { todayNutritionSchema } from "./today";

/**
 * Food vocabulary contracts (Epic C): fuzzy search over a user's own food
 * history + saved items, and one-shot re-logging of a previous meal/item.
 * Shared by REST/v1 and the food skill so search + re-log behave identically
 * in the GUI and over WhatsApp.
 */

const nonEmptyString = z.string().trim().min(1);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const foodSearchKindSchema = z.enum(["item", "meal"]);
export const foodMealSlotSchema = z.enum(["breakfast", "lunch", "snack", "dinner", "other"]);

/** One ranked search hit — a saved food_item or a previously-logged food_meal. */
export const foodSearchResultSchema = z.object({
  kind: foodSearchKindSchema,
  /** EntryEvent id to re-log from. */
  eventId: nonEmptyString,
  name: nonEmptyString,
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative().nullable(),
  /** Reference portion in grams (food_item only). */
  defaultPortionG: z.number().nonnegative().nullable(),
  isRecipe: z.boolean().nullable(),
  /** How many times this name has been logged (meals) or 1 (items). */
  usageCount: z.number().int().nonnegative(),
  lastUsedAt: isoDateTimeSchema,
});

export const foodSearchQuerySchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().positive().max(50).optional(),
  /** Comma list of "items"/"meals"; defaults to both. */
  sources: z.string().optional(),
});

export const foodSearchResponseSchema = z.object({
  results: z.array(foodSearchResultSchema),
});

/** Re-log a previous meal/item as a new food_meal event today (or at occurredAt). */
export const foodRelogInputSchema = z.object({
  /** EntryEvent id of the source food_meal or food_item to copy macros from. */
  sourceEventId: nonEmptyString,
  occurredAt: isoDateTimeSchema.optional(),
  mealSlot: foodMealSlotSchema.nullable().optional(),
  /** Scale macros by this factor (e.g. 1.5 portions). Defaults to 1. */
  portionScale: z.number().positive().optional(),
});

export const foodRelogResponseSchema = z.object({
  eventId: nonEmptyString,
  name: nonEmptyString,
  kcal: z.number().nonnegative(),
  mealSlot: foodMealSlotSchema.nullable(),
});

export type FoodSearchKind = z.infer<typeof foodSearchKindSchema>;
export type FoodSearchResult = z.infer<typeof foodSearchResultSchema>;
export type FoodRelogInput = z.infer<typeof foodRelogInputSchema>;
export type FoodRelogResponse = z.infer<typeof foodRelogResponseSchema>;

/**
 * Diet "Today" read-model (GET /api/v1/food/day): one round-trip that powers the
 * redesigned Today tab — the day's meals enriched with provenance + photo
 * thumbnails, plus the same nutrition roll-up the dashboard ring uses.
 */

/** Provenance of a meal — derived from its latest EventMutation.source. */
export const foodMealProvenanceSchema = z.enum(["WEB", "AI", "SYSTEM", "CIRCLE"]);

/** A photo attached to a meal (thumbnail-ready; fetch via `url?w=`). */
export const foodMealAttachmentSchema = z.object({
  id: nonEmptyString,
  url: nonEmptyString,
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

/**
 * A food_meal payload as stored. Validation is owned server-side by the
 * EntryType payloadSchema; here we type the fields the GUI reads and
 * `passthrough()` the rest so the contract never drops forward-compatible keys.
 */
export const foodMealPayloadSchema = z
  .object({
    name: z.string(),
    kcal: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
    fiber_g: z.number().nullable().optional(),
    sugar_g: z.number().nullable().optional(),
    portion_g: z.number().nullable().optional(),
    mealSlot: foodMealSlotSchema.nullable().optional(),
    source: z.string().optional(),
    confidence: z.number().optional(),
    similarToEventId: z.string().nullable().optional(),
    fromFoodItemId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .passthrough();

export const foodDayMealSchema = z.object({
  eventId: nonEmptyString,
  occurredAt: isoDateTimeSchema,
  dateKey: dateKeySchema,
  payload: foodMealPayloadSchema,
  /** Who logged it (WEB/AI/SYSTEM/CIRCLE); null if no mutation is recorded. */
  source: foodMealProvenanceSchema.nullable(),
  attachments: z.array(foodMealAttachmentSchema),
});

export const foodDayQuerySchema = z.object({
  /** Day to read, in the user's timezone; defaults to the user's "today". */
  date: dateKeySchema.optional(),
});

export const foodDayResponseSchema = z.object({
  date: dateKeySchema,
  meals: z.array(foodDayMealSchema),
  /** Same shape as the dashboard nutrition block; null for non-food users. */
  nutrition: todayNutritionSchema.nullable(),
});

export type FoodMealProvenance = z.infer<typeof foodMealProvenanceSchema>;
export type FoodMealAttachment = z.infer<typeof foodMealAttachmentSchema>;
export type FoodMealPayload = z.infer<typeof foodMealPayloadSchema>;
export type FoodDayMeal = z.infer<typeof foodDayMealSchema>;
export type FoodDayResponse = z.infer<typeof foodDayResponseSchema>;
