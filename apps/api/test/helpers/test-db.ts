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
 */
export const TEMPLATE_DB_PATH = join(TEST_DB_DIR, "haaabit-test-template.db");
