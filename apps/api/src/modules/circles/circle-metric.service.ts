import type { Db } from "../../db/client";
import { nowDb } from "../../db/rows";
import { computeAggregations } from "../aggregations/aggregation.service";
import { addDays } from "../today/today-clock";
import { findCircleRecord, listCircleMemberRecords } from "./circle.repository";
import { CircleForbiddenError, CircleNotFoundError } from "./circle.service";

type Deps = { sqlite: Db };

export class CircleNotMetricContestError extends Error {
  constructor() {
    super("This circle is not configured as a metric contest");
    this.name = "CircleNotMetricContestError";
  }
}

export type MetricMode = "cumulative" | "adherence" | "delta";
export type MetricGoal = "higher" | "lower";

export interface CircleContestConfigInput {
  contestKind: "habit" | "metric";
  metricEntryTypeSlug?: string | null;
  metricField?: string | null;
  metricMode?: MetricMode | null;
  metricTarget?: number | null;
  metricGoal?: MetricGoal | null;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function metTarget(value: number, target: number, goal: MetricGoal): boolean {
  return goal === "higher" ? value >= target : value <= target;
}

/**
 * Configure a circle's contest scoring (owner only). "habit" keeps the legacy
 * shared-habit leaderboard; "metric" scores by aggregating a payload field of an
 * entry type over the contest window.
 */
export async function configureCircleContest(
  deps: Deps,
  params: { circleId: string; callerId: string; config: CircleContestConfigInput },
) {
  const circle = await findCircleRecord(deps.sqlite, params.circleId);
  if (!circle) throw new CircleNotFoundError();
  if (circle.ownerId !== params.callerId) throw new CircleForbiddenError("Only the owner can configure the contest");

  const c = params.config;
  const isMetric = c.contestKind === "metric";
  const updated = {
    id: params.circleId,
    contestKind: c.contestKind,
    metricEntryTypeSlug: isMetric ? (c.metricEntryTypeSlug ?? null) : null,
    metricField: isMetric ? (c.metricField ?? null) : null,
    metricMode: isMetric ? (c.metricMode ?? null) : null,
    metricTarget: isMetric ? (c.metricTarget ?? null) : null,
    metricGoal: isMetric ? (c.metricGoal ?? "higher") : null,
  };
  deps.sqlite.run(
    `UPDATE "Circle" SET "contestKind" = ?, "metricEntryTypeSlug" = ?, "metricField" = ?, "metricMode" = ?, "metricTarget" = ?, "metricGoal" = ?, "updatedAt" = ? WHERE "id" = ?`,
    [
      updated.contestKind,
      updated.metricEntryTypeSlug,
      updated.metricField,
      updated.metricMode,
      updated.metricTarget,
      updated.metricGoal,
      nowDb(),
      params.circleId,
    ],
  );
  return { circle: updated };
}

/**
 * Metric-contest leaderboard. For each member, aggregates `metricField` of
 * `metricEntryTypeSlug` over the contest window (or the trailing 30 days) and
 * scores by mode:
 *   - cumulative → sum over the window
 *   - adherence  → number of days the daily total met `metricTarget` (per goal)
 *   - delta      → last logged daily value − first (e.g. weight change)
 * Ranked by goal direction (adherence is always "more compliant days first").
 */
export async function getCircleMetricLeaderboard(
  deps: Deps,
  params: { circleId: string; timestamp?: Date | number | string },
): Promise<{
  leaderboard: {
    userId: string;
    displayName: string;
    role: "owner" | "member";
    externalId: string | null;
    rank: number;
    score: number;
    mode: MetricMode;
  }[];
}> {
  const circle = await findCircleRecord(deps.sqlite, params.circleId);
  if (!circle) throw new CircleNotFoundError();

  const entryTypeSlug = circle.metricEntryTypeSlug;
  const field = circle.metricField;
  const rawMode = circle.metricMode;
  if (circle.contestKind !== "metric" || !entryTypeSlug || !field || !rawMode) {
    throw new CircleNotMetricContestError();
  }

  const mode = rawMode as MetricMode;
  const goal = (circle.metricGoal ?? "higher") as MetricGoal;
  const target = circle.metricTarget ?? 0;

  const now = params.timestamp ? new Date(params.timestamp) : new Date();
  const todayKey = toDateKey(now);
  const from = circle.contestStartAt ? toDateKey(circle.contestStartAt) : addDays(todayKey, -29);
  const contestEndKey = circle.contestEndAt ? toDateKey(circle.contestEndAt) : todayKey;
  const to = contestEndKey < todayKey ? contestEndKey : todayKey;

  const members = await listCircleMemberRecords(deps.sqlite, params.circleId);

  const scored = await Promise.all(
    members.map(async (m) => {
      const agg = await computeAggregations(deps, {
        userId: m.userId,
        entryTypeSlug,
        from,
        to,
        groupBy: mode === "cumulative" ? "none" : "day",
        fields: field,
        include: "missing_days",
      });

      let score = 0;
      if (mode === "cumulative") {
        score = agg.total.sum[field] ?? 0;
      } else if (mode === "adherence") {
        score = agg.buckets.filter((b) => !b.missing && metTarget(b.sum[field] ?? 0, target, goal)).length;
      } else {
        const logged = agg.buckets.filter((b) => !b.missing);
        const first = logged.length > 0 ? (logged[0].sum[field] ?? 0) : 0;
        const last = logged.length > 0 ? (logged[logged.length - 1].sum[field] ?? 0) : 0;
        score = last - first;
      }

      return {
        userId: m.userId,
        displayName: m.user.name,
        role: m.role as "owner" | "member",
        externalId: m.externalId ?? null,
        score: Number(score.toFixed(2)),
      };
    }),
  );

  // Ranking direction: adherence always rewards more days; cumulative/delta follow
  // the goal (higher → desc, lower → asc).
  const descending = mode === "adherence" ? true : goal === "higher";
  scored.sort((a, b) =>
    descending ? b.score - a.score || a.displayName.localeCompare(b.displayName) : a.score - b.score || a.displayName.localeCompare(b.displayName),
  );

  return {
    leaderboard: scored.map((row, i) => ({ ...row, rank: i + 1, mode })),
  };
}
