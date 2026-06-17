import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  backfillHabitsToEntries,
  verifyBackfill,
} from "../../src/modules/entry-types/backfill";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

/**
 * Backfill test (tarea 40). Seeds the legacy Habit* tables via raw SQL — NOT the
 * Prisma client — so this stays compilable after tarea 43 removes the legacy
 * models from the schema. Asserts the additive, idempotent, ID-preserving copy.
 */

// `CREATE TABLE IF NOT EXISTS` so this works both while the legacy tables still
// exist in the schema (tarea 40) and after they are dropped (tarea 43).
const LEGACY_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "Habit" (
     "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
     "name" TEXT NOT NULL, "description" TEXT, "category" TEXT, "frequencyType" TEXT NOT NULL,
     "frequencyCount" INTEGER, "targetValue" INTEGER, "unit" TEXT, "startDate" TEXT NOT NULL,
     "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "HabitWeekday" (
     "id" TEXT NOT NULL PRIMARY KEY, "habitId" TEXT NOT NULL, "day" TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "HabitDayState" (
     "id" TEXT NOT NULL PRIMARY KEY, "habitId" TEXT NOT NULL, "dateKey" TEXT NOT NULL,
     "value" INTEGER, "completed" BOOLEAN NOT NULL DEFAULT false,
     "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "CheckInMutation" (
     "id" TEXT NOT NULL PRIMARY KEY, "habitId" TEXT NOT NULL, "dayStateId" TEXT NOT NULL,
     "dateKey" TEXT NOT NULL, "type" TEXT NOT NULL, "source" TEXT NOT NULL, "note" TEXT,
     "previousValue" INTEGER, "nextValue" INTEGER, "previousCompleted" BOOLEAN NOT NULL,
     "nextCompleted" BOOLEAN NOT NULL, "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "CircleHabitShare" (
     "id" TEXT NOT NULL PRIMARY KEY, "circleId" TEXT NOT NULL, "habitId" TEXT NOT NULL,
     "createdAt" DATETIME NOT NULL)`,
];

const T1 = "2026-05-20T10:00:00.000Z";
const T2 = "2026-05-20T11:00:00.000Z";
const DAY = "2026-05-20";

async function seedLegacy(ctx: TestContext, userId: string, circleId: string): Promise<void> {
  const db = ctx.app.db;
  for (const ddl of LEGACY_DDL) {
    await db.$executeRawUnsafe(ddl);
  }

  // BOOLEAN habit on weekdays Monday + Friday, completed once then undone.
  await db.$executeRawUnsafe(
    `INSERT INTO "Habit" ("id","userId","kind","name","description","category","frequencyType","frequencyCount","targetValue","unit","startDate","isActive","createdAt","updatedAt")
     VALUES ('h_bool', ?, 'BOOLEAN', 'Meditate', NULL, 'mind', 'weekdays', NULL, NULL, NULL, '2026-05-01', 1, ?, ?)`,
    userId,
    T1,
    T1,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "HabitWeekday" ("id","habitId","day") VALUES ('hw_mon','h_bool','MONDAY'), ('hw_fri','h_bool','FRIDAY')`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "HabitDayState" ("id","habitId","dateKey","value","completed","createdAt","updatedAt")
     VALUES ('s_bool','h_bool',?,NULL,0,?,?)`,
    DAY,
    T1,
    T2,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "CheckInMutation" ("id","habitId","dayStateId","dateKey","type","source","note","previousValue","nextValue","previousCompleted","nextCompleted","createdAt","updatedAt")
     VALUES ('m1','h_bool','s_bool',?,'COMPLETE','WEB',NULL,NULL,NULL,0,1,?,?)`,
    DAY,
    T1,
    T1,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "CheckInMutation" ("id","habitId","dayStateId","dateKey","type","source","note","previousValue","nextValue","previousCompleted","nextCompleted","createdAt","updatedAt")
     VALUES ('m2','h_bool','s_bool',?,'UNDO','WEB',NULL,NULL,NULL,1,0,?,?)`,
    DAY,
    T2,
    T2,
  );

  // QUANTITY habit, target 10, set to 5 (web) then 7 (circle).
  await db.$executeRawUnsafe(
    `INSERT INTO "Habit" ("id","userId","kind","name","description","category","frequencyType","frequencyCount","targetValue","unit","startDate","isActive","createdAt","updatedAt")
     VALUES ('h_qty', ?, 'QUANTITY', 'Read pages', NULL, NULL, 'daily', NULL, 10, 'pages', '2026-05-01', 1, ?, ?)`,
    userId,
    T1,
    T1,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "HabitDayState" ("id","habitId","dateKey","value","completed","createdAt","updatedAt")
     VALUES ('s_qty','h_qty',?,7,0,?,?)`,
    DAY,
    T1,
    T2,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "CheckInMutation" ("id","habitId","dayStateId","dateKey","type","source","note","previousValue","nextValue","previousCompleted","nextCompleted","createdAt","updatedAt")
     VALUES ('m3','h_qty','s_qty',?,'SET_TOTAL','WEB',NULL,0,5,0,0,?,?)`,
    DAY,
    T1,
    T1,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "CheckInMutation" ("id","habitId","dayStateId","dateKey","type","source","note","previousValue","nextValue","previousCompleted","nextCompleted","createdAt","updatedAt")
     VALUES ('m4','h_qty','s_qty',?,'SET_TOTAL','CIRCLE',NULL,5,7,0,0,?,?)`,
    DAY,
    T2,
    T2,
  );

  await db.$executeRawUnsafe(
    `INSERT INTO "CircleHabitShare" ("id","circleId","habitId","createdAt") VALUES ('chs1', ?, 'h_qty', ?)`,
    circleId,
    T1,
  );
}

