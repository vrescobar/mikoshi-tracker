import type { PrismaClient } from "../../generated/prisma/client";

import { CircleNotFoundError, getCircleLeaderboard } from "./circle.service";

type Deps = { db: PrismaClient };

/**
 * Derives a single integer ranking score from a leaderboard row so snapshots can
 * be ordered/compared without re-deriving the multi-factor sort. Mirrors the live
 * sort priority: completions today ≫ streak ≫ weekly rate.
 */
function scoreOf(row: { completedTodayCount: number; currentStreak: number; weeklyCompletionRate: number }): number {
  return row.completedTodayCount * 10000 + row.currentStreak * 100 + Math.round(row.weeklyCompletionRate * 100);
}

/**
 * Freezes the current standings of a circle into `CircleLeaderboardSnapshot`,
 * one row per member, keyed by (circleId, season, userId). Idempotent: re-running
 * for the same season upserts. Reuses the live `getCircleLeaderboard` computation
 * — the snapshot is a frozen copy, not a separate scoring path.
 */
export async function createCircleLeaderboardSnapshot(
  deps: Deps,
  params: { circleId: string; season?: string; timestamp?: Date | number | string },
): Promise<{ circleId: string; season: string; count: number }> {
  const circle = await deps.db.circle.findUnique({ where: { id: params.circleId } });
  if (!circle) throw new CircleNotFoundError();

  const season = params.season ?? circle.season ?? "default";
  const { leaderboard } = await getCircleLeaderboard(deps, {
    circleId: params.circleId,
    timestamp: params.timestamp,
  });

  let rank = 0;
  for (const row of leaderboard) {
    rank += 1;
    const score = scoreOf(row);
    const data = JSON.stringify(row);
    await deps.db.circleLeaderboardSnapshot.upsert({
      where: { circleId_season_userId: { circleId: params.circleId, season, userId: row.userId } },
      create: { circleId: params.circleId, season, userId: row.userId, rank, score, data },
      update: { rank, score, data },
    });
  }

  return { circleId: params.circleId, season, count: leaderboard.length };
}

/**
 * Diffs two frozen seasons of a circle: per-user rank/score movement between
 * `seasonA` (baseline) and `seasonB` (later). Members present in only one season
 * surface with a null on the missing side, so a contest "who improved / who
 * dropped / who's new" view needs no client-side joining.
 */
export async function compareCircleLeaderboardSnapshots(
  deps: Deps,
  params: { circleId: string; seasonA: string; seasonB: string },
): Promise<{
  circleId: string;
  seasonA: string;
  seasonB: string;
  rows: {
    userId: string;
    rankA: number | null;
    rankB: number | null;
    rankDelta: number | null;
    scoreA: number | null;
    scoreB: number | null;
    scoreDelta: number | null;
  }[];
}> {
  const [a, b] = await Promise.all([
    listCircleLeaderboardSnapshots(deps, { circleId: params.circleId, season: params.seasonA }),
    listCircleLeaderboardSnapshots(deps, { circleId: params.circleId, season: params.seasonB }),
  ]);

  const byUserA = new Map(a.map((r) => [r.userId, r]));
  const byUserB = new Map(b.map((r) => [r.userId, r]));
  const userIds = [...new Set([...byUserA.keys(), ...byUserB.keys()])];

  const rows = userIds
    .map((userId) => {
      const ra = byUserA.get(userId) ?? null;
      const rb = byUserB.get(userId) ?? null;
      const rankA = ra?.rank ?? null;
      const rankB = rb?.rank ?? null;
      const scoreA = ra?.score ?? null;
      const scoreB = rb?.score ?? null;
      return {
        userId,
        rankA,
        rankB,
        // A smaller rank is better, so improvement is rankA - rankB (positive = moved up).
        rankDelta: rankA != null && rankB != null ? rankA - rankB : null,
        scoreA,
        scoreB,
        scoreDelta: scoreA != null && scoreB != null ? scoreB - scoreA : null,
      };
    })
    .sort((x, y) => (x.rankB ?? Number.MAX_SAFE_INTEGER) - (y.rankB ?? Number.MAX_SAFE_INTEGER));

  return { circleId: params.circleId, seasonA: params.seasonA, seasonB: params.seasonB, rows };
}

export async function listCircleLeaderboardSnapshots(
  deps: Deps,
  params: { circleId: string; season?: string },
): Promise<
  {
    id: string;
    circleId: string;
    season: string;
    userId: string;
    rank: number;
    score: number;
    data: unknown;
    createdAt: string;
  }[]
> {
  const rows = await deps.db.circleLeaderboardSnapshot.findMany({
    where: { circleId: params.circleId, ...(params.season ? { season: params.season } : {}) },
    orderBy: [{ season: "asc" }, { rank: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    circleId: row.circleId,
    season: row.season,
    userId: row.userId,
    rank: row.rank,
    score: row.score,
    data: JSON.parse(row.data) as unknown,
    createdAt: row.createdAt.toISOString(),
  }));
}
