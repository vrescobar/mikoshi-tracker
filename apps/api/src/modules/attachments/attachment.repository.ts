import type { Prisma, PrismaClient } from "../../generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type PersistedAttachment = {
  id: string;
  eventMutationId: string | null;
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
  userId: string;
};

/** Resolve an EventMutation the caller owns, or null. */
export async function findOwnedMutation(
  db: DbClient,
  params: { userId: string; mutationId: string },
): Promise<OwnedMutation | null> {
  const mutation = await db.eventMutation.findFirst({
    where: { id: params.mutationId, userId: params.userId },
    select: { id: true, userId: true },
  });

  return mutation ?? null;
}

/**
 * Resolve the most recent real check-in mutation (ignoring undo records) of an
 * entry the caller owns. Lets the web attach a photo to "today's entry" without
 * surfacing individual mutation ids in the UI. `habitId` is the Entry id.
 */
export async function findLatestOwnedMutationForHabit(
  db: DbClient,
  params: { userId: string; habitId: string },
): Promise<OwnedMutation | null> {
  const mutation = await db.eventMutation.findFirst({
    where: { entryId: params.habitId, userId: params.userId, type: { not: "UNDO" } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, userId: true },
  });

  return mutation ?? null;
}

export async function countAttachmentsForMutation(db: DbClient, mutationId: string): Promise<number> {
  return db.attachment.count({ where: { eventMutationId: mutationId } });
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
  const { mutationId, ...rest } = data;
  return db.attachment.create({ data: { ...rest, eventMutationId: mutationId } });
}

export async function listAttachmentsByMutation(
  db: DbClient,
  params: { userId: string; mutationId: string },
): Promise<PersistedAttachment[]> {
  return db.attachment.findMany({
    where: { userId: params.userId, eventMutationId: params.mutationId },
    orderBy: { createdAt: "asc" },
  });
}

export async function listAttachmentsByHabit(
  db: DbClient,
  params: { userId: string; habitId: string },
): Promise<PersistedAttachment[]> {
  return db.attachment.findMany({
    where: { userId: params.userId, eventMutation: { entryId: params.habitId } },
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
