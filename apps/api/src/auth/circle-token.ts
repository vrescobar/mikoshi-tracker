import { createHash, randomBytes } from "node:crypto";

import type { Db } from "../db/client";
import { newId, nowDb } from "../db/rows";

export function generateCircleToken() {
  return `mikoshi_tracker_circle_${randomBytes(24).toString("hex")}`;
}

export function hashCircleToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCircleToken(db: Db, circleId: string, label?: string) {
  const token = generateCircleToken();
  const tokenHash = hashCircleToken(token);
  const id = newId();
  const now = nowDb();
  db.run(`INSERT INTO "CircleToken" ("id", "circleId", "token", "label", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)`, [
    id,
    circleId,
    tokenHash,
    label ?? null,
    now,
    now,
  ]);
  return { token, tokenId: id, createdAt: new Date(now) };
}

export async function findCircleByToken(db: Db, token: string) {
  const record = db.get<{ id: string; circleId: string; name: string; ownerId: string }>(
    `SELECT t."id" AS "id", c."id" AS "circleId", c."name" AS "name", c."ownerId" AS "ownerId"
     FROM "CircleToken" t JOIN "Circle" c ON c."id" = t."circleId" WHERE t."token" = ? LIMIT 1`,
    [hashCircleToken(token)],
  );
  if (!record) return null;
  return {
    circle: { id: record.circleId, name: record.name, ownerId: record.ownerId },
    tokenId: record.id,
  };
}

export async function listCircleTokens(db: Db, circleId: string) {
  return db
    .all<{ id: string; circleId: string; label: string | null; createdAt: string; updatedAt: string }>(
      `SELECT "id", "circleId", "label", "createdAt", "updatedAt" FROM "CircleToken" WHERE "circleId" = ? ORDER BY "createdAt" ASC`,
      [circleId],
    )
    .map((r) => ({ ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) }));
}

export async function revokeCircleToken(db: Db, tokenId: string): Promise<void> {
  db.run(`DELETE FROM "CircleToken" WHERE "id" = ?`, [tokenId]);
}
