import type { Db } from "../../db/client";
import { nowDb } from "../../db/rows";

/** Shape returned to callers — matches the fields the Prisma `User` model exposed. */
export type UserRecord = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  timezone: string;
  isAdmin: boolean;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: number;
  image: string | null;
  timezone: string;
  isAdmin: number;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified !== 0,
    image: row.image,
    timezone: row.timezone,
    isAdmin: row.isAdmin !== 0,
    externalId: row.externalId,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export function getUserById(db: Db, id: string): UserRecord | null {
  const row = db.get<UserRow>(`SELECT * FROM "User" WHERE "id" = ?`, [id]);
  return row ? mapUserRow(row) : null;
}

export function getUserByExternalId(db: Db, externalId: string): UserRecord | null {
  const row = db.get<UserRow>(`SELECT * FROM "User" WHERE "externalId" = ?`, [externalId]);
  return row ? mapUserRow(row) : null;
}

export function updateUserTimezone(db: Db, id: string, timezone: string): void {
  db.run(`UPDATE "User" SET "timezone" = ?, "updatedAt" = ? WHERE "id" = ?`, [timezone, nowDb(), id]);
}
