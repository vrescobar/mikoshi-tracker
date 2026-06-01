/**
 * Merge two User rows into one (admin-only consolidation).
 *
 * Motivation: one human can accumulate two User rows — a web account (real
 * email, externalId = null) and a Mikoshi-provisioned account (synthetic
 * email, externalId set). They own different circles and hold different
 * habits/tokens, which makes member/circle admin painful. This folds `source`
 * into `target`: every FK that points at the source is re-parented to the
 * target (de-duping the unique-constrained ones), the source's externalId and
 * admin flag are carried over, and the source row is deleted — all in one
 * transaction.
 *
 * The target should be the canonical survivor (typically the real-email
 * account). After merging the provisioned row in, the target keeps the
 * externalId (so WhatsApp magic-links + the skill's personal token resolve to
 * it) AND the human's web login.
 */
import type { PrismaClient } from "../../generated/prisma/client";

export class UserMergeError extends Error {
  constructor(
    readonly code: "SAME_USER" | "SOURCE_NOT_FOUND" | "TARGET_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "UserMergeError";
  }
}

export interface MergeUsersResult {
  targetUserId: string;
  movedExternalId: string | null;
  targetIsAdmin: boolean;
  reparented: {
    entries: number;
    entryEvents: number;
    eventMutations: number;
    attachments: number;
    circlesOwned: number;
    circleMemberships: number;
    circleMembershipsDeduped: number;
    leaderboardSnapshots: number;
    leaderboardSnapshotsDeduped: number;
    sessions: number;
    accounts: number;
    magicLinks: number;
    apiTokenMoved: boolean;
  };
}

export async function mergeUsers(
  db: PrismaClient,
  params: { sourceUserId: string; targetUserId: string },
): Promise<MergeUsersResult> {
  const { sourceUserId, targetUserId } = params;
  if (sourceUserId === targetUserId) {
    throw new UserMergeError("SAME_USER", "sourceUserId and targetUserId are the same");
  }

  return db.$transaction(async (tx) => {
    const source = await tx.user.findUnique({ where: { id: sourceUserId } });
    if (!source) throw new UserMergeError("SOURCE_NOT_FOUND", `No user with id ${sourceUserId}`);
    const target = await tx.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new UserMergeError("TARGET_NOT_FOUND", `No user with id ${targetUserId}`);

    const bySource = { where: { userId: sourceUserId } };

    // 1. Collision-free re-parents (scalar userId / ownerId fields).
    const entries = (await tx.entry.updateMany({ ...bySource, data: { userId: targetUserId } })).count;
    const entryEvents = (await tx.entryEvent.updateMany({ ...bySource, data: { userId: targetUserId } })).count;
    const eventMutations = (await tx.eventMutation.updateMany({ ...bySource, data: { userId: targetUserId } })).count;
    const attachments = (await tx.attachment.updateMany({ ...bySource, data: { userId: targetUserId } })).count;
    const sessions = (await tx.session.updateMany({ ...bySource, data: { userId: targetUserId } })).count;
    const accounts = (await tx.account.updateMany({ ...bySource, data: { userId: targetUserId } })).count;
    const magicLinks = (await tx.magicLink.updateMany({ ...bySource, data: { userId: targetUserId } })).count;
    const circlesOwned = (
      await tx.circle.updateMany({ where: { ownerId: sourceUserId }, data: { ownerId: targetUserId } })
    ).count;

    // 2. CircleMembership — unique(circleId,userId) and unique(circleId,externalId).
    //    For circles where the target is already a member, fold the source's
    //    membership in (carrying its externalId/owner role if the target lacks
    //    them) and delete it; otherwise re-parent it.
    const sourceMemberships = await tx.circleMembership.findMany({ where: { userId: sourceUserId } });
    const targetMemberships = await tx.circleMembership.findMany({ where: { userId: targetUserId } });
    const targetByCircle = new Map(targetMemberships.map((m) => [m.circleId, m]));
    let circleMemberships = 0;
    let circleMembershipsDeduped = 0;
    for (const sm of sourceMemberships) {
      const tm = targetByCircle.get(sm.circleId);
      if (tm) {
        // Delete the source's membership FIRST so copying its externalId onto
        // the target's row can't transiently violate unique(circleId,externalId).
        await tx.circleMembership.delete({ where: { id: sm.id } });
        const data: { externalId?: string; role?: string } = {};
        if (!tm.externalId && sm.externalId) data.externalId = sm.externalId;
        if (tm.role !== "owner" && sm.role === "owner") data.role = "owner";
        if (Object.keys(data).length > 0) await tx.circleMembership.update({ where: { id: tm.id }, data });
        circleMembershipsDeduped++;
      } else {
        await tx.circleMembership.update({ where: { id: sm.id }, data: { userId: targetUserId } });
        circleMemberships++;
      }
    }

    // 3. CircleLeaderboardSnapshot — unique(circleId,season,userId).
    const sourceSnaps = await tx.circleLeaderboardSnapshot.findMany({ where: { userId: sourceUserId } });
    const targetSnaps = await tx.circleLeaderboardSnapshot.findMany({ where: { userId: targetUserId } });
    const targetSnapKeys = new Set(targetSnaps.map((s) => `${s.circleId}:${s.season}`));
    let leaderboardSnapshots = 0;
    let leaderboardSnapshotsDeduped = 0;
    for (const ss of sourceSnaps) {
      if (targetSnapKeys.has(`${ss.circleId}:${ss.season}`)) {
        await tx.circleLeaderboardSnapshot.delete({ where: { id: ss.id } });
        leaderboardSnapshotsDeduped++;
      } else {
        await tx.circleLeaderboardSnapshot.update({ where: { id: ss.id }, data: { userId: targetUserId } });
        leaderboardSnapshots++;
      }
    }

    // 4. ApiToken — unique(userId). Prefer the source's token (it's the one the
    //    Mikoshi skill already has stored), so move it onto the target.
    let apiTokenMoved = false;
    const sourceToken = await tx.apiToken.findUnique({ where: { userId: sourceUserId } });
    if (sourceToken) {
      await tx.apiToken.deleteMany({ where: { userId: targetUserId } });
      await tx.apiToken.update({ where: { id: sourceToken.id }, data: { userId: targetUserId } });
      apiTokenMoved = true;
    }

    // 5. externalId — unique. Move from source → target only if the target has
    //    none (null the source's first to dodge the unique constraint).
    let movedExternalId: string | null = null;
    if (source.externalId && !target.externalId) {
      await tx.user.update({ where: { id: sourceUserId }, data: { externalId: null } });
      await tx.user.update({ where: { id: targetUserId }, data: { externalId: source.externalId } });
      movedExternalId = source.externalId;
    }

    // 6. Admin flag survives if either side had it.
    const targetIsAdmin = source.isAdmin || target.isAdmin;
    if (targetIsAdmin && !target.isAdmin) {
      await tx.user.update({ where: { id: targetUserId }, data: { isAdmin: true } });
    }

    // 7. Delete the now-empty source row (any leftover children cascade).
    await tx.user.delete({ where: { id: sourceUserId } });

    return {
      targetUserId,
      movedExternalId,
      targetIsAdmin,
      reparented: {
        entries,
        entryEvents,
        eventMutations,
        attachments,
        circlesOwned,
        circleMemberships,
        circleMembershipsDeduped,
        leaderboardSnapshots,
        leaderboardSnapshotsDeduped,
        sessions,
        accounts,
        magicLinks,
        apiTokenMoved,
      },
    };
  });
}
