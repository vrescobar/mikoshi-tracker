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
import type { PrismaClient } from "../../generated/prisma/client";

import { mergeUsers } from "../admin/user-merge";
import type { MikoshiPlatformClient } from "./mikoshi-platform-client";

export type ReconcileAction = "merged" | "re-keyed" | "noop";

export async function reconcileMergedIdentity(
  db: PrismaClient,
  params: { orphanExternalId: string; survivorExternalId: string },
): Promise<ReconcileAction> {
  const { orphanExternalId, survivorExternalId } = params;
  if (orphanExternalId === survivorExternalId) return "noop";

  const orphanUser = await db.user.findUnique({
    where: { externalId: orphanExternalId },
    select: { id: true },
  });
  if (!orphanUser) return "noop";

  const survivorUser = await db.user.findUnique({
    where: { externalId: survivorExternalId },
    select: { id: true },
  });

  if (survivorUser && survivorUser.id !== orphanUser.id) {
    await mergeUsers(db, {
      sourceUserId: orphanUser.id,
      targetUserId: survivorUser.id,
    });
    return "merged";
  }

  await db.user.update({
    where: { id: orphanUser.id },
    data: { externalId: survivorExternalId },
  });
  return "re-keyed";
}

/**
 * Lazy net: ask Mikoshi about every stored externalId and reconcile the ones
 * it reports as merged. Identity fetches run in parallel (each bounded by the
 * client timeout); reconciles run sequentially because they write.
 */
export async function sweepMergedIdentities(
  db: PrismaClient,
  client: MikoshiPlatformClient,
): Promise<ReconcileAction[]> {
  const users = await db.user.findMany({
    where: { externalId: { not: null } },
    select: { externalId: true },
  });

  const lookups = await Promise.all(
    users.map(async (user) => ({
      externalId: user.externalId as string,
      identity: await client.getIdentity(user.externalId as string),
    })),
  );

  const actions: ReconcileAction[] = [];
  for (const { externalId, identity } of lookups) {
    if (!identity || identity.merged !== true) continue;
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
