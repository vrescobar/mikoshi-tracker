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
 * Build a unique per-test SQLite path. Each `createTestContext()` gets a fresh
 * database that the app migrates from `apps/api/migrations` on boot (the
 * bun:sqlite migration runner replaced `prisma db push` + the template-copy
 * scheme; no shared template, so concurrent runs never collide).
 */
export function makeTestDbPath(): string {
  return join(TEST_DB_DIR, `mikoshi-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}
