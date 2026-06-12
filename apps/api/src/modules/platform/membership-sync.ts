/**
 * Cohorts = roster (story 51): when a circle is linked to a Mikoshi cohort
 * (`Circle.cohortId`), its memberships become a derived cache of the cohort.
 *
 * Reconciliation rules (data-preserving on purpose):
 *  - roster members with a provisioned user (externalId match) are enrolled;
 *  - roster members without a user are skipped — they appear after Mikoshi
 *    provisions them (consent flow), never auto-created here;
 *  - memberships whose externalId left the cohort are REMOVED so the member
 *    stops scoring, but every historical trace survives: entries, events and
 *    leaderboard snapshots hang off the User, not the membership;
 *  - the owner and web-only memberships (externalId null) are never touched —
 *    they are tracker-native, not cohort-derived.
 */
import type { PrismaClient } from "../../generated/prisma/client";

import { addCircleMemberRecord } from "../circles/circle.repository";
import type { MikoshiPlatformClient } from "./mikoshi-platform-client";

export interface RosterMember {
  externalId: string;
  displayName?: string;
}

export interface RosterReconcileResult {
  added: string[];
  removed: string[];
  skippedUnprovisioned: string[];
}

export async function reconcileCircleRoster(
  db: PrismaClient,
  circleId: string,
  roster: RosterMember[],
): Promise<RosterReconcileResult> {
  const added: string[] = [];
  const removed: string[] = [];
  const skippedUnprovisioned: string[] = [];

  const memberships = await db.circleMembership.findMany({ where: { circleId } });
  const byExternalId = new Map(
    memberships.filter((m) => m.externalId !== null).map((m) => [m.externalId as string, m]),
  );
  const byUserId = new Map(memberships.map((m) => [m.userId, m]));

  const rosterIds = new Set<string>();
  for (const member of roster) {
    if (rosterIds.has(member.externalId)) continue; // de-dup defensively
    rosterIds.add(member.externalId);
    if (byExternalId.has(member.externalId)) continue; // already enrolled

    const user = await db.user.findUnique({
      where: { externalId: member.externalId },
      select: { id: true },
    });
    if (!user) {
      skippedUnprovisioned.push(member.externalId);
      continue;
    }

    const existingByUser = byUserId.get(user.id);
    if (existingByUser) {
      // Same human, membership predates the cohort link — adopt it into the
      // derived cache by stamping the externalId instead of duplicating.
      await db.circleMembership.update({
        where: { id: existingByUser.id },
        data: { externalId: member.externalId },
      });
      continue;
    }

    await addCircleMemberRecord(db, {
      circleId,
      userId: user.id,
      externalId: member.externalId,
    });
    added.push(member.externalId);
  }

  for (const membership of memberships) {
    if (!membership.externalId) continue; // web-only: tracker-native
    if (membership.role === "owner") continue; // never strip the owner
    if (rosterIds.has(membership.externalId)) continue;
    await db.circleMembership.delete({ where: { id: membership.id } });
    removed.push(membership.externalId);
  }

  return { added, removed, skippedUnprovisioned };
}

/**
 * Best-effort pull of one cohort-linked circle. A null roster (Mikoshi down,
 * URL unset, auth missing) is a no-op — the current cache keeps serving.
 */
export async function pullCircleRoster(
  db: PrismaClient,
  client: MikoshiPlatformClient,
  circle: { id: string; cohortId: string },
): Promise<RosterReconcileResult | null> {
  const roster = await client.listCohortMembers(circle.cohortId);
  if (roster === null) return null;
  return reconcileCircleRoster(db, circle.id, roster);
}

/** Refresh every cohort-linked circle (SSO trigger). Best-effort, sequential. */
export async function pullAllCohortCircles(
  db: PrismaClient,
  client: MikoshiPlatformClient,
): Promise<void> {
  const circles = await db.circle.findMany({
    where: { cohortId: { not: null } },
    select: { id: true, cohortId: true },
  });
  for (const circle of circles) {
    await pullCircleRoster(db, client, { id: circle.id, cohortId: circle.cohortId as string });
  }
}
