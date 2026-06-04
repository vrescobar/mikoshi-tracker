# Migrations notes

## The two-phase legacy-habit drop (May 2026)

Dropping the legacy `Habit*` tables was split across three migrations on purpose:

1. `20260522160000_drop_legacy_habit_tables` — an early, **guarded** drop
   (`DROP TABLE IF EXISTS ...`). On databases provisioned after the generic
   `Entry` model landed, the legacy tables never existed, so this is a no-op
   there. It exists so older databases that still had the tables get them
   removed in the same release train.
2. `20260523100000_backfill_habits_to_entries` — copies any remaining legacy
   habit rows into the generic `Entry` / `EntryEvent` model **before** the real
   drop, so no data is lost on databases that did still have habits.
3. `20260523120000_drop_legacy_habit_tables_real` — the actual, unconditional
   drop plus the `Attachment` table rebuild that depended on it.

The split keeps each migration reversible-by-inspection and lets the backfill
sit safely between the guarded and unconditional drops. Do not collapse them
retroactively — they have already shipped and are recorded in `_prisma_migrations`.
