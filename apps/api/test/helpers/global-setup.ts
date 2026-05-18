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
  // Template lives in /dev/shm (tmpfs) and is automatically cleared on reboot.
  // setup() removes and recreates it at the start of each run, so there is no
  // need to delete it here — and deleting it while other workers are still
  // copying it causes copyFileSync failures in long parallel runs.
}
