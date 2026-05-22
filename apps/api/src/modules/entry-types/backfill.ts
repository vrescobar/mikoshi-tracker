import type { PrismaClient } from "../../generated/prisma/client";

/**
 * Backfill of the legacy Habit* tables into the generic Entry* engine
 * (Phase 12, GOAL.md §G9 step 1).
 *
 * Design constraints (see plan "Unificación legacy→engine", tarea 40):
 *  - **Additive & non-destructive**: copies rows; never renames or drops the
 *    legacy tables (the real drop happens in a later migration, tarea 43).
 *  - **Idempotent**: every copy is guarded by `WHERE NOT EXISTS (… id = src.id)`
 *    so re-running inserts zero rows.
 *  - **ID-preserving 1:1**: `Entry.id := Habit.id`, `EntryEvent.id :=
 *    HabitDayState.id`, `EventMutation.id := CheckInMutation.id`,
 *    `CircleEntryShare.id/entryId := CircleHabitShare.id/habitId`. This makes
 *    the idempotency guard and the row-count verify trivially correct, and lets
 *    the circle `{habitId}` alias (tarea 42) be a pure pass-through.
 *
 * Field transforms that matter:
 *  - `Habit.kind` ('BOOLEAN'|'QUANTITY') → EntryType slug (resolved by slug, never
 *    by a hardcoded id, so it works under both the migration-seeded `builtin_*`
 *    ids and the test `db push` cuids).
 *  - `Habit.frequencyType` is stored lowercase ('daily'…); the entry config schema
 *    enum is UPPERCASE ('DAILY'…) → `upper()`.
 *  - `HabitWeekday.day` is stored UPPERCASE ('MONDAY'); `EntryWeekday.day` is
 *    lowercase ('monday') → `lower()`.
 *  - payload booleans must be real JSON booleans (`json('true')`), not 0/1, so
 *    `extractProjections`/AJV accept them.
 *  - `EntryEvent.kcal_cached` is a STORED generated column in production, so it
 *    is intentionally absent from the INSERT column list (auto-computed; null
 *    for habits).
 *
 * The SQL here is the source of truth; the production migration
 * `*_backfill_habits_to_entries/migration.sql` is a verbatim copy (tests run on
 * `prisma db push`, never on migration SQL, so this twin gives test coverage).
 */

/** Ensure the two habit EntryType rows exist (self-sufficient; no-op in prod). */
const ENTRY_TYPE_SEED_STATEMENTS: string[] = [
  `INSERT OR IGNORE INTO "EntryType" ("id","slug","displayName","cadence","payloadSchema","configSchema","aggregations","skillSlug","isBuiltIn","isActive","createdAt","updatedAt") VALUES
    ('builtin_habit_boolean_0001','habit_boolean','entry_type.habit_boolean','recurring','{"type":"object","required":["completed"],"properties":{"completed":{"type":"boolean"}},"additionalProperties":false}','{"type":"object","required":["frequencyType"],"properties":{"frequencyType":{"type":"string","enum":["DAILY","WEEKDAYS","WEEKLY_COUNT","MONTHLY_COUNT"]},"frequencyCount":{"type":"integer","minimum":1,"nullable":true}},"additionalProperties":false}','{"metrics":["completion_rate","streak"],"windows":["7d","30d"]}',NULL,1,1,'2026-05-21T00:00:00.000Z','2026-05-21T00:00:00.000Z')`,
  `INSERT OR IGNORE INTO "EntryType" ("id","slug","displayName","cadence","payloadSchema","configSchema","aggregations","skillSlug","isBuiltIn","isActive","createdAt","updatedAt") VALUES
    ('builtin_habit_quantity_001','habit_quantity','entry_type.habit_quantity','recurring','{"type":"object","required":["value","completed"],"properties":{"value":{"type":"number","minimum":0},"completed":{"type":"boolean"}},"additionalProperties":false}','{"type":"object","required":["frequencyType","targetValue"],"properties":{"frequencyType":{"type":"string","enum":["DAILY","WEEKDAYS","WEEKLY_COUNT","MONTHLY_COUNT"]},"frequencyCount":{"type":"integer","minimum":1,"nullable":true},"targetValue":{"type":"number","minimum":0},"unit":{"type":"string","nullable":true}},"additionalProperties":false}','{"metrics":["completion_rate","streak","sum"],"sumFields":["value"],"groupBy":["day","week","month"]}',NULL,1,1,'2026-05-21T00:00:00.000Z','2026-05-21T00:00:00.000Z')`,
];