async function legacyCount(ctx: TestContext, table: string): Promise<number> {
  const rows = await ctx.app.db.$queryRawUnsafe<Array<{ n: number | bigint }>>(
    `SELECT count(*) AS n FROM "${table}"`,
  );
  return Number(rows[0]?.n ?? 0);
}

describe("backfill Habit* -> Entry*", () => {
  let ctx: TestContext;
  let userId: string;
  let circleId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const { body } = await signUp(ctx.app);
    userId = body.user.id;
    const circle = await ctx.app.db.circle.create({
      data: { name: "Crew", ownerId: userId },
    });
    circleId = circle.id;
    await seedLegacy(ctx, userId, circleId);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("copies every legacy row with preserved IDs and matching counts", async () => {
    await backfillHabitsToEntries(ctx.app.sqlite);

    expect(await ctx.app.db.entry.count()).toBe(await legacyCount(ctx, "Habit"));
    expect(await ctx.app.db.entryWeekday.count()).toBe(await legacyCount(ctx, "HabitWeekday"));
    expect(await ctx.app.db.entryEvent.count()).toBe(await legacyCount(ctx, "HabitDayState"));
    expect(await ctx.app.db.eventMutation.count()).toBe(await legacyCount(ctx, "CheckInMutation"));
    expect(await ctx.app.db.circleEntryShare.count()).toBe(await legacyCount(ctx, "CircleHabitShare"));

    // IDs preserved 1:1.
    expect(await ctx.app.db.entry.findUnique({ where: { id: "h_bool" } })).not.toBeNull();
    expect(await ctx.app.db.entry.findUnique({ where: { id: "h_qty" } })).not.toBeNull();
    expect(await ctx.app.db.entryEvent.findUnique({ where: { id: "s_qty" } })).not.toBeNull();
    expect(await ctx.app.db.circleEntryShare.findUnique({ where: { id: "chs1" } })).not.toBeNull();
  });

  it("maps kind→slug and frequencyType→UPPERCASE config", async () => {
    await backfillHabitsToEntries(ctx.app.sqlite);

    const boolEntry = await ctx.app.db.entry.findUniqueOrThrow({
      where: { id: "h_bool" },
      include: { entryType: true, weekdays: true },
    });
    expect(boolEntry.entryType.slug).toBe("habit_boolean");
    expect(JSON.parse(boolEntry.config)).toEqual({ frequencyType: "WEEKDAYS", frequencyCount: null });
    // HabitWeekday MONDAY/FRIDAY → lowercase.
    expect(boolEntry.weekdays.map((w) => w.day).sort()).toEqual(["friday", "monday"]);

    const qtyEntry = await ctx.app.db.entry.findUniqueOrThrow({
      where: { id: "h_qty" },
      include: { entryType: true },
    });
    expect(qtyEntry.entryType.slug).toBe("habit_quantity");
    expect(JSON.parse(qtyEntry.config)).toEqual({
      frequencyType: "DAILY",
      frequencyCount: null,
      targetValue: 10,
      unit: "pages",
    });
  });

  it("builds JSON-boolean payloads and correct value/completed projections", async () => {
    await backfillHabitsToEntries(ctx.app.sqlite);

    const boolEvent = await ctx.app.db.entryEvent.findUniqueOrThrow({ where: { id: "s_bool" } });
    expect(JSON.parse(boolEvent.payload)).toEqual({ completed: false });
    expect(boolEvent.value).toBeNull();
    expect(boolEvent.completed).toBe(false);

    const qtyEvent = await ctx.app.db.entryEvent.findUniqueOrThrow({ where: { id: "s_qty" } });
    expect(JSON.parse(qtyEvent.payload)).toEqual({ value: 7, completed: false });
    expect(Number(qtyEvent.value)).toBe(7);
    expect(qtyEvent.completed).toBe(false);
  });

  it("maps mutation types/sources and reconstructs payload deltas", async () => {
    await backfillHabitsToEntries(ctx.app.sqlite);

    const m1 = await ctx.app.db.eventMutation.findUniqueOrThrow({ where: { id: "m1" } });
    expect(m1.type).toBe("CREATE");
    expect(m1.eventId).toBe("s_bool");
    expect(m1.previousPayload).toBeNull();
    expect(JSON.parse(m1.nextPayload ?? "null")).toEqual({ completed: true });

    const m2 = await ctx.app.db.eventMutation.findUniqueOrThrow({ where: { id: "m2" } });
    expect(m2.type).toBe("UNDO");
    expect(JSON.parse(m2.nextPayload ?? "null")).toEqual({ completed: false });

    const m3 = await ctx.app.db.eventMutation.findUniqueOrThrow({ where: { id: "m3" } });
    expect(m3.type).toBe("CREATE");
    expect(m3.previousPayload).toBeNull();

    // CIRCLE source preserved (required by §C14.9 undo gate); not the earliest → UPDATE.
    const m4 = await ctx.app.db.eventMutation.findUniqueOrThrow({ where: { id: "m4" } });
    expect(m4.type).toBe("UPDATE");
    expect(m4.source).toBe("CIRCLE");
    expect(JSON.parse(m4.previousPayload ?? "null")).toEqual({ value: 5, completed: false });
    expect(JSON.parse(m4.nextPayload ?? "null")).toEqual({ value: 7, completed: false });
  });

  it("is idempotent — running twice inserts no duplicates", async () => {
    await backfillHabitsToEntries(ctx.app.sqlite);
    await backfillHabitsToEntries(ctx.app.sqlite);

    expect(await ctx.app.db.entry.count()).toBe(2);
    expect(await ctx.app.db.entryWeekday.count()).toBe(2);
    expect(await ctx.app.db.entryEvent.count()).toBe(2);
    expect(await ctx.app.db.eventMutation.count()).toBe(4);
    expect(await ctx.app.db.circleEntryShare.count()).toBe(1);
  });

  it("verify guard aborts when a copied row is missing", async () => {
    await backfillHabitsToEntries(ctx.app.sqlite);
    // Corrupt the destination so counts diverge.
    await ctx.app.db.entryEvent.delete({ where: { id: "s_qty" } });
    await expect(verifyBackfill(ctx.app.sqlite)).rejects.toThrow();
  });
});
