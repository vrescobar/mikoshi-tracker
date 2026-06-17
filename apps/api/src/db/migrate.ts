import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** `apps/api/migrations` — sibling of `apps/api/src`. */
export const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "migrations");

/**
 * Minimal forward-only migration runner replacing `prisma migrate deploy`.
 * Applies every `*.sql` file in `dir` (lexically sorted) that has not yet been
 * recorded in the `_migrations` bookkeeping table, each in its own transaction.
 * Migrations must be idempotent-safe to author but are tracked so they only run
 * once. The baseline (`0001_baseline.sql`) uses `IF NOT EXISTS`, so adopting an
 * existing Prisma-created database is a no-op that simply records the baseline.
 *
 * Returns the names of the migrations applied in this call.
 */
export function runMigrations(db: Database, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(
    `CREATE TABLE IF NOT EXISTS "_migrations" (
       "name" TEXT PRIMARY KEY NOT NULL,
       "applied_at" TEXT NOT NULL DEFAULT (datetime('now'))
     );`,
  );

  const applied = new Set(
    (db.query(`SELECT name FROM "_migrations"`).all() as { name: string }[]).map((r) => r.name),
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.query(`INSERT INTO "_migrations" ("name") VALUES (?)`).run(file);
    })();
    ran.push(file);
  }
  return ran;
}
