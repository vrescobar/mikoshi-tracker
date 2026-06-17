import type { FastifyInstance } from "fastify";

import { createDb, type Db } from "../db/client";
import { runMigrations } from "../db/migrate";

declare module "fastify" {
  interface FastifyInstance {
    /** Native bun:sqlite data layer. */
    sqlite: Db;
  }
}

export async function registerDb(app: FastifyInstance): Promise<void> {
  const sqlite = createDb(app.env.DATABASE_URL);
  // Apply pending SQL migrations (idempotent baseline adopts an existing DB).
  runMigrations(sqlite.raw);
  app.decorate("sqlite", sqlite);

  app.addHook("onClose", async () => {
    sqlite.close();
  });
}
