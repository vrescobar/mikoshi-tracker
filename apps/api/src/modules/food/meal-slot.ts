import { normalizeUserTimeZone } from "../../shared/timezone";

/**
 * Meal-slot inference for food_meal events.
 *
 * The skill historically dumped every meal into "breakfast" because the tier-0
 * classifier never saw the time of day. We now infer a sensible slot from the
 * event's wall-clock hour (in the user's timezone) whenever the payload doesn't
 * carry an explicit, meaningful slot — so a meal logged at 13:00 reads as lunch,
 * not breakfast. Explicit slots from the user/skill are always respected.
 */

export const FOOD_MEAL_SLUG = "food_meal";

export type InferredMealSlot = "breakfast" | "lunch" | "snack" | "dinner";

/** Wall-clock hour [0,23] of `occurredAt` in the user's timezone. */
export function localHourInZone(occurredAt: Date, timeZone: string | null | undefined): number {
  const tz = normalizeUserTimeZone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).formatToParts(occurredAt);
    const raw = parts.find((p) => p.type === "hour")?.value;
    const hour = raw ? Number.parseInt(raw, 10) : occurredAt.getUTCHours();
    return Number.isFinite(hour) ? hour % 24 : occurredAt.getUTCHours();
  } catch {
    return occurredAt.getUTCHours();
  }
}

/**
 * Maps a wall-clock hour to a meal slot: breakfast <11:00, lunch 11–16,
 * snack 16–19, dinner ≥19 (and the small hours, which bucket to dinner/late).
 */
export function inferMealSlotFromOccurredAt(occurredAt: Date, timeZone: string | null | undefined): InferredMealSlot {
  const hour = localHourInZone(occurredAt, timeZone);
  if (hour < 5) return "dinner"; // 00:00–04:59 reads as a late dinner, not breakfast
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 19) return "snack";
  return "dinner";
}

/** True when a payload slot is absent/empty/"other" and should be inferred. */
export function shouldInferMealSlot(value: unknown): boolean {
  return value === null || value === undefined || value === "" || value === "other";
}
