import type { Db } from "../../db/client";
import { newId, nowDb } from "../../db/rows";

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

type AttachmentRow = {
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
  createdAt: string;
  updatedAt: string;
};

function mapAttachment(row: AttachmentRow): PersistedAttachment {
  return {
    id: row.id,
    eventMutationId: row.eventMutationId,
    userId: row.userId,
    kind: row.kind,
    storageKey: row.storageKey,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    width: row.width,
    height: row.height,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/** Resolve an EventMutation the caller owns, or null. */
export async function findOwnedMutation(
  db: Db,
  params: { userId: string; mutationId: string },
): Promise<OwnedMutation | null> {
  return db.get<OwnedMutation>(
    `SELECT "id", "userId" FROM "EventMutation" WHERE "id" = ? AND "userId" = ? LIMIT 1`,
    [params.mutationId, params.userId],
  );
}

/**
 * Resolve the most recent real check-in mutation (ignoring undo records) of an
 * entry the caller owns. `habitId` is the Entry id.
 */
export async function findLatestOwnedMutationForHabit(
  db: Db,
  params: { userId: string; habitId: string },
): Promise<OwnedMutation | null> {
  return db.get<OwnedMutation>(
    `SELECT "id", "userId" FROM "EventMutation"
     WHERE "entryId" = ? AND "userId" = ? AND "type" != 'UNDO'
     ORDER BY "createdAt" DESC, "id" DESC LIMIT 1`,
    [params.habitId, params.userId],
  );
}

/** Resolve the most recent real mutation for a specific EntryEvent the caller owns. */
export async function findLatestOwnedMutationForEvent(
  db: Db,
  params: { userId: string; eventId: string },
): Promise<OwnedMutation | null> {
  return db.get<OwnedMutation>(
    `SELECT "id", "userId" FROM "EventMutation"
     WHERE "eventId" = ? AND "userId" = ? AND "type" != 'UNDO'
     ORDER BY "createdAt" DESC, "id" DESC LIMIT 1`,
    [params.eventId, params.userId],
  );
}

export async function countAttachmentsForMutation(db: Db, mutationId: string): Promise<number> {
  return (
    db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM "Attachment" WHERE "eventMutationId" = ?`, [mutationId])?.c ?? 0
  );
}

export async function createAttachment(
  db: Db,
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
  const id = newId();
  const now = nowDb();
  db.run(
    `INSERT INTO "Attachment"
       ("id", "eventMutationId", "userId", "kind", "storageKey", "originalName", "mimeType", "size", "width", "height", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.mutationId,
      data.userId,
      data.kind,
      data.storageKey,
      data.originalName,
      data.mimeType,
      data.size,
      data.width,
      data.height,
      now,
      now,
    ],
  );
  const row = db.get<AttachmentRow>(`SELECT * FROM "Attachment" WHERE "id" = ?`, [id]);
  if (!row) throw new Error(`Attachment not found after write: ${id}`);
  return mapAttachment(row);
}

export async function listAttachmentsByMutation(
  db: Db,
  params: { userId: string; mutationId: string },
): Promise<PersistedAttachment[]> {
  return db
    .all<AttachmentRow>(
      `SELECT * FROM "Attachment" WHERE "userId" = ? AND "eventMutationId" = ? ORDER BY "createdAt" ASC`,
      [params.userId, params.mutationId],
    )
    .map(mapAttachment);
}

export async function listAttachmentsByHabit(
  db: Db,
  params: { userId: string; habitId: string },
): Promise<PersistedAttachment[]> {
  return db
    .all<AttachmentRow>(
      `SELECT a.* FROM "Attachment" a
       JOIN "EventMutation" em ON em."id" = a."eventMutationId"
       WHERE a."userId" = ? AND em."entryId" = ? ORDER BY a."createdAt" ASC`,
      [params.userId, params.habitId],
    )
    .map(mapAttachment);
}

/** Resolve an attachment the caller owns, or null. */
export async function findOwnedAttachment(
  db: Db,
  params: { userId: string; id: string },
): Promise<PersistedAttachment | null> {
  const row = db.get<AttachmentRow>(`SELECT * FROM "Attachment" WHERE "id" = ? AND "userId" = ? LIMIT 1`, [
    params.id,
    params.userId,
  ]);
  return row ? mapAttachment(row) : null;
}

export async function deleteAttachment(db: Db, id: string): Promise<void> {
  db.run(`DELETE FROM "Attachment" WHERE "id" = ?`, [id]);
}
