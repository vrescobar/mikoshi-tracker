import type { Db } from "../../src/db/client";
import { newId, nowDb } from "../../src/db/rows";

type DayStateSeed = {
  habitId: string;
  dateKey: string;
  completed?: boolean;
  value?: number | null;
};

/**
 * Seed EntryEvents — the generic-engine analogue of the legacy HabitDayState rows.
 * Each row carries its own `habitId` (the Entry id); the owner and kind are derived
 * from the entry, and payload/value/completed are written exactly as
 * events.service.persistEvent / the checkin adapter would, via bun:sqlite.
 */
export async function seedHabitDayStates(db: Db, rows: DayStateSeed[]): Promise<void> {
  const entryInfo = new Map<string, { userId: string; kind: "BOOLEAN" | "QUANTITY" }>();

  for (const row of rows) {
    let info = entryInfo.get(row.habitId);
    if (!info) {
      const entry = db.get<{ userId: string; slug: string }>(
        `SELECT e."userId" AS "userId", et."slug" AS "slug"
         FROM "Entry" e JOIN "EntryType" et ON et."id" = e."entryTypeId" WHERE e."id" = ? LIMIT 1`,
        [row.habitId],
      );
      if (!entry) throw new Error(`Entry not found: ${row.habitId}`);
      info = { userId: entry.userId, kind: entry.slug === "habit_quantity" ? "QUANTITY" : "BOOLEAN" };
      entryInfo.set(row.habitId, info);
    }

    const completed = row.completed ?? false;
    const value = info.kind === "QUANTITY" ? (row.value ?? 0) : null;
    const payload =
      info.kind === "QUANTITY" ? JSON.stringify({ value: value ?? 0, completed }) : JSON.stringify({ completed });

    const now = nowDb();
    db.run(
      `INSERT INTO "EntryEvent"
         ("id", "entryId", "userId", "occurredAt", "dateKey", "payload", "value", "completed", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        row.habitId,
        info.userId,
        new Date(`${row.dateKey}T12:00:00.000Z`).toISOString(),
        row.dateKey,
        payload,
        value,
        completed ? 1 : 0,
        now,
        now,
      ],
    );
  }
}
