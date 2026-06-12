/**
 * mikoshi-tracker-food — recent food event history.
 *
 * Queries the user's food events from the last N days. Used by Tier 2
 * (similar_to_event) to find matching past meals.
 */

import { queryFoodEvents, type FoodApiEnv, type FoodEventItem } from "./api-client.js";

export interface RecentFoodEvent {
  id: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  occurredAt: string;
}

/**
 * Returns up to `limit` food events from the past `days` days, sorted
 * newest-first. Returns an empty array on error (history is optional for
 * the tier pipeline).
 */
export async function getRecentFoodEvents(
  env: FoodApiEnv,
  days = 30,
  limit = 50,
): Promise<RecentFoodEvent[]> {
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const from = fromDate.toISOString().slice(0, 10);

  let events: FoodEventItem[];
  try {
    events = await queryFoodEvents(env, from, to, limit);
  } catch {
    return [];
  }

  return events
    .filter((e) => e.payload?.name && typeof e.payload.kcal === "number")
    .map((e) => ({
      id: e.id,
      name: e.payload.name,
      kcal: e.payload.kcal,
      protein_g: e.payload.protein_g,
      carbs_g: e.payload.carbs_g,
      fat_g: e.payload.fat_g,
      occurredAt: e.occurredAt,
    }))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}
