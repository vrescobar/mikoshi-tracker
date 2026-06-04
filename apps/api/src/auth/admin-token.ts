import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "../generated/prisma/client";

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

export async function createAdminToken(db: PrismaClient, label: string) {
  const token = generateAdminToken();
  const record = await db.adminToken.create({
    data: { token: hashAdminToken(token), label },
  });
  return { token, tokenId: record.id, label: record.label, createdAt: record.createdAt.toISOString() };
}

export async function listAdminTokens(db: PrismaClient) {
  const rows = await db.adminToken.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    tokenId: r.id,
    label: r.label,
    revoked: r.revoked,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function revokeAdminToken(db: PrismaClient, tokenId: string): Promise<boolean> {
  const result = await db.adminToken.updateMany({ where: { id: tokenId }, data: { revoked: true } });
  return result.count > 0;
}

/** Resolve a presented bearer to a live (non-revoked) named admin token, or null. */
export async function findAdminTokenByValue(db: PrismaClient, token: string) {
  const record = await db.adminToken.findUnique({ where: { token: hashAdminToken(token) } });
  if (!record || record.revoked) return null;
  // Best-effort last-used stamp; never block auth on it.
  await db.adminToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { tokenId: record.id, label: record.label };
}
