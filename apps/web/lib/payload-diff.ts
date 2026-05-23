/**
 * Field-level diff between two payload snapshots. The food event audit trail
 * renders these as "kcal: 480 → 500" rather than a raw JSON dump.
 *
 * Primitive-only: objects/arrays whose deep-equal results match are treated
 * as unchanged; non-matching nested values are surfaced as JSON-stringified
 * strings so the renderer doesn't have to inspect structure.
 */
export type PayloadDiffEntry = {
  field: string;
  before: unknown;
  after: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * Compute the diff between two payload snapshots. Keys present in either side
 * are emitted; deep-equal values are skipped. Insertion order follows
 * `next` first, then any keys present only in `previous`.
 *
 * - `previous` undefined/null/non-object → treat as `{}` (creation case).
 * - `next` undefined/null/non-object → treat as `{}` (deletion case).
 */
export function diffPayload(previous: unknown, next: unknown): PayloadDiffEntry[] {
  const prev: Record<string, unknown> = isObject(previous) ? previous : {};
  const nxt: Record<string, unknown> = isObject(next) ? next : {};

  const result: PayloadDiffEntry[] = [];
  const seen = new Set<string>();

  for (const key of Object.keys(nxt)) {
    seen.add(key);
    if (!deepEqual(prev[key], nxt[key])) {
      result.push({ field: key, before: prev[key], after: nxt[key] });
    }
  }
  for (const key of Object.keys(prev)) {
    if (seen.has(key)) continue;
    if (!deepEqual(prev[key], nxt[key])) {
      result.push({ field: key, before: prev[key], after: nxt[key] });
    }
  }

  return result;
}