/** Copy legacy rows into the generic tables (FK-safe order). */
const COPY_STATEMENTS: string[] = [
  // Habit → Entry
  `INSERT INTO "Entry" ("id","userId","entryTypeId","name","description","category","config","startDate","isActive","createdAt","updatedAt")
   SELECT
     h."id", h."userId",
     (SELECT et."id" FROM "EntryType" et WHERE et."slug" = CASE h."kind" WHEN 'BOOLEAN' THEN 'habit_boolean' ELSE 'habit_quantity' END),
     h."name", h."description", h."category",
     CASE h."kind"
       WHEN 'BOOLEAN' THEN json_object('frequencyType', upper(h."frequencyType"), 'frequencyCount', h."frequencyCount")
       ELSE json_object('frequencyType', upper(h."frequencyType"), 'frequencyCount', h."frequencyCount", 'targetValue', coalesce(h."targetValue", 0), 'unit', h."unit")
     END,
     h."startDate", h."isActive", h."createdAt", h."updatedAt"
   FROM "Habit" h
   WHERE NOT EXISTS (SELECT 1 FROM "Entry" e WHERE e."id" = h."id")`,

  // HabitWeekday → EntryWeekday (UPPERCASE day → lowercase)
  `INSERT INTO "EntryWeekday" ("id","entryId","day")
   SELECT hw."id", hw."habitId", lower(hw."day")
   FROM "HabitWeekday" hw
   WHERE NOT EXISTS (SELECT 1 FROM "EntryWeekday" ew WHERE ew."id" = hw."id")`,

  // HabitDayState → EntryEvent (occurredAt := createdAt; kcal_cached omitted)
  `INSERT INTO "EntryEvent" ("id","entryId","userId","occurredAt","dateKey","payload","value","completed","createdAt","updatedAt")
   SELECT
     s."id", s."habitId", h."userId", s."createdAt", s."dateKey",
     CASE h."kind"
       WHEN 'BOOLEAN' THEN json_object('completed', json(CASE WHEN s."completed" THEN 'true' ELSE 'false' END))
       ELSE json_object('value', coalesce(s."value", 0), 'completed', json(CASE WHEN s."completed" THEN 'true' ELSE 'false' END))
     END,
     CASE h."kind" WHEN 'QUANTITY' THEN coalesce(s."value", 0) ELSE NULL END,
     s."completed", s."createdAt", s."updatedAt"
   FROM "HabitDayState" s
   JOIN "Habit" h ON h."id" = s."habitId"
   WHERE NOT EXISTS (SELECT 1 FROM "EntryEvent" ev WHERE ev."id" = s."id")`,

  // CheckInMutation → EventMutation
  //  type: UNDO→UNDO; earliest mutation per dayState→CREATE; rest→UPDATE.
  //  source: WEB/AI/SYSTEM/CIRCLE preserved verbatim (CIRCLE needed by §C14.9 undo gate).
  //  previous/nextPayload reconstructed from previous/next value+completed by kind;
  //  previousPayload is NULL on the CREATE to match generic semantics.
  `INSERT INTO "EventMutation" ("id","entryId","eventId","userId","dateKey","type","source","note","previousPayload","nextPayload","createdAt")
   SELECT
     cm."id", cm."habitId", cm."dayStateId", h."userId", cm."dateKey",
     CASE
       WHEN cm."type" = 'UNDO' THEN 'UNDO'
       WHEN cm."id" = (SELECT x."id" FROM "CheckInMutation" x WHERE x."dayStateId" = cm."dayStateId" ORDER BY x."createdAt" ASC, x."id" ASC LIMIT 1) THEN 'CREATE'
       ELSE 'UPDATE'
     END,
     cm."source", cm."note",
     CASE
       WHEN cm."id" = (SELECT x."id" FROM "CheckInMutation" x WHERE x."dayStateId" = cm."dayStateId" ORDER BY x."createdAt" ASC, x."id" ASC LIMIT 1) THEN NULL
       WHEN h."kind" = 'BOOLEAN' THEN json_object('completed', json(CASE WHEN cm."previousCompleted" THEN 'true' ELSE 'false' END))
       ELSE json_object('value', coalesce(cm."previousValue", 0), 'completed', json(CASE WHEN cm."previousCompleted" THEN 'true' ELSE 'false' END))
     END,
     CASE
       WHEN h."kind" = 'BOOLEAN' THEN json_object('completed', json(CASE WHEN cm."nextCompleted" THEN 'true' ELSE 'false' END))
       ELSE json_object('value', coalesce(cm."nextValue", 0), 'completed', json(CASE WHEN cm."nextCompleted" THEN 'true' ELSE 'false' END))
     END,
     cm."createdAt"
   FROM "CheckInMutation" cm
   JOIN "Habit" h ON h."id" = cm."habitId"
   WHERE NOT EXISTS (SELECT 1 FROM "EventMutation" em WHERE em."id" = cm."id")`,

  // CircleHabitShare → CircleEntryShare
  `INSERT INTO "CircleEntryShare" ("id","circleId","entryId","createdAt")
   SELECT chs."id", chs."circleId", chs."habitId", chs."createdAt"
   FROM "CircleHabitShare" chs
   WHERE NOT EXISTS (SELECT 1 FROM "CircleEntryShare" ces WHERE ces."id" = chs."id")`,
];

