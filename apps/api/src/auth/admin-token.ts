import { createHash, randomBytes } from "node:crypto";

import type { Db } from "../db/client";
import { newId, nowDb } from "../db/rows";

/**
 * Named admin credentials. Each operator/bot gets its own `mikoshi_tracker_admin_*`
 * token (stored as a SHA-256 hash, like personal/circle tokens) so god-mode actions
 * carry a real identity. The static MIKOSHI_TRACKER_ADMIN_API_KEY stays the root
 * credential that bootstraps these.
 */

function generateAdminToken(): string {
  return `mikoshi_tracker_admin_${randomBytes(24).toString("hex")}`;
}

function hashAdminToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminToken(db: Db, label: string) {
  const token = generateAdminToken();
  const id = newId();
  const now = nowDb();
  db.run(
    `INSERT INTO "AdminToken" ("id", "token", "label", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
    [id, hashAdminToken(token), label, now, now],
  );
  return { token, tokenId: id, label, createdAt: new Date(now).toISOString() };
}

export async function listAdminTokens(db: Db) {
  const rows = db.all<{
    id: string;
    label: string;
    revoked: number;
    lastUsedAt: string | null;
    createdAt: string;
  }>(`SELECT "id", "label", "revoked", "lastUsedAt", "createdAt" FROM "AdminToken" ORDER BY "createdAt" DESC`);
  return rows.map((r) => ({
    tokenId: r.id,
    label: r.label,
    revoked: r.revoked !== 0,
    lastUsedAt: r.lastUsedAt ? new Date(r.lastUsedAt).toISOString() : null,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

export async function revokeAdminToken(db: Db, tokenId: string): Promise<boolean> {
  const result = db.run(`UPDATE "AdminToken" SET "revoked" = 1, "updatedAt" = ? WHERE "id" = ?`, [
    nowDb(),
    tokenId,
  ]);
  return result.changes > 0;
}

/** Resolve a presented bearer to a live (non-revoked) named admin token, or null. */
export async function findAdminTokenByValue(db: Db, token: string) {
  const record = db.get<{ id: string; label: string; revoked: number }>(
    `SELECT "id", "label", "revoked" FROM "AdminToken" WHERE "token" = ?`,
    [hashAdminToken(token)],
  );
  if (!record || record.revoked !== 0) return null;
  // Best-effort last-used stamp; never block auth on it.
  try {
    db.run(`UPDATE "AdminToken" SET "lastUsedAt" = ? WHERE "id" = ?`, [nowDb(), record.id]);
  } catch {
    // ignore
  }
  return { tokenId: record.id, label: record.label };
}
