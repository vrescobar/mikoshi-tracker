import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = join(__dirname, "../../../../");
const TEST_DB_DIR = existsSync("/dev/shm") ? "/dev/shm" : tmpdir();
const SCHEMA_PATH = "prisma/schema.prisma";

function makeTemplateDbPath(): string {
  const unique = `${process.pid}-${Date.now()}`;
  return join(TEST_DB_DIR, `mikoshi-tracker-test-template-${unique}.db`);
}

function removeTemplate(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${path}${suffix}`, { force: true });
  }
}

function sweepStaleDbs(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
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

export async function setup(): Promise<void> {
  sweepStaleDbs();

  const templatePath = makeTemplateDbPath();
  process.env.MIKOSHI_TRACKER_TEST_TEMPLATE_DB = templatePath;
  removeTemplate(templatePath);

  // Invoke the project-local prisma CLI directly. Using `pnpm exec prisma`
  // triggers a full workspace install in pnpm 11.x, which fails on this ARM
  // Jetson host because of `sharp`'s native build.
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
  const templatePath = process.env.MIKOSHI_TRACKER_TEST_TEMPLATE_DB;
  if (templatePath) removeTemplate(templatePath);
}
