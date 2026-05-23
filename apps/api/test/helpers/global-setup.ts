import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { makeTemplateDbPath, REPO_ROOT, TEST_DB_DIR } from "./test-db";

const SCHEMA_PATH = "prisma/schema.prisma";

/** Files older than this are assumed orphaned (no test run lasts an hour). */
const STALE_DB_AGE_MS = 60 * 60 * 1000;

function removeTemplate(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${path}${suffix}`, { force: true });
  }
}

/**
 * Sweep orphaned `mikoshi-tracker-test-*` DBs left in `TEST_DB_DIR`. Per-test DBs are
 * normally removed by `createTestContext().cleanup()`, but a test run killed
 * mid-flight (e.g. an autonomous loop hitting its timeout) skips cleanup and
 * leaks them. Only files older than `STALE_DB_AGE_MS` are removed, so DBs
 * belonging to a concurrent in-flight run are never touched.
 */
function sweepStaleDbs(): void {
  const cutoff = Date.now() - STALE_DB_AGE_MS;
  let entries: string[];
  try {
    entries = readdirSync(TEST_DB_DIR);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.startsWith("mikoshi-tracker-test-")) continue;
    const full = join(TEST_DB_DIR, name);
    try {
      if (statSync(full).mtimeMs < cutoff) rmSync(full, { force: true });
    } catch {
      // Raced with another run's cleanup — ignore.
    }
  }
}

/**
 * Vitest globalSetup: materialize the Prisma schema into a template SQLite
 * DB exactly once per test run. `createTestContext()` then copies this file
 * per test instead of spawning `prisma db push` ~56 times.
 *
 * The template path is unique per `vitest` invocation (process id + time)
 * and published via `MIKOSHI_TRACKER_TEST_TEMPLATE_DB`. globalSetup runs in the main
 * vitest process before any worker is forked, so the env var propagates to
 * every forked test worker. This keeps concurrent test runs fully isolated:
 * one run can never delete or truncate another run's template.
 */
export async function setup(): Promise<void> {
  sweepStaleDbs();

  const templatePath = makeTemplateDbPath();
  process.env.MIKOSHI_TRACKER_TEST_TEMPLATE_DB = templatePath;
  removeTemplate(templatePath);

  // `prisma db push` creates the SQLite file itself — no need to pre-create
  // an empty placeholder (a placeholder is also a hazard: anything copying it
  // before the push finishes gets a 0-byte, schema-less DB).
  // Invoke the project-local prisma CLI directly. Using `pnpm exec prisma`
  // triggers a full workspace install in pnpm 11.x, which fails on this ARM
  // Jetson host because the optional `sharp` native build cannot resolve a
  // pre-built binary.
  const prismaBin = join(REPO_ROOT, "node_modules", ".bin", "prisma");
  execFileSync(
    prismaBin,
    [
      "db",
      "push",
      "--config",
      "prisma.config.ts",
      "--schema",
      SCHEMA_PATH,
      "--url",
      `file:${templatePath}`,
    ],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
    },
  );
}

export async function teardown(): Promise<void> {
  // The template path is unique to this run, so deleting it on teardown is
  // safe (no other run shares it) and keeps /dev/shm from accumulating stale
  // template DBs. teardown runs only after every worker has finished.
  const templatePath = process.env.MIKOSHI_TRACKER_TEST_TEMPLATE_DB;
  if (templatePath) removeTemplate(templatePath);
}
