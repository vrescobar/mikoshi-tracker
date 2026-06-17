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
import type { Db } from "../../db/client";
import { nowDb } from "../../db/rows";
import { getUserById } from "../users/user.repository";

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
  db: Db,
  params: { sourceUserId: string; targetUserId: string },
): Promise<MergeUsersResult> {
  const { sourceUserId, targetUserId } = params;
  if (sourceUserId === targetUserId) {
    throw new UserMergeError("SAME_USER", "sourceUserId and targetUserId are the same");
  }

  return db.transaction(() => {
    const source = getUserById(db, sourceUserId);
    if (!source) throw new UserMergeError("SOURCE_NOT_FOUND", `No user with id ${sourceUserId}`);
    const target = getUserById(db, targetUserId);
    if (!target) throw new UserMergeError("TARGET_NOT_FOUND", `No user with id ${targetUserId}`);

    const reparent = (table: string, column: string) =>
      db.run(`UPDATE "${table}" SET "${column}" = ? WHERE "${column}" = ?`, [targetUserId, sourceUserId]).changes;

    // 1. Collision-free re-parents (scalar userId / ownerId fields).
    const entries = reparent("Entry", "userId");
    const entryEvents = reparent("EntryEvent", "userId");
    const eventMutations = reparent("EventMutation", "userId");
    const attachments = reparent("Attachment", "userId");
    const sessions = reparent("Session", "userId");
    const accounts = reparent("Account", "userId");
    const magicLinks = reparent("MagicLink", "userId");
    const circlesOwned = reparent("Circle", "ownerId");

    // 2. CircleMembership — unique(circleId,userId) and unique(circleId,externalId).
    const sourceMemberships = db.all<{ id: string; circleId: string; externalId: string | null; role: string }>(
      `SELECT "id", "circleId", "externalId", "role" FROM "CircleMembership" WHERE "userId" = ?`,
      [sourceUserId],
    );
    const targetMemberships = db.all<{ id: string; circleId: string; externalId: string | null; role: string }>(
      `SELECT "id", "circleId", "externalId", "role" FROM "CircleMembership" WHERE "userId" = ?`,
      [targetUserId],
    );
    const targetByCircle = new Map(targetMemberships.map((m) => [m.circleId, m]));
    let circleMemberships = 0;
    let circleMembershipsDeduped = 0;
    for (const sm of sourceMemberships) {
      const tm = targetByCircle.get(sm.circleId);
      if (tm) {
        // Delete the source's membership FIRST so copying its externalId onto
        // the target's row can't transiently violate unique(circleId,externalId).
        db.run(`DELETE FROM "CircleMembership" WHERE "id" = ?`, [sm.id]);
        const sets: string[] = [];
        const args: unknown[] = [];
        if (!tm.externalId && sm.externalId) {
          sets.push(`"externalId" = ?`);
          args.push(sm.externalId);
        }
        if (tm.role !== "owner" && sm.role === "owner") {
          sets.push(`"role" = ?`);
          args.push("owner");
        }
        if (sets.length > 0) {
          args.push(tm.id);
          db.run(`UPDATE "CircleMembership" SET ${sets.join(", ")} WHERE "id" = ?`, args);
        }
        circleMembershipsDeduped++;
      } else {
        db.run(`UPDATE "CircleMembership" SET "userId" = ? WHERE "id" = ?`, [targetUserId, sm.id]);
        circleMemberships++;
      }
    }

    // 3. CircleLeaderboardSnapshot — unique(circleId,season,userId).
    const sourceSnaps = db.all<{ id: string; circleId: string; season: string }>(
      `SELECT "id", "circleId", "season" FROM "CircleLeaderboardSnapshot" WHERE "userId" = ?`,
      [sourceUserId],
    );
    const targetSnaps = db.all<{ circleId: string; season: string }>(
      `SELECT "circleId", "season" FROM "CircleLeaderboardSnapshot" WHERE "userId" = ?`,
      [targetUserId],
    );
    const targetSnapKeys = new Set(targetSnaps.map((s) => `${s.circleId}:${s.season}`));
    let leaderboardSnapshots = 0;
    let leaderboardSnapshotsDeduped = 0;
    for (const ss of sourceSnaps) {
      if (targetSnapKeys.has(`${ss.circleId}:${ss.season}`)) {
        db.run(`DELETE FROM "CircleLeaderboardSnapshot" WHERE "id" = ?`, [ss.id]);
        leaderboardSnapshotsDeduped++;
      } else {
        db.run(`UPDATE "CircleLeaderboardSnapshot" SET "userId" = ? WHERE "id" = ?`, [targetUserId, ss.id]);
        leaderboardSnapshots++;
      }
    }

    // 4. ApiToken — unique(userId). Prefer the source's token (it's the one the
    //    Mikoshi skill already has stored), so move it onto the target.
    let apiTokenMoved = false;
    const sourceToken = db.get<{ id: string }>(`SELECT "id" FROM "ApiToken" WHERE "userId" = ? LIMIT 1`, [
      sourceUserId,
    ]);
    if (sourceToken) {
      db.run(`DELETE FROM "ApiToken" WHERE "userId" = ?`, [targetUserId]);
      db.run(`UPDATE "ApiToken" SET "userId" = ? WHERE "id" = ?`, [targetUserId, sourceToken.id]);
      apiTokenMoved = true;
    }

    // 5. externalId — unique. Move from source → target only if the target has
    //    none (null the source's first to dodge the unique constraint).
    let movedExternalId: string | null = null;
    if (source.externalId && !target.externalId) {
      const now = nowDb();
      db.run(`UPDATE "User" SET "externalId" = NULL, "updatedAt" = ? WHERE "id" = ?`, [now, sourceUserId]);
      db.run(`UPDATE "User" SET "externalId" = ?, "updatedAt" = ? WHERE "id" = ?`, [source.externalId, now, targetUserId]);
      movedExternalId = source.externalId;
    }

    // 6. Admin flag survives if either side had it.
    const targetIsAdmin = source.isAdmin || target.isAdmin;
    if (targetIsAdmin && !target.isAdmin) {
      db.run(`UPDATE "User" SET "isAdmin" = 1, "updatedAt" = ? WHERE "id" = ?`, [nowDb(), targetUserId]);
    }

    // 7. Delete the now-empty source row (any leftover children cascade).
    db.run(`DELETE FROM "User" WHERE "id" = ?`, [sourceUserId]);

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
