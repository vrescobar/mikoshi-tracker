import type { Database } from "bun:sqlite";
import type { FastifyInstance } from "fastify";
import { betterAuth } from "better-auth";

import type { AppEnv } from "../plugins/env";

/**
 * better-auth on the native bun:sqlite handle (the same DB file the app uses).
 * Passing a bun:sqlite `Database` makes better-auth use its BunSqliteDialect via
 * Kysely. Our tables were created PascalCase (by the original Prisma schema), so
 * each model is mapped to its existing table name; the column names already
 * match better-auth's camelCase defaults.
 */
export function createAuth(env: AppEnv, database: Database) {
  return betterAuth({
    appName: "mikoshi-tracker",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.corsOrigins,
    database,
    emailAndPassword: {
      enabled: true,
    },
    user: { modelName: "User" },
    session: { modelName: "Session" },
    account: { modelName: "Account" },
    verification: { modelName: "Verification" },
  });
}

export type AppAuth = ReturnType<typeof createAuth>;

declare module "fastify" {
  interface FastifyInstance {
    auth: AppAuth;
  }
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorate("auth", createAuth(app.env, app.sqlite.raw));
}
