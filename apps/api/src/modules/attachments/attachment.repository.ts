import type { Prisma, PrismaClient } from "../../generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type PersistedAttachment = {
  id: string;
  mutationId: string;
  userId: string;
  kind: string;
  storageKey: string;
  originalName: string | null;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OwnedMutation = {
  id: string;
  habitId: string;
  userId: string;
};

/** Resolve a mutation the caller owns (via the habit's owner), or null. */
export async function findOwnedMutation(
  db: DbClient,
  params: { userId: string; mutationId: string },
): Promise<OwnedMutation | null> {
  const mutation = await db.checkInMutation.findFirst({
    where: {
      id: params.mutationId,
      habit: { userId: params.userId },
    },
    select: {
      id: true,
      habitId: true,
      habit: { select: { userId: true } },
    },
  });

  if (!mutation) {
    return null;
  }

  return {
    id: mutation.id,
    habitId: mutation.habitId,
    userId: mutation.habit.userId,
  };
}

/**
 * Resolve the most recent real check-in entry (ignoring undo records) of a
 * habit the caller owns. Lets the web attach a photo to "today's entry"
 * without surfacing individual mutation ids in the UI.
 */
export async function findLatestOwnedMutationForHabit(
  db: DbClient,
  params: { userId: string; habitId: string },
): Promise<OwnedMutation | null> {
  const habit = await db.habit.findFirst({
    where: { id: params.habitId, userId: params.userId },
    select: { id: true, userId: true },
  });

  if (!habit) {
    return null;
  }

  const mutation = await db.checkInMutation.findFirst({
    where: { habitId: habit.id, type: { not: "UNDO" } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, habitId: true },
  });

  if (!mutation) {
    return null;
  }

  return { id: mutation.id, habitId: mutation.habitId, userId: habit.userId };
}

export async function countAttachmentsForMutation(db: DbClient, mutationId: string): Promise<number> {
  return db.attachment.count({ where: { mutationId } });
}

export async function createAttachment(
  db: DbClient,
  data: {
    mutationId: string;
    userId: string;
    kind: string;
    storageKey: string;
    originalName: string | null;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
  },
): Promise<PersistedAttachment> {
  return db.attachment.create({ data });
}

export async function listAttachmentsByMutation(
  db: DbClient,
  params: { userId: string; mutationId: string },
): Promise<PersistedAttachment[]> {
  return db.attachment.findMany({
    where: { userId: params.userId, mutationId: params.mutationId },
    orderBy: { createdAt: "asc" },
  });
}

export async function listAttachmentsByHabit(
  db: DbClient,
  params: { userId: string; habitId: string },
): Promise<PersistedAttachment[]> {
  return db.attachment.findMany({
    where: { userId: params.userId, mutation: { habitId: params.habitId } },
    orderBy: { createdAt: "asc" },
  });
}

/** Resolve an attachment the caller owns, or null. */
export async function findOwnedAttachment(
  db: DbClient,
  params: { userId: string; id: string },
): Promise<PersistedAttachment | null> {
  return db.attachment.findFirst({
    where: { id: params.id, userId: params.userId },
  });
}

export async function deleteAttachment(db: DbClient, id: string): Promise<void> {
  await db.attachment.delete({ where: { id } });
}
