import type { FastifyInstance } from "fastify";
import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../generated/prisma/client";
import { createDb, type Db } from "../db/client";
import { runMigrations } from "../db/migrate";

declare module "fastify" {
  interface FastifyInstance {
    db: PrismaClient;
    /**
     * Native bun:sqlite layer that is progressively replacing Prisma. Both
     * point at the same SQLite file (WAL). Repositories are being migrated one
     * module at a time from `app.db` (Prisma) to `app.sqlite` (raw SQL + zod);
     * when the last module is converted, `db`/Prisma is removed.
     */
    sqlite: Db;
  }
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaLibSql({
    url: databaseUrl,
  });

  return new PrismaClient({ adapter });
}

export async function registerDb(app: FastifyInstance, prisma?: PrismaClient): Promise<void> {
  const db = prisma ?? createPrismaClient(app.env.DATABASE_URL);
  const ownsClient = prisma === undefined;

  app.decorate("db", db);

  // Native bun:sqlite handle on the same database file. Apply pending SQL
  // migrations (idempotent baseline adopts a Prisma-created DB as a no-op).
  const sqlite = createDb(app.env.DATABASE_URL);
  runMigrations(sqlite.raw);
  app.decorate("sqlite", sqlite);

  app.addHook("onClose", async () => {
    sqlite.close();
    if (ownsClient) {
      await db.$disconnect();
    }
  });
}
