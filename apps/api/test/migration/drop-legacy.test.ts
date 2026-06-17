import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

import { REPO_ROOT } from "../helpers/test-db";

// Two-stage drop of the legacy Habit* schema:
//  - The original `20260522160000_drop_legacy_habit_tables` migration was a no-op
//    (it dropped `_legacy_*` tables that never existed because task 40's original
//    rename approach was skipped).
//  - `20260523120000_drop_legacy_habit_tables_real` (this milestone) drops the
//    real Habit/HabitWeekday/HabitDayState/CheckInMutation/CircleHabitShare tables
//    after the unification (tareas 41/42) moved everything to the Entry engine.
const REAL_LEGACY_TABLES = [
  "Habit",
  "HabitWeekday",
  "HabitDayState",
  "CheckInMutation",
  "CircleHabitShare",
] as const;

// Also assert the original no-op migration is still in place (immutable, applied).
const LEGACY_RENAME_PLACEHOLDER_TABLES = [
  "_legacy_Habit",
  "_legacy_HabitWeekday",
  "_legacy_HabitDayState",
  "_legacy_CheckInMutation",
  "_legacy_CircleHabitShare",
] as const;

function findMigrationSql(includes: string): string | null {
  const migrationsDir = join(REPO_ROOT, "prisma", "migrations");
  const dirs = readdirSync(migrationsDir);
  const dir = dirs.find((d) => d.includes(includes));
  if (!dir) return null;
  return readFileSync(join(migrationsDir, dir, "migration.sql"), "utf-8");
}

function walkTs(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "generated") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...walkTs(full));
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

describe("drop_legacy_habit_tables (placeholder, immutable)", () => {
  it("drops all five _legacy_* tables with IF EXISTS (kept as a no-op for history)", () => {
    const sql = findMigrationSql("drop_legacy_habit_tables") ?? "";
    // Find the original (NOT *_real) migration.
    const placeholder = findMigrationSql("20260522160000_drop_legacy_habit_tables") ?? sql;
    for (const table of LEGACY_RENAME_PLACEHOLDER_TABLES) {
      expect(placeholder, `placeholder migration missing DROP TABLE IF EXISTS for "${table}"`).toContain(
        `DROP TABLE IF EXISTS "${table}"`,
      );
    }
  });
});

describe("drop_legacy_habit_tables_real migration", () => {
  it("drops every real legacy table and rebuilds Attachment without mutationId", () => {
    const sql = findMigrationSql("drop_legacy_habit_tables_real");
    expect(sql, "drop_legacy_habit_tables_real migration not found").not.toBeNull();
    for (const table of REAL_LEGACY_TABLES) {
      expect(sql!, `migration missing DROP TABLE IF EXISTS for "${table}"`).toContain(
        `DROP TABLE IF EXISTS "${table}"`,
      );
    }
    // Attachment must be rebuilt without the legacy mutationId column.
    expect(sql!, "migration must rebuild Attachment table").toMatch(/CREATE TABLE "new_Attachment"/);
    expect(sql!, "rebuilt Attachment must not declare a mutationId column").not.toMatch(/"mutationId"/);
  });
});

describe("prisma/schema.prisma — legacy models removed", () => {
  it("defines no Habit*/CheckInMutation/CircleHabitShare models", () => {
    const schema = readFileSync(join(REPO_ROOT, "prisma", "schema.prisma"), "utf-8");
    for (const table of REAL_LEGACY_TABLES) {
      expect(schema, `schema still defines model ${table}`).not.toMatch(
        new RegExp(`^model\\s+${table}\\s*\\{`, "m"),
      );
    }
  });

  it("Attachment has no legacy mutationId field", () => {
    const schema = readFileSync(join(REPO_ROOT, "prisma", "schema.prisma"), "utf-8");
    // The model block for Attachment.
    const match = schema.match(/model Attachment \{[\s\S]*?\n\}/);
    expect(match, "Attachment model not found").not.toBeNull();
    expect(match![0]).not.toMatch(/^\s*mutationId\s+/m);
    expect(match![0]).not.toMatch(/CheckInMutation/);
  });
});

describe("no Prisma client calls hit removed legacy models", () => {
  it("apps/api/src and packages/ make no db.habit / db.habitDayState / db.checkInMutation / db.circleHabitShare / db.habitWeekday calls", () => {
    const tsFiles = [
      ...walkTs(join(REPO_ROOT, "apps", "api", "src")),
      ...walkTs(join(REPO_ROOT, "packages")),
    ];
    // Only flag Prisma client method calls — type-checking already gates broader
    // identifier usage, and the legacy names live on in comments/JSDoc/unrelated
    // contract domain types (e.g. today-clock's `HabitWeekday` type alias for
    // "monday"|…|"sunday", which is part of the API contract, not a Prisma model).
    // Multi-word identifiers are unambiguous as Prisma model accessors; for the bare
    // singular `habit` we additionally require a db client prefix so we don't flag
    // legitimate `.habit` property accesses on share/checkin objects.
    const bannedMultiWord = /\.(?:habitWeekday|habitDayState|checkInMutation|circleHabitShare)\.\w/;
    const bannedHabitCall = /\b(?:db|tx)\.habit\.\w/;
    for (const file of tsFiles) {
      const content = readFileSync(file, "utf-8");
      expect(
        bannedMultiWord.test(content) || bannedHabitCall.test(content),
        `${file} still calls a removed Prisma model`,
      ).toBe(false);
    }
  });
});
