import { Database } from "bun:sqlite";

/**
 * Thin ergonomic wrapper around `bun:sqlite`. Replaces the Prisma client as the
 * `app.db` decoration. Repositories own their SQL and validate the raw rows
 * with the zod schemas in `./rows.ts`; this layer only runs statements and
 * exposes the underlying `Database` (needed by better-auth's BunSqliteDialect).
 *
 * Params: pass an array for positional `?` placeholders, or an object for named
 * `$name` placeholders (bun:sqlite also accepts keys without the `$` prefix).
 */
export type SqlParams = Record<string, unknown> | unknown[];

export type RunResult = { changes: number; lastInsertRowid: number | bigint };

export class Db {
  /** The raw bun:sqlite handle — passed to better-auth and used for PRAGMAs. */
  readonly raw: Database;

  constructor(database: Database) {
    this.raw = database;
  }

  /** Run a SELECT and return every row. */
  all<T = Record<string, unknown>>(sql: string, params?: SqlParams): T[] {
    const stmt = this.raw.query(sql);
    return (params === undefined ? stmt.all() : stmt.all(params as never)) as T[];
  }

  /** Run a SELECT and return the first row, or null. */
  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): T | null {
    const stmt = this.raw.query(sql);
    const row = params === undefined ? stmt.get() : stmt.get(params as never);
    return (row ?? null) as T | null;
  }

  /** Run a writing statement (INSERT/UPDATE/DELETE). */
  run(sql: string, params?: SqlParams): RunResult {
    const stmt = this.raw.query(sql);
    const res = params === undefined ? stmt.run() : stmt.run(params as never);
    return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
  }

  /** Execute one or more raw statements (DDL, migrations). No params. */
  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /**
   * Run `fn` inside a transaction (BEGIN/COMMIT, ROLLBACK on throw). Replaces
   * Prisma's `$transaction`. Nesting is supported via SQLite savepoints.
   */
  transaction<T>(fn: () => T): T {
    return this.raw.transaction(fn)();
  }

  close(): void {
    this.raw.close();
  }
}

/** Strip a `file:` prefix from a Prisma-style DATABASE_URL to a filesystem path. */
export function databasePathFromUrl(databaseUrl: string): string {
  return databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
}

/** Open a bun:sqlite database with the project's standard PRAGMAs. */
export function createDatabase(databaseUrl: string): Database {
  const db = new Database(databasePathFromUrl(databaseUrl), { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

export function createDb(databaseUrl: string): Db {
  return new Db(createDatabase(databaseUrl));
}
