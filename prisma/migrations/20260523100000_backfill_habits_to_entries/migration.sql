-- Backfill of legacy Habit* data into the generic Entry* engine (GOAL.md §G9 step 1).
-- Additive, idempotent, ID-preserving 1:1. Legacy tables are NOT renamed or dropped here
-- (the real drop happens in a later migration). This file is the verbatim production twin of
-- apps/api/src/modules/entry-types/backfill.ts (tests run on `prisma db push`, never on this SQL).

-- Ensure the two habit EntryType rows exist (self-sufficient; no-op when already seeded).
INSERT OR IGNORE INTO "EntryType" ("id","slug","displayName","cadence","payloadSchema","configSchema","aggregations","skillSlug","isBuiltIn","isActive","createdAt","updatedAt") VALUES
  ('builtin_habit_boolean_0001','habit_boolean','entry_type.habit_boolean','recurring','{"type":"object","required":["completed"],"properties":{"completed":{"type":"boolean"}},"additionalProperties":false}','{"type":"object","required":["frequencyType"],"properties":{"frequencyType":{"type":"string","enum":["DAILY","WEEKDAYS","WEEKLY_COUNT","MONTHLY_COUNT"]},"frequencyCount":{"type":"integer","minimum":1,"nullable":true}},"additionalProperties":false}','{"metrics":["completion_rate","streak"],"windows":["7d","30d"]}',NULL,1,1,'2026-05-21T00:00:00.000Z','2026-05-21T00:00:00.000Z');
INSERT OR IGNORE INTO "EntryType" ("id","slug","displayName","cadence","payloadSchema","configSchema","aggregations","skillSlug","isBuiltIn","isActive","createdAt","updatedAt") VALUES
  ('builtin_habit_quantity_001','habit_quantity','entry_type.habit_quantity','recurring','{"type":"object","required":["value","completed"],"properties":{"value":{"type":"number","minimum":0},"completed":{"type":"boolean"}},"additionalProperties":false}','{"type":"object","required":["frequencyType","targetValue"],"properties":{"frequencyType":{"type":"string","enum":["DAILY","WEEKDAYS","WEEKLY_COUNT","MONTHLY_COUNT"]},"frequencyCount":{"type":"integer","minimum":1,"nullable":true},"targetValue":{"type":"number","minimum":0},"unit":{"type":"string","nullable":true}},"additionalProperties":false}','{"metrics":["completion_rate","streak","sum"],"sumFields":["value"],"groupBy":["day","week","month"]}',NULL,1,1,'2026-05-21T00:00:00.000Z','2026-05-21T00:00:00.000Z');

-- Habit → Entry (frequencyType lowercase → UPPERCASE config enum; targetValue coalesced).
INSERT INTO "Entry" ("id","userId","entryTypeId","name","description","category","config","startDate","isActive","createdAt","updatedAt")
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
WHERE NOT EXISTS (SELECT 1 FROM "Entry" e WHERE e."id" = h."id");

-- HabitWeekday → EntryWeekday (UPPERCASE day → lowercase).
INSERT INTO "EntryWeekday" ("id","entryId","day")
SELECT hw."id", hw."habitId", lower(hw."day")
FROM "HabitWeekday" hw
WHERE NOT EXISTS (SELECT 1 FROM "EntryWeekday" ew WHERE ew."id" = hw."id");

-- HabitDayState → EntryEvent (occurredAt := createdAt; kcal_cached omitted — STORED generated column).
INSERT INTO "EntryEvent" ("id","entryId","userId","occurredAt","dateKey","payload","value","completed","createdAt","updatedAt")
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
WHERE NOT EXISTS (SELECT 1 FROM "EntryEvent" ev WHERE ev."id" = s."id");

-- CheckInMutation → EventMutation (earliest per dayState → CREATE; UNDO → UNDO; rest → UPDATE;
-- source incl. CIRCLE preserved; previous/nextPayload reconstructed by kind).
INSERT INTO "EventMutation" ("id","entryId","eventId","userId","dateKey","type","source","note","previousPayload","nextPayload","createdAt")
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
WHERE NOT EXISTS (SELECT 1 FROM "EventMutation" em WHERE em."id" = cm."id");

-- CircleHabitShare → CircleEntryShare.
INSERT INTO "CircleEntryShare" ("id","circleId","entryId","createdAt")
SELECT chs."id", chs."circleId", chs."habitId", chs."createdAt"
FROM "CircleHabitShare" chs
WHERE NOT EXISTS (SELECT 1 FROM "CircleEntryShare" ces WHERE ces."id" = chs."id");

-- Row-count parity guard. IDs are preserved 1:1, so a join-count equal to the source count
-- means every row copied. A divergence makes CHECK(ok=1) fail and aborts the migration.
DROP TABLE IF EXISTS "_backfill_assert";
CREATE TEMP TABLE "_backfill_assert" ("ok" INTEGER NOT NULL CHECK ("ok" = 1));
INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN (SELECT count(*) FROM "Habit") = (SELECT count(*) FROM "Entry" e WHERE EXISTS (SELECT 1 FROM "Habit" h WHERE h."id" = e."id")) THEN 1 ELSE 0 END;
INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN (SELECT count(*) FROM "HabitWeekday") = (SELECT count(*) FROM "EntryWeekday" ew WHERE EXISTS (SELECT 1 FROM "HabitWeekday" hw WHERE hw."id" = ew."id")) THEN 1 ELSE 0 END;
INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN (SELECT count(*) FROM "HabitDayState") = (SELECT count(*) FROM "EntryEvent" ev WHERE EXISTS (SELECT 1 FROM "HabitDayState" s WHERE s."id" = ev."id")) THEN 1 ELSE 0 END;
INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN (SELECT count(*) FROM "CheckInMutation") = (SELECT count(*) FROM "EventMutation" em WHERE EXISTS (SELECT 1 FROM "CheckInMutation" cm WHERE cm."id" = em."id")) THEN 1 ELSE 0 END;
INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN (SELECT count(*) FROM "CircleHabitShare") = (SELECT count(*) FROM "CircleEntryShare" ces WHERE EXISTS (SELECT 1 FROM "CircleHabitShare" chs WHERE chs."id" = ces."id")) THEN 1 ELSE 0 END;
INSERT INTO "_backfill_assert" ("ok") SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM "EntryEvent" ev JOIN "Entry" e ON e."id" = ev."entryId" JOIN "EntryType" et ON et."id" = e."entryTypeId" WHERE et."slug" = 'habit_quantity' AND ev."value" IS NULL) THEN 1 ELSE 0 END;
DROP TABLE "_backfill_assert";
