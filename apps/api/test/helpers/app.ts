import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { FastifyInstance } from "fastify";

import { createApp } from "../../src/server";
import { makeTestDbPath } from "./test-db";

const TEST_SECRET = "test-secret-with-at-least-thirty-two-characters";
export type TestContext = {
  app: FastifyInstance;
  attachmentsDir: string;
  cleanup: () => Promise<void>;
};

function normalizeCookie(setCookie: string | string[] | undefined): string {
  if (!setCookie) {
    throw new Error("Missing set-cookie header");
  }

  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  return values.map((value) => value.split(";")[0]).join("; ");
}

export async function createTestContext(
  envOverrides: Partial<NodeJS.ProcessEnv> = {},
): Promise<TestContext> {
  const databasePath = makeTestDbPath();
  const databaseUrl = `file:${databasePath}`;

  // Each test gets its own isolated, freshly-migrated DB. `createApp` →
  // `registerDb` runs the bun:sqlite migration runner on boot, so no template
  // copy or `prisma db push` is needed.
  const attachmentsDir = join(tmpdir(), `mikoshi-tracker-attachments-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const app = await createApp({
    env: {
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: TEST_SECRET,
      BETTER_AUTH_URL: "http://127.0.0.1:3001",
      CORS_ORIGIN: "http://localhost:3000",
      ATTACHMENTS_DIR: attachmentsDir,
      ...envOverrides,
    },
  });

  return {
    app,
    attachmentsDir,
    cleanup: async () => {
      await app.close();
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(`${databasePath}${suffix}`, { force: true });
      }
      rmSync(attachmentsDir, { force: true, recursive: true });
    },
  };
}

export async function signUp(
  app: FastifyInstance,
  overrides: Partial<{ email: string; password: string; name: string; timezone: string }> = {},
) {
  const email = overrides.email ?? "alice@example.com";
  const password = overrides.password ?? "password123";
  const name = overrides.name ?? "Alice";

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    payload: {
      email,
      password,
      name,
      ...(overrides.timezone ? { timezone: overrides.timezone } : {}),
    },
  });

  return {
    response,
    cookie: normalizeCookie(response.headers["set-cookie"]),
    body: response.json() as {
      user: { id: string; email: string; name: string };
    },
  };
}

export async function signIn(
  app: FastifyInstance,
  credentials: {
    email?: string;
    password?: string;
  } = {},
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: {
      email: credentials.email ?? "alice@example.com",
      password: credentials.password ?? "password123",
    },
  });

  return {
    response,
    cookie: normalizeCookie(response.headers["set-cookie"]),
  };
}

export async function signOut(app: FastifyInstance, cookie: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/sign-out",
    headers: {
      cookie,
    },
  });
}
