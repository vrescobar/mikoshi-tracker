import type { Prisma, PrismaClient } from "../../generated/prisma/client";

export type EventMutationWithAttachments = Prisma.EventMutationGetPayload<{
  include: { attachments: true };
}>;

export type EventWithMutations = Prisma.EntryEventGetPayload<{
  include: {
    mutations: { include: { attachments: true } };
  };
}>;

export type EntryWithTypeAndUser = Prisma.EntryGetPayload<{
  include: {
    entryType: true;
    user: { select: { id: true; timezone: true } };
  };
}>;

const mutationInclude = {
  attachments: true,
} as const;

const eventInclude = {
  mutations: { include: mutationInclude },
} as const;

export async function findEntryWithType(
  db: PrismaClient,
  params: { entryId: string; userId: string },
): Promise<EntryWithTypeAndUser | null> {
  return db.entry.findFirst({
    where: { id: params.entryId, userId: params.userId },
    include: {
      entryType: true,
      user: { select: { id: true, timezone: true } },
    },
  });
}

export async function findEventForDate(
  db: PrismaClient,
  params: { entryId: string; dateKey: string },
): Promise<EventWithMutations | null> {
  return db.entryEvent.findFirst({
    where: { entryId: params.entryId, dateKey: params.dateKey },
    include: eventInclude,
  });
}

export async function findOwnedEvent(
  db: PrismaClient,
  params: { eventId: string; userId: string },
): Promise<EventWithMutations | null> {
  return db.entryEvent.findFirst({
    where: { id: params.eventId, userId: params.userId },
    include: eventInclude,
  });
}

export async function listOwnedEvents(
  db: PrismaClient,
  params: {
    userId: string;
    entryId?: string;
    entryTypeSlug?: string;
    from?: string;
    to?: string;
    limit: number;
    cursor?: string;
  },
): Promise<EventWithMutations[]> {
  const where: Prisma.EntryEventWhereInput = { userId: params.userId };

  if (params.entryId) where.entryId = params.entryId;

  if (params.entryTypeSlug) {
    where.entry = { entryType: { slug: params.entryTypeSlug } };
  }

  if (params.from || params.to) {
    where.dateKey = {};
    if (params.from) (where.dateKey as Prisma.StringFilter).gte = params.from;
    if (params.to) (where.dateKey as Prisma.StringFilter).lte = params.to;
  }

  return db.entryEvent.findMany({
    where,
    include: eventInclude,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: params.limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });
}

export async function createEventRecord(
  db: PrismaClient,
  params: {
    entryId: string;
    userId: string;
    occurredAt: Date;
    dateKey: string;
    payload: string;
    value: number | null;
    completed: boolean | null;
  },
): Promise<EventWithMutations> {
  return db.entryEvent.create({
    data: {
      entryId: params.entryId,
      userId: params.userId,
      occurredAt: params.occurredAt,
      dateKey: params.dateKey,
      payload: params.payload,
      ...(params.value !== null ? { value: params.value } : {}),
      ...(params.completed !== null ? { completed: params.completed } : {}),
    },
    include: eventInclude,
  });
}

export async function updateEventRecord(
  db: PrismaClient,
  params: {
    eventId: string;
    payload: string;
    value: number | null;
    completed: boolean | null;
  },
): Promise<EventWithMutations> {
  const data: Prisma.EntryEventUpdateInput = { payload: params.payload };
  if (params.value !== null) {
    data.value = params.value;
  } else {
    data.value = undefined;
  }
  if (params.completed !== null) {
    data.completed = params.completed;
  } else {
    data.completed = undefined;
  }

  return db.entryEvent.update({
    where: { id: params.eventId },
    data,
    include: eventInclude,
  });
}

export async function createMutationRecord(
  db: PrismaClient,
  params: {
    entryId: string;
    eventId: string | null;
    userId: string;
    dateKey: string;
    type: string;
    source: string;
    note: string | null;
    previousPayload: string | null;
    nextPayload: string | null;
  },
): Promise<EventMutationWithAttachments> {
  return db.eventMutation.create({
    data: {
      entryId: params.entryId,
      eventId: params.eventId,
      userId: params.userId,
      dateKey: params.dateKey,
      type: params.type,
      source: params.source,
      note: params.note,
      previousPayload: params.previousPayload,
      nextPayload: params.nextPayload,
    },
    include: mutationInclude,
  });
}

export async function wireAttachmentsToMutation(
  db: PrismaClient,
  params: { eventMutationId: string; attachmentIds: string[]; userId: string },
): Promise<void> {
  if (params.attachmentIds.length === 0) return;

  await db.attachment.updateMany({
    where: {
      id: { in: params.attachmentIds },
      userId: params.userId,
    },
    data: { eventMutationId: params.eventMutationId },
  });
}
