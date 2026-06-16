import type { DietGoalInput, DietGoalRecord, DietPreferences } from "@mikoshi-tracker/contracts/diet";
import type {
  FoodDayResponse,
  FoodRelogInput,
  FoodRelogResponse,
  FoodSearchResult,
} from "@mikoshi-tracker/contracts/food";

import { getV1, postV1 } from "./v1";

/**
 * Diet/food vocabulary client over the `/api/v1` surface (Epics B–D). The same
 * Zod contracts back these endpoints, the food skill tools, and the v1 ratchet,
 * so a goal/preference set here validates identically to one set over WhatsApp.
 */

export async function getDietGoal(): Promise<DietGoalRecord | null> {
  const { goal } = await getV1<{ goal: DietGoalRecord | null }>("/diet/goal");
  return goal;
}

export async function setDietGoal(input: DietGoalInput): Promise<DietGoalRecord | null> {
  const { goal } = await postV1<{ goal: DietGoalRecord | null }>("/diet/goal", input);
  return goal;
}

export async function getDietPreferences(): Promise<DietPreferences> {
  const { preferences } = await getV1<{ preferences: DietPreferences }>("/diet/preferences");
  return preferences;
}

export async function setDietPreferences(input: DietPreferences): Promise<DietPreferences> {
  const { preferences } = await postV1<{ preferences: DietPreferences }>("/diet/preferences", input);
  return preferences;
}

/**
 * The day's meals (with provenance + photo thumbnails) and the nutrition
 * roll-up in one round-trip — powers the redesigned Diet "Today" tab. Omitting
 * `date` returns the user's wall-clock today.
 */
export async function getFoodDay(date?: string): Promise<FoodDayResponse> {
  return getV1<FoodDayResponse>("/food/day", date ? { date } : undefined);
}

export async function searchFoods(q: string, limit = 8): Promise<FoodSearchResult[]> {
  const { results } = await getV1<{ results: FoodSearchResult[] }>("/food/search", { q, limit });
  return results;
}

export async function relogFood(input: FoodRelogInput): Promise<FoodRelogResponse> {
  return postV1<FoodRelogResponse>("/food/relog", input);
}

export type ChartKind = "kcal-trend" | "macro-donut" | "weight-trend" | "habit-completion";

export type SendChartResult = {
  delivered: boolean;
  reason?: "no_identity" | "platform_unavailable" | "delivery_failed";
};

export async function sendChartToWhatsApp(
  kind: ChartKind,
  range: "7d" | "30d" | "90d" = "7d",
  caption?: string,
): Promise<SendChartResult> {
  return postV1<SendChartResult>("/reports/chart", { kind, range, caption });
}

/** Same-origin URL for an inline chart preview (bearer/cookie scoped, per-user). */
export function chartImageUrl(kind: ChartKind, range: "7d" | "30d" | "90d" = "7d"): string {
  return `/api/charts/${kind}.png?range=${range}`;
}
