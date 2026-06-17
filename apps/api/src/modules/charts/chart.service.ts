import sharp from "sharp";

import type { Db } from "../../db/client";
import { computeAggregations } from "../aggregations/aggregation.service";
import { resolveActiveDietGoal } from "../diet/diet.service";
import { getUserById } from "../users/user.repository";
import { addDays, resolveHabitDay } from "../today/today-clock";
import { kcalTrendSvg, macroDonutSvg, type TrendPoint } from "./chart.svg";

const FOOD_MEAL_SLUG = "food_meal";

export const CHART_KINDS = ["kcal-trend", "macro-donut"] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export function isChartKind(value: string): value is ChartKind {
  return (CHART_KINDS as readonly string[]).includes(value);
}

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function parseRangeDays(range: string | undefined): number {
  return RANGE_DAYS[range ?? "7d"] ?? 7;
}

type ChartServiceDeps = { sqlite: Db };

/**
 * Render one of the supported charts as a PNG, scoped strictly to `userId`.
 * Data comes from the same aggregation engine the GUI/skill use, so the chart
 * never diverges from the numbers elsewhere. Returns raw PNG bytes for the
 * route to stream and for the report skill to deliver over WhatsApp.
 */
export async function renderChartPng(
  deps: ChartServiceDeps,
  params: { userId: string; kind: ChartKind; range?: string; timestamp?: Date | number | string },
): Promise<Buffer> {
  const svg = await buildChartSvg(deps, params);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Exposed for tests: the chart SVG before rasterization. */
export async function buildChartSvg(
  deps: ChartServiceDeps,
  params: { userId: string; kind: ChartKind; range?: string; timestamp?: Date | number | string },
): Promise<string> {
  const user = getUserById(deps.sqlite, params.userId);
  const timeZone = user?.timezone ?? "UTC";
  const today = resolveHabitDay({ timestamp: params.timestamp ?? new Date(), timeZone }).todayKey;
  const days = parseRangeDays(params.range);
  const from = addDays(today, -(days - 1));
  const rangeLabel = `${from} → ${today}`;

  if (params.kind === "macro-donut") {
    const agg = await computeAggregations(deps, {
      userId: params.userId,
      entryTypeSlug: FOOD_MEAL_SLUG,
      from,
      to: today,
      groupBy: "none",
    });
    const sum = agg.total.sum;
    return macroDonutSvg({
      title: "Macro composition",
      subtitle: `${rangeLabel} · ${agg.total.count} meals`,
      protein_g: sum.protein_g ?? 0,
      carbs_g: sum.carbs_g ?? 0,
      fat_g: sum.fat_g ?? 0,
    });
  }

  // kcal-trend
  const agg = await computeAggregations(deps, {
    userId: params.userId,
    entryTypeSlug: FOOD_MEAL_SLUG,
    from,
    to: today,
    groupBy: "day",
    fields: "kcal",
    include: "missing_days",
  });
  const byDate = new Map<string, number>();
  for (const bucket of agg.buckets) {
    if (bucket.key.kind === "date") byDate.set(bucket.key.value, bucket.sum.kcal ?? 0);
  }
  const points: TrendPoint[] = [];
  for (let d = 0; d < days; d += 1) {
    const dateKey = addDays(from, d);
    points.push({ label: dateKey.slice(5), value: byDate.get(dateKey) ?? 0 });
  }

  const goal = await resolveActiveDietGoal(deps, params.userId);
  return kcalTrendSvg({
    title: "Calories — daily",
    subtitle: rangeLabel,
    points,
    target: goal?.kcalTarget ?? null,
    unit: "kcal",
  });
}
