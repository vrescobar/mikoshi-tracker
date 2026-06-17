import type { AggregationBucket } from "@mikoshi-tracker/contracts/aggregations";

/**
 * Shared palette + helpers for the user-facing diet charts (recharts).
 *
 * Colours are concrete hex (not `var(--…)`) on purpose: recharts reads the
 * colour in JS to paint legend/tooltip swatches, where a CSS `var()` string
 * would not resolve. They mirror the design tokens in `globals.css`
 * (coral diet accent + the protein/carbs/fat macro tokens used by MacroPie) so
 * the charts read as part of the same calm wellness system.
 */
export const FOOD_CHART = {
  /** Coral — the diet/nutrition accent (`--color-accent-diet`). */
  kcal: "#ef6f53",
  kcalSoft: "#fbd9cf",
  /** Macro tokens — identical to MacroPie so the two surfaces agree. */
  protein: "#6366f1",
  carbs: "#14b8a6",
  fat: "#f59e0b",
  /** Emerald — the "your goal" reference line (`--color-accent-strong`). */
  target: "#059669",
  /** Muted slate — the "average" reference line. */
  average: "#94a3b8",
  grid: "#eceef2",
  axis: "#8a93a3",
} as const;

/** Atoms-of-energy per gram, for turning macro grams into a kcal contribution. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export const foodTooltipStyle = {
  border: "1px solid #eceef2",
  borderRadius: 12,
  boxShadow: "0 10px 30px rgba(21, 43, 34, 0.10)",
  fontSize: 12,
  fontFamily: "inherit",
  padding: "0.6rem 0.75rem",
} as const;

export type FoodChartGranularity = "day" | "week" | "month";

export type IntakeDatum = {
  /** Raw bucket key — `2026-06-17`, `2026-W24`, or `2026-06`. */
  key: string;
  /** Short axis label, localized. */
  label: string;
  /** Longer label for the tooltip header. */
  fullLabel: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  proteinKcal: number;
  carbsKcal: number;
  fatKcal: number;
  missing: boolean;
};

function localeTag(locale: string): string {
  return locale === "zh-CN" ? "zh-CN" : locale === "es" ? "es-ES" : "en-US";
}

/** `2026-W24` → ISO-week Monday date (used to derive a friendly label). */
function isoWeekToDate(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay();
  const monday = new Date(simple);
  const diff = day <= 4 ? day - 1 : day - 8;
  monday.setUTCDate(simple.getUTCDate() - diff);
  return monday;
}

/** Build a localized short axis label + a fuller tooltip label for a bucket key. */
export function formatBucketLabels(
  key: string,
  granularity: FoodChartGranularity,
  locale: string,
): { label: string; fullLabel: string } {
  const tag = localeTag(locale);
  if (granularity === "month") {
    const [y, m] = key.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    return {
      label: date.toLocaleDateString(tag, { month: "short" }),
      fullLabel: date.toLocaleDateString(tag, { month: "long", year: "numeric" }),
    };
  }
  if (granularity === "week") {
    const match = /^(\d{4})-W(\d{2})$/.exec(key);
    if (match) {
      const monday = isoWeekToDate(Number(match[1]), Number(match[2]));
      const short = monday.toLocaleDateString(tag, { month: "short", day: "numeric" });
      return { label: `W${match[2]}`, fullLabel: `${short} · ${key}` };
    }
    return { label: key, fullLabel: key };
  }
  // day
  const date = new Date(`${key}T12:00:00`);
  return {
    label: date.toLocaleDateString(tag, { month: "short", day: "numeric" }),
    fullLabel: date.toLocaleDateString(tag, { weekday: "short", month: "long", day: "numeric" }),
  };
}

/** Map raw aggregation buckets into chart-ready intake data. */
export function bucketsToIntakeData(
  buckets: AggregationBucket[],
  granularity: FoodChartGranularity,
  locale: string,
): IntakeDatum[] {
  return buckets
    .filter((b) => b.key.kind === "date")
    .map((b) => {
      const key = b.key.kind === "date" ? b.key.value : "";
      const proteinG = b.sum.protein_g ?? 0;
      const carbsG = b.sum.carbs_g ?? 0;
      const fatG = b.sum.fat_g ?? 0;
      const { label, fullLabel } = formatBucketLabels(key, granularity, locale);
      return {
        key,
        label,
        fullLabel,
        kcal: Math.round(b.sum.kcal ?? 0),
        proteinG: Math.round(proteinG),
        carbsG: Math.round(carbsG),
        fatG: Math.round(fatG),
        proteinKcal: Math.round(proteinG * KCAL_PER_G.protein),
        carbsKcal: Math.round(carbsG * KCAL_PER_G.carbs),
        fatKcal: Math.round(fatG * KCAL_PER_G.fat),
        missing: b.missing,
      };
    });
}
