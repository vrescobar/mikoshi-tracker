import type { Db } from "../../db/client";
import { newId, nowDb } from "../../db/rows";

export type AttachmentRecord = {
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

export type EventMutationWithAttachments = {
  id: string;
  entryId: string;
  eventId: string | null;
  userId: string;
  dateKey: string;
  type: string;
  source: string;
  note: string | null;
  onBehalfOfCircleId: string | null;
  previousPayload: string | null;
  nextPayload: string | null;
  createdAt: Date;
  attachments: AttachmentRecord[];
};

export type EventWithMutations = {
  id: string;
  entryId: string;
  userId: string;
  occurredAt: Date;
  dateKey: string;
  payload: string;
  value: number | null;
  completed: boolean | null;
  createdAt: Date;
  updatedAt: Date;
  mutations: EventMutationWithAttachments[];
};

export type EntryWithTypeAndUser = {
  id: string;
  isActive: boolean;
  entryTypeId: string;
  entryType: { id: string; slug: string; cadence: string };
  user: { id: string; timezone: string };
};

// ─── Row mappers ─────────────────────────────────────────────────────────────

function mapAttachment(r: Record<string, unknown>): AttachmentRecord {
  return {
    id: r.id as string,
    eventMutationId: (r.eventMutationId as string | null) ?? null,
    userId: r.userId as string,
    kind: r.kind as string,
    storageKey: r.storageKey as string,
    originalName: (r.originalName as string | null) ?? null,
    mimeType: r.mimeType as string,
    size: r.size as number,
    width: (r.width as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    createdAt: new Date(r.createdAt as string),
    updatedAt: new Date(r.updatedAt as string),
  };
}

function loadAttachments(db: Db, eventMutationId: string): AttachmentRecord[] {
  return db
    .all<Record<string, unknown>>(`SELECT * FROM "Attachment" WHERE "eventMutationId" = ?`, [eventMutationId])
    .map(mapAttachment);
}

function mapMutation(db: Db, r: Record<string, unknown>): EventMutationWithAttachments {
  return {
    id: r.id as string,
    entryId: r.entryId as string,
    eventId: (r.eventId as string | null) ?? null,
    userId: r.userId as string,
    dateKey: r.dateKey as string,
    type: r.type as string,
    source: r.source as string,
    note: (r.note as string | null) ?? null,
    onBehalfOfCircleId: (r.onBehalfOfCircleId as string | null) ?? null,
    previousPayload: (r.previousPayload as string | null) ?? null,
    nextPayload: (r.nextPayload as string | null) ?? null,
    createdAt: new Date(r.createdAt as string),
    attachments: loadAttachments(db, r.id as string),
  };
}

function loadMutations(db: Db, eventId: string): EventMutationWithAttachments[] {
  return db
    .all<Record<string, unknown>>(
      `SELECT * FROM "EventMutation" WHERE "eventId" = ? ORDER BY "createdAt" ASC, "id" ASC`,
      [eventId],
    )
    .map((r) => mapMutation(db, r));
}

function mapEvent(db: Db, r: Record<string, unknown>): EventWithMutations {
  return {
    id: r.id as string,
    entryId: r.entryId as string,
    userId: r.userId as string,
    occurredAt: new Date(r.occurredAt as string),
    dateKey: r.dateKey as string,
    payload: r.payload as string,
    value: r.value === null || r.value === undefined ? null : Number(r.value),
    completed: r.completed === null || r.completed === undefined ? null : r.completed !== 0,
    createdAt: new Date(r.createdAt as string),
    updatedAt: new Date(r.updatedAt as string),
    mutations: loadMutations(db, r.id as string),
  };
}

function loadEvent(db: Db, eventId: string): EventWithMutations | null {
  const row = db.get<Record<string, unknown>>(`SELECT * FROM "EntryEvent" WHERE "id" = ?`, [eventId]);
  return row ? mapEvent(db, row) : null;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function findEntryWithType(
  db: Db,
  params: { entryId: string; userId: string },
): Promise<EntryWithTypeAndUser | null> {
  const row = db.get<{
    id: string;
    isActive: number;
    entryTypeId: string;
    slug: string;
    cadence: string;
    userId: string;
    timezone: string;
  }>(
    `SELECT e."id", e."isActive", e."entryTypeId", et."slug", et."cadence", u."id" AS "userId", u."timezone"
     FROM "Entry" e
     JOIN "EntryType" et ON et."id" = e."entryTypeId"
     JOIN "User" u ON u."id" = e."userId"
     WHERE e."id" = ? AND e."userId" = ?`,
    [params.entryId, params.userId],
  );
  if (!row) return null;
  return {
    id: row.id,
    isActive: row.isActive !== 0,
    entryTypeId: row.entryTypeId,
    entryType: { id: row.entryTypeId, slug: row.slug, cadence: row.cadence },
    user: { id: row.userId, timezone: row.timezone },
  };
}

export async function findEventForDate(
  db: Db,
  params: { entryId: string; dateKey: string },
): Promise<EventWithMutations | null> {
  const row = db.get<Record<string, unknown>>(
    `SELECT * FROM "EntryEvent" WHERE "entryId" = ? AND "dateKey" = ? LIMIT 1`,
    [params.entryId, params.dateKey],
  );
  return row ? mapEvent(db, row) : null;
}

export async function findOwnedEvent(
  db: Db,
  params: { eventId: string; userId: string },
): Promise<EventWithMutations | null> {
  const row = db.get<Record<string, unknown>>(
    `SELECT * FROM "EntryEvent" WHERE "id" = ? AND "userId" = ? LIMIT 1`,
    [params.eventId, params.userId],
  );
  return row ? mapEvent(db, row) : null;
}

export async function listOwnedEvents(
  db: Db,
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
  const clauses: string[] = [`ee."userId" = ?`];
  const args: unknown[] = [params.userId];

  if (params.entryId) {
    clauses.push(`ee."entryId" = ?`);
    args.push(params.entryId);
  }
  if (params.entryTypeSlug) {
    clauses.push(
      `ee."entryId" IN (SELECT e."id" FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId" WHERE et."slug" = ?)`,
    );
    args.push(params.entryTypeSlug);
  }
  if (params.from) {
    clauses.push(`ee."dateKey" >= ?`);
    args.push(params.from);
  }
  if (params.to) {
    clauses.push(`ee."dateKey" <= ?`);
    args.push(params.to);
  }

  // Keyset pagination matching Prisma's `cursor: {id}, skip: 1` over
  // (occurredAt desc, id desc): take rows strictly "after" the cursor row.
  if (params.cursor) {
    const cur = db.get<{ occurredAt: string }>(`SELECT "occurredAt" FROM "EntryEvent" WHERE "id" = ?`, [
      params.cursor,
    ]);
    if (cur) {
      clauses.push(`(ee."occurredAt" < ? OR (ee."occurredAt" = ? AND ee."id" < ?))`);
      args.push(cur.occurredAt, cur.occurredAt, params.cursor);
    }
  }

  args.push(params.limit + 1);
  const rows = db.all<Record<string, unknown>>(
    `SELECT ee.* FROM "EntryEvent" ee WHERE ${clauses.join(" AND ")}
     ORDER BY ee."occurredAt" DESC, ee."id" DESC LIMIT ?`,
    args,
  );
  return rows.map((r) => mapEvent(db, r));
}

export async function createEventRecord(
  db: Db,
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
  const id = newId();
  const now = nowDb();
  db.run(
    `INSERT INTO "EntryEvent"
       ("id", "entryId", "userId", "occurredAt", "dateKey", "payload", "value", "completed", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.entryId,
      params.userId,
      params.occurredAt.toISOString(),
      params.dateKey,
      params.payload,
      params.value,
      params.completed === null ? null : params.completed ? 1 : 0,
      now,
      now,
    ],
  );
  const event = loadEvent(db, id);
  if (!event) throw new Error(`EntryEvent not found after write: ${id}`);
  return event;
}

export async function updateEventRecord(
  db: Db,
  params: {
    eventId: string;
    payload?: string;
    value?: number | null;
    completed?: boolean | null;
    occurredAt?: Date;
    dateKey?: string;
  },
): Promise<EventWithMutations> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (params.payload !== undefined) {
    sets.push(`"payload" = ?`);
    args.push(params.payload);
  }
  if (params.value !== undefined) {
    sets.push(`"value" = ?`);
    args.push(params.value);
  }
  if (params.completed !== undefined) {
    sets.push(`"completed" = ?`);
    args.push(params.completed === null ? null : params.completed ? 1 : 0);
  }
  if (params.occurredAt !== undefined) {
    sets.push(`"occurredAt" = ?`);
    args.push(params.occurredAt.toISOString());
  }
  if (params.dateKey !== undefined) {
    sets.push(`"dateKey" = ?`);
    args.push(params.dateKey);
  }
  sets.push(`"updatedAt" = ?`);
  args.push(nowDb());
  args.push(params.eventId);
  db.run(`UPDATE "EntryEvent" SET ${sets.join(", ")} WHERE "id" = ?`, args);
  const event = loadEvent(db, params.eventId);
  if (!event) throw new Error(`EntryEvent not found after update: ${params.eventId}`);
  return event;
}

export async function createMutationRecord(
  db: Db,
  params: {
    entryId: string;
    eventId: string | null;
    userId: string;
    dateKey: string;
    type: string;
    source: string;
    note: string | null;
    onBehalfOfCircleId?: string | null;
    previousPayload: string | null;
    nextPayload: string | null;
  },
): Promise<EventMutationWithAttachments> {
  const id = newId();
  db.run(
    `INSERT INTO "EventMutation"
       ("id", "entryId", "eventId", "userId", "dateKey", "type", "source", "note", "onBehalfOfCircleId", "previousPayload", "nextPayload", "createdAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.entryId,
      params.eventId,
      params.userId,
      params.dateKey,
      params.type,
      params.source,
      params.note,
      params.onBehalfOfCircleId ?? null,
      params.previousPayload,
      params.nextPayload,
      nowDb(),
    ],
  );
  const row = db.get<Record<string, unknown>>(`SELECT * FROM "EventMutation" WHERE "id" = ?`, [id]);
  if (!row) throw new Error(`EventMutation not found after write: ${id}`);
  return mapMutation(db, row);
}

export async function wireAttachmentsToMutation(
  db: Db,
  params: { eventMutationId: string; attachmentIds: string[]; userId: string },
): Promise<void> {
  if (params.attachmentIds.length === 0) return;
  const placeholders = params.attachmentIds.map(() => "?").join(", ");
  db.run(
    `UPDATE "Attachment" SET "eventMutationId" = ?, "updatedAt" = ?
     WHERE "id" IN (${placeholders}) AND "userId" = ?`,
    [params.eventMutationId, nowDb(), ...params.attachmentIds, params.userId],
  );
}
