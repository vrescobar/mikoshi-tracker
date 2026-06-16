import type { IconName } from "../ui";

export type HabitCategory = {
  icon: IconName;
  color: string;
  soft: string;
};

const CATEGORIES: Record<string, HabitCategory> = {
  water: { icon: "droplet", color: "var(--cat-water)", soft: "var(--cat-water-soft)" },
  move: { icon: "dumbbell", color: "var(--cat-move)", soft: "var(--cat-move-soft)" },
  mind: { icon: "sparkles", color: "var(--cat-mind)", soft: "var(--cat-mind-soft)" },
  rest: { icon: "moon", color: "var(--cat-rest)", soft: "var(--cat-rest-soft)" },
  read: { icon: "book", color: "var(--cat-mind)", soft: "var(--cat-mind-soft)" },
  food: { icon: "diet", color: "var(--cat-food)", soft: "var(--cat-food-soft)" },
};

const ROTATION: HabitCategory[] = [
  CATEGORIES.water,
  CATEGORIES.move,
  CATEGORIES.mind,
  CATEGORIES.rest,
  CATEGORIES.read,
];

const KEYWORDS: Array<[RegExp, HabitCategory]> = [
  [/agua|water|beber|hidrat|drink/i, CATEGORIES.water],
  [/gym|ejercici|exercise|correr|run|walk|camin|deporte|sport|workout|entren|pasos|steps|kettle|pesa|lift|fuerza|cardio|bici|bike|nad/i, CATEGORIES.move],
  [/medita|meditat|mindful|calm|respir|breath|yoga|gratit/i, CATEGORIES.mind],
  [/dorm|sleep|descans|rest|cama|bed/i, CATEGORIES.rest],
  [/leer|read|libro|book|lectur|estud|study/i, CATEGORIES.read],
  [/com(er|ida)|food|diet|meal|nutri/i, CATEGORIES.food],
];

/**
 * Map a habit name to a category (icon + pastel accent) for the dashboard chips.
 * Keyword-matched in EN/ES; falls back to a stable rotation by index so even
 * unmatched habits get a consistent, varied color instead of all looking alike.
 */
export function categorizeHabit(name: string, index = 0): HabitCategory {
  for (const [pattern, category] of KEYWORDS) {
    if (pattern.test(name)) return category;
  }
  return ROTATION[index % ROTATION.length];
}
