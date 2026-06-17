/**
 * Apply pending SQL migrations to the configured database. Replaces
 * `prisma migrate deploy`. Run with `DATABASE_URL=file:/abs/path bun run db:migrate`.
 */
import { createDatabase } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDatabase(url);
const applied = runMigrations(db);
db.close();
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No pending migrations.");
