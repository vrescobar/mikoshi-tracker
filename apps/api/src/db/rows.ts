import { randomBytes } from "node:crypto";

import { z } from "zod";

/**
 * Generate a primary-key id for a new row. Prisma used cuid, which is
 * lexically sortable by creation time — and several `ORDER BY "createdAt"
 * DESC, "id" DESC` queries rely on that to break same-millisecond ties in
 * insertion order. We reproduce both properties: a millisecond timestamp
 * prefix + a per-process monotonic counter (same-ms ordering) + random
 * entropy, all lowercase base36/hex so ids keep the `^[a-z0-9]+$` shape.
 */
let idCounter = 0;
export const newId = (): string => {
  const time = Date.now().toString(36).padStart(9, "0");
  const seq = (idCounter++ & 0xffffff).toString(36).padStart(5, "0");
  const rand = randomBytes(8).toString("hex");
  return `${time}${seq}${rand}`;
};

/**
 * Column coercions for raw SQLite rows read via bun:sqlite. Prisma's libSQL
 * adapter stored values with these conventions (verified against the prod DB):
 *   - booleans  → INTEGER 0/1
 *   - DateTime  → TEXT ISO-8601 with offset, e.g. 2026-05-17T16:46:33.780+00:00
 *   - dateKey   → TEXT "YYYY-MM-DD" (kept as a plain string, NOT a Date)
 *   - floats    → REAL
 * Repositories compose these into per-table row schemas so the values handed
 * back to services/contracts match exactly what the Prisma client returned.
 */

/** INTEGER 0/1 (or a real boolean) → boolean. */
export const sqliteBool = z
  .union([z.literal(0), z.literal(1), z.boolean()])
  .transform((v) => v === 1 || v === true);

/** Nullable boolean column. */
export const sqliteBoolNullable = z
  .union([z.literal(0), z.literal(1), z.boolean(), z.null()])
  .transform((v) => (v === null ? null : v === 1 || v === true));

/** TEXT ISO-8601 (or epoch ms) → Date. */
export const sqliteDate = z.union([z.string(), z.number()]).transform((v) => new Date(v));

/** Nullable DateTime column. */
export const sqliteDateNullable = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === null ? null : new Date(v)));

/** Encode a boolean for a write. */
export const toDbBool = (value: boolean): 0 | 1 => (value ? 1 : 0);

/** Encode a Date for a write (matches the stored ISO-8601 convention). */
export const toDbDate = (value: Date): string => value.toISOString();

/** Current timestamp encoded for a write — for `updatedAt`/`createdAt`. */
export const nowDb = (): string => new Date().toISOString();
