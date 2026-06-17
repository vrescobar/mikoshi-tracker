import { createHash, randomBytes } from "node:crypto";

import type { Db } from "../db/client";
import { newId, nowDb } from "../db/rows";
import { mapUserRow, type UserRecord } from "../modules/users/user.repository";

export const API_DOCS_PATH = "/api/docs";
export const API_SPEC_PATH = "/api/openapi.json";

function generatePersonalApiToken() {
  return `mikoshi_tracker_${randomBytes(24).toString("hex")}`;
}

function hashPersonalApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isLegacyStoredToken(token: string) {
  return token.startsWith("mikoshi_tracker_");
}

export async function migrateLegacyPersonalApiTokens(db: Db): Promise<void> {
  const records = db.all<{ id: string; token: string }>(`SELECT "id", "token" FROM "ApiToken"`);
  for (const record of records) {
    if (isLegacyStoredToken(record.token)) {
      db.run(`UPDATE "ApiToken" SET "token" = ?, "updatedAt" = ? WHERE "id" = ?`, [
        hashPersonalApiToken(record.token),
        nowDb(),
        record.id,
      ]);
    }
  }
}

export async function getPersonalApiToken(
  db: Db,
  userId: string,
): Promise<{ id: string; userId: string; createdAt: Date; updatedAt: Date } | null> {
  const row = db.get<{ id: string; userId: string; createdAt: string; updatedAt: string }>(
    `SELECT "id", "userId", "createdAt", "updatedAt" FROM "ApiToken" WHERE "userId" = ?`,
    [userId],
  );
  if (!row) return null;
  return { id: row.id, userId: row.userId, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
}

export async function resetPersonalApiToken(
  db: Db,
  userId: string,
): Promise<{ token: string; updatedAt: Date }> {
  const token = generatePersonalApiToken();
  const tokenHash = hashPersonalApiToken(token);
  const now = nowDb();

  db.run(
    `INSERT INTO "ApiToken" ("id", "token", "userId", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT("userId") DO UPDATE SET "token" = excluded."token", "updatedAt" = excluded."updatedAt"`,
    [newId(), tokenHash, userId, now, now],
  );

  const row = db.get<{ updatedAt: string }>(`SELECT "updatedAt" FROM "ApiToken" WHERE "userId" = ?`, [userId]);
  return { token, updatedAt: new Date(row?.updatedAt ?? now) };
}

export async function findUserByApiToken(db: Db, token: string): Promise<UserRecord | null> {
  const row = db.get<Record<string, unknown>>(
    `SELECT u.* FROM "ApiToken" t JOIN "User" u ON u."id" = t."userId" WHERE t."token" = ?`,
    [hashPersonalApiToken(token)],
  );
  return row ? mapUserRow(row as never) : null;
}
