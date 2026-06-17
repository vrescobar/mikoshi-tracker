import type { Db } from "../db/client";
import { nowDb, sqliteBool } from "../db/rows";

const APP_SETTINGS_ID = "global";

type RegistrationStatus = {
  registrationEnabled: boolean;
  hasUsers: boolean;
};

export type AppSettingsRecord = {
  id: string;
  registrationEnabled: boolean;
};

function countUsers(db: Db, onlyAdmins = false): number {
  const sql = onlyAdmins
    ? `SELECT COUNT(*) AS c FROM "User" WHERE "isAdmin" = 1`
    : `SELECT COUNT(*) AS c FROM "User"`;
  return db.get<{ c: number }>(sql)?.c ?? 0;
}

async function ensureAdministrator(db: Db): Promise<void> {
  if (countUsers(db, true) > 0) {
    return;
  }

  const oldestUser = db.get<{ id: string }>(
    `SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1`,
  );

  if (!oldestUser) {
    return;
  }

  db.run(`UPDATE "User" SET "isAdmin" = 1, "updatedAt" = ? WHERE "id" = ?`, [nowDb(), oldestUser.id]);
}

function readAppSettings(db: Db): AppSettingsRecord {
  const row = db.get<{ id: string; registrationEnabled: number }>(
    `SELECT "id", "registrationEnabled" FROM "AppSettings" WHERE "id" = ?`,
    [APP_SETTINGS_ID],
  );
  if (!row) {
    // ensureAppSettings always inserts before reading; this is a safety net.
    return { id: APP_SETTINGS_ID, registrationEnabled: true };
  }
  return { id: row.id, registrationEnabled: sqliteBool.parse(row.registrationEnabled) };
}

export async function ensureAppSettings(db: Db): Promise<AppSettingsRecord> {
  const now = nowDb();
  db.run(
    `INSERT INTO "AppSettings" ("id", "registrationEnabled", "createdAt", "updatedAt")
     VALUES (?, 1, ?, ?)
     ON CONFLICT("id") DO NOTHING`,
    [APP_SETTINGS_ID, now, now],
  );
  return readAppSettings(db);
}

export async function getRegistrationStatus(db: Db): Promise<RegistrationStatus> {
  if (countUsers(db) === 0) {
    return {
      registrationEnabled: true,
      hasUsers: false,
    };
  }

  await ensureAdministrator(db);
  const settings = await ensureAppSettings(db);

  return {
    registrationEnabled: settings.registrationEnabled,
    hasUsers: true,
  };
}

export async function setRegistrationEnabled(
  db: Db,
  registrationEnabled: boolean,
): Promise<AppSettingsRecord> {
  const now = nowDb();
  const flag = registrationEnabled ? 1 : 0;
  db.run(
    `INSERT INTO "AppSettings" ("id", "registrationEnabled", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?)
     ON CONFLICT("id") DO UPDATE SET "registrationEnabled" = excluded."registrationEnabled", "updatedAt" = excluded."updatedAt"`,
    [APP_SETTINGS_ID, flag, now, now],
  );
  return readAppSettings(db);
}

export async function makeFirstUserAdmin(db: Db, userId: string): Promise<void> {
  await ensureAppSettings(db);

  if (countUsers(db) !== 1) {
    return;
  }

  db.run(`UPDATE "User" SET "isAdmin" = 1, "updatedAt" = ? WHERE "id" = ?`, [nowDb(), userId]);
}

export async function isUserAdmin(db: Db, userId: string): Promise<boolean> {
  await ensureAdministrator(db);

  const user = db.get<{ isAdmin: number }>(`SELECT "isAdmin" FROM "User" WHERE "id" = ?`, [userId]);
  return user ? sqliteBool.parse(user.isAdmin) : false;
}

export async function promoteUserToAdmin(
  db: Db,
  userId: string,
): Promise<{ id: string; isAdmin: boolean }> {
  await ensureAppSettings(db);

  db.run(`UPDATE "User" SET "isAdmin" = 1, "updatedAt" = ? WHERE "id" = ?`, [nowDb(), userId]);
  return { id: userId, isAdmin: true };
}
