/**
 * Identity lifecycle (story 52): follow Mikoshi's identity merges.
 *
 * When Mikoshi folds identity O (orphan) into S (survivor), tracker must
 * treat its `externalId` values as re-keyable:
 *  - O and S both have a User here → full merge with the same semantics the
 *    admin console uses (`user-merge.ts`): entries/events/memberships
 *    re-parented, the survivor keeps its externalId and web login.
 *  - only O exists → simple re-key (externalId = S).
 *
 * Two delivery paths feed this:
 *  - push: `POST /hooks/identity` (signed webhook, handled in the controller);
 *  - lazy: `sweepMergedIdentities` checks every stored externalId against
 *    `GET /identities/:id` and reacts to `{merged: true, survivorId}`. It is
 *    triggered on provision/issue-magic-link misses — the moments where a
 *    stale externalId would otherwise duplicate a human or 404 a login.
 */
import type { Db } from "../../db/client";
import { nowDb } from "../../db/rows";

import { mergeUsers } from "../admin/user-merge";
import type { MikoshiPlatformClient } from "./mikoshi-platform-client";

export type ReconcileAction = "merged" | "re-keyed" | "noop";

export async function reconcileMergedIdentity(
  db: Db,
  params: { orphanExternalId: string; survivorExternalId: string },
): Promise<ReconcileAction> {
  const { orphanExternalId, survivorExternalId } = params;
  if (orphanExternalId === survivorExternalId) return "noop";

  const orphanUser = db.get<{ id: string }>(`SELECT "id" FROM "User" WHERE "externalId" = ? LIMIT 1`, [
    orphanExternalId,
  ]);
  if (!orphanUser) return "noop";

  const survivorUser = db.get<{ id: string }>(`SELECT "id" FROM "User" WHERE "externalId" = ? LIMIT 1`, [
    survivorExternalId,
  ]);

  if (survivorUser && survivorUser.id !== orphanUser.id) {
    await mergeUsers(db, {
      sourceUserId: orphanUser.id,
      targetUserId: survivorUser.id,
    });
    return "merged";
  }

  db.run(`UPDATE "User" SET "externalId" = ?, "updatedAt" = ? WHERE "id" = ?`, [
    survivorExternalId,
    nowDb(),
    orphanUser.id,
  ]);
  return "re-keyed";
}

/**
 * Lazy net: ask Mikoshi about every stored externalId and reconcile the ones
 * it reports as merged. Identity fetches run in parallel (each bounded by the
 * client timeout); reconciles run sequentially because they write.
 */
export async function sweepMergedIdentities(
  db: Db,
  client: MikoshiPlatformClient,
): Promise<ReconcileAction[]> {
  const users = db.all<{ externalId: string }>(`SELECT "externalId" FROM "User" WHERE "externalId" IS NOT NULL`);

  const lookups = await Promise.all(
    users.map(async (user) => ({
      externalId: user.externalId,
      identity: await client.getIdentity(user.externalId),
    })),
  );

  const actions: ReconcileAction[] = [];
  for (const { externalId, identity } of lookups) {
    if (identity?.merged !== true) continue;
    const survivorId = identity.survivorId;
    if (typeof survivorId !== "string" || survivorId.length === 0) continue;
    actions.push(
      await reconcileMergedIdentity(db, {
        orphanExternalId: externalId,
        survivorExternalId: survivorId,
      }),
    );
  }
  return actions;
}
