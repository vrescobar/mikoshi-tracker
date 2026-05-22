-- Drop legacy habit tables (idempotent — tables are absent when the
-- backfill migration was not applied; IF EXISTS makes this a no-op).
DROP TABLE IF EXISTS "_legacy_CircleHabitShare";
DROP TABLE IF EXISTS "_legacy_CheckInMutation";
DROP TABLE IF EXISTS "_legacy_HabitDayState";
DROP TABLE IF EXISTS "_legacy_HabitWeekday";
DROP TABLE IF EXISTS "_legacy_Habit";
