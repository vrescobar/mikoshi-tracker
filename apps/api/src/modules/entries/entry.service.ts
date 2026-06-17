import type { EntryRecord } from "@mikoshi-tracker/contracts/entries";

import type { Db } from "../../db/client";
import { normalizeUserTimeZone } from "../../shared/timezone";
import { getUserById } from "../users/user.repository";
import { resolveHabitDay } from "../today/today-clock";
import { getCompiledSchema } from "../entry-types/schema-cache";

import {
  createEntryRecord,
  type EntryWithRelations,
  findEntryTypeBySlug,
  findOwnedEntry,
  listEntries as listEntryRecords,
  setEntryActive,
  sortWeekdays,
  updateEntryRecord,
} from "./entry.repository";
import {
  type NormalizedCreateEntryInput,
  normalizeCreateEntryInput,
  parseCreateEntryInput,
  parseEntryListFilters,
  parseUpdateEntryInput,
} from "./entry.schema";

export class EntryNotFoundError extends Error {
  constructor() {
    super("Entry not found");
    this.name = "EntryNotFoundError";
  }
}

export class EntryInactiveError extends Error {
  constructor() {
    super("Archived entries are read-only until restored");
    this.name = "EntryInactiveError";
  }
}

export class EntryTypeNotFoundError extends Error {
  constructor(slug: string) {
    super(`Unknown entry type: ${slug}`);
    this.name = "EntryTypeNotFoundError";
  }
}

type EntryServiceDependencies = {
  db: Db;
};

type CreateEntryParams = {
  userId: string;
  input: unknown;
  today?: string;
  timestamp?: Date | number | string;
};

type UpdateEntryParams = {
  userId: string;
  entryId: string;
  input: unknown;
};

function serializeEntry(record: EntryWithRelations): EntryRecord {
  return {
    id: record.id,
    userId: record.userId,
    entryTypeId: record.entryTypeId,
    entryTypeSlug: record.entryType.slug,
    name: record.name,
    description: record.description ?? null,
    category: record.category ?? null,
    config: JSON.parse(record.config) as unknown,
    startDate: record.startDate,
    isActive: record.isActive,
    weekdays: sortWeekdays(record.weekdays),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function resolveUserToday(
  dependencies: EntryServiceDependencies,
  params: { userId: string; timestamp?: Date | number | string },
): Promise<string> {
  const user = getUserById(dependencies.db, params.userId);

  if (!user) {
    throw new EntryNotFoundError();
  }

  return resolveHabitDay({
    timestamp: params.timestamp ?? new Date(),
    timeZone: normalizeUserTimeZone(user.timezone),
  }).todayKey;
}

async function validateConfig(
  dependencies: EntryServiceDependencies,
  params: { entryTypeId: string; config: unknown },
): Promise<unknown> {
  const compiled = await getCompiledSchema(dependencies.db, params.entryTypeId);
  return compiled.config.parse(params.config);
}

async function requireOwnedEntry(
  dependencies: EntryServiceDependencies,
  params: { userId: string; entryId: string },
) {
  const record = await findOwnedEntry(dependencies.db, params);
  if (!record) {
    throw new EntryNotFoundError();
  }
  return record;
}

export async function createEntry(
  dependencies: EntryServiceDependencies,
  params: CreateEntryParams,
): Promise<EntryRecord> {
  const parsed = parseCreateEntryInput(params.input);
  const today =
    params.today ??
    (await resolveUserToday(dependencies, {
      userId: params.userId,
      timestamp: params.timestamp,
    }));

  const normalized: NormalizedCreateEntryInput = normalizeCreateEntryInput(parsed, { today });
  const entryType = await findEntryTypeBySlug(dependencies.db, normalized.entryTypeSlug);
  if (!entryType) {
    throw new EntryTypeNotFoundError(normalized.entryTypeSlug);
  }

  const validatedConfig = await validateConfig(dependencies, {
    entryTypeId: entryType.id,
    config: normalized.config,
  });

  const record = await createEntryRecord(dependencies.db, {
    userId: params.userId,
    entryTypeId: entryType.id,
    name: normalized.name,
    description: normalized.description,
    category: normalized.category,
    config: JSON.stringify(validatedConfig),
    startDate: normalized.startDate,
    weekdays: normalized.weekdays,
  });

  return serializeEntry(record);
}

export async function listEntries(
  dependencies: EntryServiceDependencies,
  params: { userId: string; filters?: unknown },
): Promise<EntryRecord[]> {
  const filters = parseEntryListFilters(params.filters ?? {});
  const records = await listEntryRecords(dependencies.db, {
    userId: params.userId,
    filters,
  });
  return records.map((record) => serializeEntry(record));
}

export async function getEntry(
  dependencies: EntryServiceDependencies,
  params: { userId: string; entryId: string },
): Promise<EntryRecord> {
  const record = await requireOwnedEntry(dependencies, params);
  return serializeEntry(record);
}

export async function updateEntry(
  dependencies: EntryServiceDependencies,
  params: UpdateEntryParams,
): Promise<EntryRecord> {
  const patch = parseUpdateEntryInput(params.input);
  const existing = await requireOwnedEntry(dependencies, params);
  if (!existing.isActive) {
    throw new EntryInactiveError();
  }

  let configString: string | undefined;
  if (patch.config !== undefined) {
    const validated = await validateConfig(dependencies, {
      entryTypeId: existing.entryTypeId,
      config: patch.config,
    });
    configString = JSON.stringify(validated);
  }

  const updated = await updateEntryRecord(dependencies.db, {
    entryId: existing.id,
    name: patch.name,
    description: patch.description,
    category: patch.category,
    config: configString,
  });

  return serializeEntry(updated);
}

export async function archiveEntry(
  dependencies: EntryServiceDependencies,
  params: { userId: string; entryId: string },
): Promise<EntryRecord> {
  const existing = await requireOwnedEntry(dependencies, params);
  const updated = await setEntryActive(dependencies.db, {
    entryId: existing.id,
    isActive: false,
  });
  return serializeEntry(updated);
}

export async function restoreEntry(
  dependencies: EntryServiceDependencies,
  params: { userId: string; entryId: string },
): Promise<EntryRecord> {
  const existing = await requireOwnedEntry(dependencies, params);
  const updated = await setEntryActive(dependencies.db, {
    entryId: existing.id,
    isActive: true,
  });
  return serializeEntry(updated);
}
