import type { Prisma, PrismaClient } from "../../generated/prisma/client";

const WEEKDAY_ORDER: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

export type EntryWithRelations = Prisma.EntryGetPayload<{
  include: {
    weekdays: true;
    entryType: { select: { slug: true } };
  };
}>;

export type EntryListFiltersInternal = {
  entryTypeSlug?: string;
  isActive?: boolean;
  query?: string;
};

const entryInclude = {
  weekdays: true,
  entryType: { select: { slug: true } },
} as const;

function buildEntryWhere(params: {
  userId: string;
  entryId?: string;
  filters?: EntryListFiltersInternal;
}): Prisma.EntryWhereInput {
  const where: Prisma.EntryWhereInput = {
    userId: params.userId,
  };

  if (params.entryId) {
    where.id = params.entryId;
  }

  if (params.filters?.entryTypeSlug) {
    where.entryType = { slug: params.filters.entryTypeSlug };
  }

  if (params.filters?.isActive !== undefined) {
    where.isActive = params.filters.isActive;
  }

  if (params.filters?.query) {
    const contains = params.filters.query;
    where.OR = [
      { name: { contains } },
      { category: { contains } },
      { description: { contains } },
    ];
  }

  return where;
}

export function sortWeekdays(weekdays: Array<{ day: string }>): string[] {
  return weekdays
    .map((entry) => entry.day)
    .sort((left, right) => (WEEKDAY_ORDER[left] ?? 99) - (WEEKDAY_ORDER[right] ?? 99));
}

export async function findEntryTypeBySlug(db: PrismaClient, slug: string) {
  return db.entryType.findUnique({ where: { slug } });
}

export async function createEntryRecord(
  db: PrismaClient,
  params: {
    userId: string;
    entryTypeId: string;
    name: string;
    description: string | null;
    category: string | null;
    config: string;
    startDate: string;
    weekdays: string[];
  },
): Promise<EntryWithRelations> {
  return db.entry.create({
    data: {
      userId: params.userId,
      entryTypeId: params.entryTypeId,
      name: params.name,
      description: params.description,
      category: params.category,
      config: params.config,
      startDate: params.startDate,
      isActive: true,
      weekdays: params.weekdays.length
        ? {
            create: params.weekdays.map((day) => ({ day })),
          }
        : undefined,
    },
    include: entryInclude,
  });
}

export async function findOwnedEntry(
  db: PrismaClient,
  params: { userId: string; entryId: string },
): Promise<EntryWithRelations | null> {
  return db.entry.findFirst({
    where: buildEntryWhere(params),
    include: entryInclude,
  });
}

export async function listEntries(
  db: PrismaClient,
  params: { userId: string; filters?: EntryListFiltersInternal },
): Promise<EntryWithRelations[]> {
  return db.entry.findMany({
    where: buildEntryWhere(params),
    orderBy: { createdAt: "asc" },
    include: entryInclude,
  });
}

export async function updateEntryRecord(
  db: PrismaClient,
  params: {
    entryId: string;
    name?: string;
    description?: string | null;
    category?: string | null;
    config?: string;
  },
): Promise<EntryWithRelations> {
  const data: Prisma.EntryUpdateInput = {};
  if (params.name !== undefined) data.name = params.name;
  if (params.description !== undefined) data.description = params.description;
  if (params.category !== undefined) data.category = params.category;
  if (params.config !== undefined) data.config = params.config;

  return db.entry.update({
    where: { id: params.entryId },
    data,
    include: entryInclude,
  });
}

export async function setEntryActive(
  db: PrismaClient,
  params: { entryId: string; isActive: boolean },
): Promise<EntryWithRelations> {
  return db.entry.update({
    where: { id: params.entryId },
    data: { isActive: params.isActive },
    include: entryInclude,
  });
}