/**
 * Row-count parity guard. Because IDs are preserved 1:1, a join-count equal to
 * the source count means every row copied. A divergence makes the CHECK(ok=1)
 * fail, aborting the migration/transaction. SQLite's RAISE() is trigger-only,
 * so a CHECK-constrained temp table is the portable way to abort from raw SQL.
 */
const VERIFY_STATEMENTS: string[] = [
  // Drop first so a previous aborted run (temp tables are connection-scoped) can't
  // collide on CREATE.
  `DROP TABLE IF EXISTS "_backfill_assert"`,
  `CREATE TEMP TABLE "_backfill_assert" ("ok" INTEGER NOT NULL CHECK ("ok" = 1))`,
  `INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN (SELECT count(*) FROM "Habit") = (SELECT count(*) FROM "Entry" e WHERE EXISTS (SELECT 1 FROM "Habit" h WHERE h."id" = e."id")) THEN 1 ELSE 0 END`,
  `INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN (SELECT count(*) FROM "HabitWeekday") = (SELECT count(*) FROM "EntryWeekday" ew WHERE EXISTS (SELECT 1 FROM "HabitWeekday" hw WHERE hw."id" = ew."id")) THEN 1 ELSE 0 END`,
  `INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN (SELECT count(*) FROM "HabitDayState") = (SELECT count(*) FROM "EntryEvent" ev WHERE EXISTS (SELECT 1 FROM "HabitDayState" s WHERE s."id" = ev."id")) THEN 1 ELSE 0 END`,
  `INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN (SELECT count(*) FROM "CheckInMutation") = (SELECT count(*) FROM "EventMutation" em WHERE EXISTS (SELECT 1 FROM "CheckInMutation" cm WHERE cm."id" = em."id")) THEN 1 ELSE 0 END`,
  `INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN (SELECT count(*) FROM "CircleHabitShare") = (SELECT count(*) FROM "CircleEntryShare" ces WHERE EXISTS (SELECT 1 FROM "CircleHabitShare" chs WHERE chs."id" = ces."id")) THEN 1 ELSE 0 END`,
  // No backfilled QUANTITY event may carry a NULL projected value.
  `INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM "EntryEvent" ev JOIN "Entry" e ON e."id" = ev."entryId" JOIN "EntryType" et ON et."id" = e."entryTypeId" WHERE et."slug" = 'habit_quantity' AND ev."value" IS NULL) THEN 1 ELSE 0 END`,
  `DROP TABLE "_backfill_assert"`,
];

/** All statements in execution order, also embedded verbatim in the migration. */
export const BACKFILL_STATEMENTS: string[] = [
  ...ENTRY_TYPE_SEED_STATEMENTS,
  ...COPY_STATEMENTS,
  ...VERIFY_STATEMENTS,
];

/** TS twin of the production migration; runs each statement in order. */
export async function backfillHabitsToEntries(db: PrismaClient): Promise<void> {
  for (const statement of BACKFILL_STATEMENTS) {
    await db.$executeRawUnsafe(statement);
  }
}

/**
 * Run only the row-count parity guard. Throws (CHECK constraint failed) if any
 * legacy table diverges from its generic copy. Exposed for tests; the production
 * migration runs these statements inline as part of the backfill.
 */
export async function verifyBackfill(db: PrismaClient): Promise<void> {
  for (const statement of VERIFY_STATEMENTS) {
    await db.$executeRawUnsafe(statement);
  }
}
