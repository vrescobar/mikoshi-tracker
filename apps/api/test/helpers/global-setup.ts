import { execFileSync } from "node:child_process";
import { closeSync, openSync, rmSync } from "node:fs";

import { REPO_ROOT, TEMPLATE_DB_PATH } from "./test-db";

const SCHEMA_PATH = "prisma/schema.prisma";

function removeTemplate(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${TEMPLATE_DB_PATH}${suffix}`, { force: true });
  }
}

/**
 * Vitest globalSetup: materialize the Prisma schema into a template SQLite
 * DB exactly once per test run. `createTestContext()` then copies this file
 * per test instead of spawning `prisma db push` ~56 times.
 */
export async function setup(): Promise<void> {
  removeTemplate();
  closeSync(openSync(TEMPLATE_DB_PATH, "w"));

  execFileSync(
    "pnpm",
    [
      "exec",
      "prisma",
      "db",
      "push",
      "--config",
      "prisma.config.ts",
      "--schema",
      SCHEMA_PATH,
      "--url",
      `file:${TEMPLATE_DB_PATH}`,
    ],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
    },
  );
}

export async function teardown(): Promise<void> {
  removeTemplate();
}
