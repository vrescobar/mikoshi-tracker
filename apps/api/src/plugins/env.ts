import { resolve } from "node:path";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

const DEFAULT_CORS_ORIGIN = "http://localhost:3000";
const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  APP_BASE_URL: optionalUrl,
  BETTER_AUTH_URL: optionalUrl,
  CORS_ORIGIN: optionalString,
  ATTACHMENTS_DIR: optionalString,
  /**
   * Base URL of the Mikoshi Platform API on the private plane (e.g.
   * "http://127.0.0.1:7777/api/platform/v1"). Optional: when unset, roster
   * pulls (story 51) and identity lookups are silently skipped — the push
   * webhook and provision hints still work.
   */
  MIKOSHI_PLATFORM_API_URL: optionalUrl,
});

export type AppEnv = ReturnType<typeof createEnv>;

declare module "fastify" {
  interface FastifyInstance {
    env: AppEnv;
  }
}

export function createEnv(source: NodeJS.ProcessEnv): {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CORS_ORIGIN: string;
  corsOrigins: string[];
  ATTACHMENTS_DIR: string;
  MIKOSHI_PLATFORM_API_URL: string | null;
} {
  const parsed = rawEnvSchema.parse(source);
  const betterAuthUrl = parsed.BETTER_AUTH_URL ?? parsed.APP_BASE_URL;

  if (!betterAuthUrl) {
    throw new Error("BETTER_AUTH_URL or APP_BASE_URL is required");
  }

  const corsOrigin = parsed.CORS_ORIGIN ?? parsed.APP_BASE_URL ?? betterAuthUrl ?? DEFAULT_CORS_ORIGIN;

  return {
    NODE_ENV: parsed.NODE_ENV,
    PORT: parsed.PORT,
    DATABASE_URL: parsed.DATABASE_URL,
    BETTER_AUTH_SECRET: parsed.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: betterAuthUrl,
    CORS_ORIGIN: corsOrigin,
    corsOrigins: corsOrigin
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    // Defaults to a repo-relative folder for local dev; production sets an
    // absolute path on the persistent volume (see docker-compose.yml).
    ATTACHMENTS_DIR: parsed.ATTACHMENTS_DIR ?? resolve(process.cwd(), "data/attachments"),
    MIKOSHI_PLATFORM_API_URL: parsed.MIKOSHI_PLATFORM_API_URL ?? null,
  };
}

export async function registerEnv(app: FastifyInstance, overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<void> {
  const env = createEnv({
    ...process.env,
    ...overrides,
  });

  app.decorate("env", env);
}
