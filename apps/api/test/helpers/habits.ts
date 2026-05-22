import type { PrismaClient } from "../../src/generated/prisma/client";

type DayStateSeed = {
  habitId: string;
  dateKey: string;
  completed?: boolean;
  value?: number | null;
};

/**
 * Seed EntryEvents — the generic-engine analogue of the legacy HabitDayState rows
 * tests used to create via `db.habitDayState.createMany({ data: [...] })`. Accepts the
 * same row shape (each row carries its own `habitId`, which is the Entry id); the owner
 * and kind are derived from the entry, and payload/value/completed are written exactly
 * as events.service.persistEvent / the checkin adapter would.
 */
export async function seedHabitDayStates(db: PrismaClient, rows: DayStateSeed[]): Promise<void> {
  const entryInfo = new Map<string, { userId: string; kind: "BOOLEAN" | "QUANTITY" }>();

  for (const row of rows) {
    let info = entryInfo.get(row.habitId);
    if (!info) {
      const entry = await db.entry.findUniqueOrThrow({
        where: { id: row.habitId },
        include: { entryType: { select: { slug: true } } },
      });
      info = {
        userId: entry.userId,
        kind: entry.entryType.slug === "habit_quantity" ? "QUANTITY" : "BOOLEAN",
      };
      entryInfo.set(row.habitId, info);
    }

    const completed = row.completed ?? false;
    const value = info.kind === "QUANTITY" ? (row.value ?? 0) : null;
    const payload =
      info.kind === "QUANTITY" ? JSON.stringify({ value: value ?? 0, completed }) : JSON.stringify({ completed });

    await db.entryEvent.create({
      data: {
        entryId: row.habitId,
        userId: info.userId,
        occurredAt: new Date(`${row.dateKey}T12:00:00.000Z`),
        dateKey: row.dateKey,
        payload,
        ...(value !== null ? { value } : {}),
        completed,
      },
    });
  }
}
