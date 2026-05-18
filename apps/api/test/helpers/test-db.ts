import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

/** Repo root, resolved from apps/api/test/helpers/. */
export const REPO_ROOT = join(THIS_DIR, "../../../../");

/**
 * Directory for test SQLite databases. Prefer /dev/shm (tmpfs, RAM-backed)
 * so test DBs never touch real disk; fall back to the OS temp dir on
 * platforms without /dev/shm (e.g. macOS).
 */
export const TEST_DB_DIR = existsSync("/dev/shm") ? "/dev/shm" : tmpdir();

/**
 * Schema template DB. `globalSetup` runs `prisma db push` against this file
 * exactly once; every `createTestContext()` copies it instead of re-running
 * the Prisma CLI. Treated as read-only once setup completes.
 *
 * The path is unique per `vitest` invocation: `globalSetup` builds it and
 * exports it via `HAAABIT_TEST_TEMPLATE_DB` so forked test workers inherit
 * it. Without this, concurrent test runs (e.g. an autonomous loop running
 * `pnpm test` while another run is in flight) share one fixed path — and one
 * run's `globalSetup` removing/recreating the template mid-copy yields
 * 0-byte test DBs ("no such table") or outright ENOENT in the other run.
 */
export const TEMPLATE_DB_PATH =
  process.env.HAAABIT_TEST_TEMPLATE_DB ??
  join(TEST_DB_DIR, "haaabit-test-template.db");

/** Build a per-run-unique template path. Used by `globalSetup`. */
export function makeTemplateDbPath(): string {
  const unique = `${process.pid}-${Date.now()}`;
  return join(TEST_DB_DIR, `haaabit-test-template-${unique}.db`);
}
