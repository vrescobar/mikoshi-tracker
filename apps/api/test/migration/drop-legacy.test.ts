import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../helpers/test-db";

const LEGACY_TABLES = [
  "_legacy_Habit",
  "_legacy_HabitWeekday",
  "_legacy_HabitDayState",
  "_legacy_CheckInMutation",
  "_legacy_CircleHabitShare",
] as const;

function findDropMigrationSql(): string | null {
  const migrationsDir = join(REPO_ROOT, "prisma", "migrations");
  const dirs = readdirSync(migrationsDir);
  const dropDir = dirs.find((d) => d.includes("drop_legacy_habit_tables"));
  if (!dropDir) return null;
  return readFileSync(join(migrationsDir, dropDir, "migration.sql"), "utf-8");
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

describe("drop_legacy_habit_tables migration", () => {
  it("migration SQL drops all five legacy tables with IF EXISTS", () => {
    const sql = findDropMigrationSql();
    expect(sql, "drop_legacy_habit_tables migration not found").not.toBeNull();
    for (const table of LEGACY_TABLES) {
      expect(sql!, `migration missing DROP TABLE IF EXISTS for "${table}"`).toContain(
        `DROP TABLE IF EXISTS "${table}"`,
      );
    }
  });

  it("prisma/schema.prisma defines no _legacy_ models", () => {
    const schema = readFileSync(join(REPO_ROOT, "prisma", "schema.prisma"), "utf-8");
    for (const table of LEGACY_TABLES) {
      const escaped = table.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
      expect(schema, `schema still defines model ${table}`).not.toMatch(
        new RegExp(`^model\\s+${escaped}\\s*\\{`, "m"),
      );
    }
  });

  it("no TypeScript source file references any _legacy_ model name", () => {
    // Scan apps/api/src (excluding generated/) and packages/ only —
    // NOT prisma/migrations (SQL files) or apps/api/test (this file).
    const tsFiles = [
      ...walkTs(join(REPO_ROOT, "apps", "api", "src")),
      ...walkTs(join(REPO_ROOT, "packages")),
    ];
    const legacyRe = new RegExp(LEGACY_TABLES.join("|"));
    for (const file of tsFiles) {
      const content = readFileSync(file, "utf-8");
      expect(
        legacyRe.test(content),
        `${file} still references a _legacy_ model`,
      ).toBe(false);
    }
  });
});
