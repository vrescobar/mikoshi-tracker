import { z } from "zod";

/**
 * Food vocabulary contracts (Epic C): fuzzy search over a user's own food
 * history + saved items, and one-shot re-logging of a previous meal/item.
 * Shared by REST/v1 and the food skill so search + re-log behave identically
 * in the GUI and over WhatsApp.
 */

const nonEmptyString = z.string().trim().min(1);
const isoDateTimeSchema = z.string().datetime({ offset: true });

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
