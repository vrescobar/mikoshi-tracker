/**
 * One-shot backfill (story 51): create a Mikoshi cohort per pre-existing
 * circle and link `Circle.cohortId` to it, so legacy circles join the
 * "cohorts = roster" model.
 *
 * Split in two phases so the plan is testable and `--dry-run` is exact:
 *  - `planCohortBackfill` is pure: circles without cohortId → planned cohort
 *    (name + members with externalId; web-only memberships are reported but
 *    stay tracker-native, they never enter the cohort).
 *  - `applyCohortBackfill` executes the plan against Mikoshi's private v1
 *    mutation API (`POST /cohorts/create`, `POST /cohorts/:id/members/add` —
 *    `{ok: true, data}` envelope) and stamps `cohortId` locally.
 */
import type { Db } from "../../db/client";
import { nowDb } from "../../db/rows";

export interface BackfillCircle {
  id: string;
  name: string;
  cohortId: string | null;
}

export interface BackfillMembership {
  circleId: string;
  externalId: string | null;
  role: string;
}

export interface PlannedCohort {
  circleId: string;
  circleName: string;
  /** Cohort name in Mikoshi (cohorts.name is unique among live rows). */
  cohortName: string;
  /** Identity ids (externalIds) to enrol as cohort members. */
  memberExternalIds: string[];
  /** Memberships without externalId (web-only) — stay out of the cohort. */
  webOnlyMemberships: number;
}

export interface BackfillPlan {
  cohorts: PlannedCohort[];
  /** Circles skipped because they are already linked. */
  alreadyLinked: number;
  /** Total memberships examined across planned circles. */
  membershipsExamined: number;
}

export function planCohortBackfill(
  circles: BackfillCircle[],
  memberships: BackfillMembership[],
): BackfillPlan {
  const byCircle = new Map<string, BackfillMembership[]>();
  for (const membership of memberships) {
    const list = byCircle.get(membership.circleId) ?? [];
    list.push(membership);
    byCircle.set(membership.circleId, list);
  }

  const cohorts: PlannedCohort[] = [];
  let alreadyLinked = 0;
  let membershipsExamined = 0;

  for (const circle of circles) {
    if (circle.cohortId) {
      alreadyLinked++;
      continue;
    }
    const circleMemberships = byCircle.get(circle.id) ?? [];
    membershipsExamined += circleMemberships.length;
    const memberExternalIds = [
      ...new Set(
        circleMemberships
          .map((m) => m.externalId)
          .filter((externalId): externalId is string => externalId !== null),
      ),
    ];
    cohorts.push({
      circleId: circle.id,
      circleName: circle.name,
      cohortName: circle.name,
      memberExternalIds,
      webOnlyMemberships: circleMemberships.length - memberExternalIds.length,
    });
  }

  return { cohorts, alreadyLinked, membershipsExamined };
}

export interface ApplyResult {
  circleId: string;
  cohortId: string;
  membersAdded: number;
}

/** Minimal client of Mikoshi's private v1 mutation API. */
async function v1Mutation(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    throw new Error(
      `Mikoshi v1 ${path} failed: HTTP ${response.status} ${JSON.stringify(payload)}`,
    );
  }
  return (payload.data ?? {}) as Record<string, unknown>;
}

export async function applyCohortBackfill(
  db: Db,
  plan: BackfillPlan,
  options: { v1BaseUrl: string },
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  for (const planned of plan.cohorts) {
    const created = await v1Mutation(options.v1BaseUrl, "/cohorts/create", {
      name: planned.cohortName,
      description: `Roster del circle "${planned.circleName}" de mikoshi-tracker (backfill story 51)`,
    });
    const cohortId = created.cohortId;
    if (typeof cohortId !== "string" || cohortId.length === 0) {
      throw new Error(`Mikoshi v1 /cohorts/create returned no cohortId for "${planned.cohortName}"`);
    }

    let membersAdded = 0;
    for (const externalId of planned.memberExternalIds) {
      await v1Mutation(
        options.v1BaseUrl,
        `/cohorts/${encodeURIComponent(cohortId)}/members/add`,
        { identityId: externalId },
      );
      membersAdded++;
    }

    db.run(`UPDATE "Circle" SET "cohortId" = ?, "updatedAt" = ? WHERE "id" = ?`, [cohortId, nowDb(), planned.circleId]);
    results.push({ circleId: planned.circleId, cohortId, membersAdded });
  }

  return results;
}
