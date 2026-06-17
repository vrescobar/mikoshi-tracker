import type { Db } from "../../db/client";

/** EntryType as the API/serializers expect it (booleans + Date, schemas as strings). */
export type EntryTypeRecord = {
  id: string;
  slug: string;
  displayName: string;
  cadence: string;
  payloadSchema: string;
  configSchema: string;
  aggregations: string;
  skillSlug: string | null;
  isBuiltIn: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type EntryTypeRow = {
  id: string;
  slug: string;
  displayName: string;
  cadence: string;
  payloadSchema: string;
  configSchema: string;
  aggregations: string;
  skillSlug: string | null;
  isBuiltIn: number;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

export function mapEntryTypeRow(row: EntryTypeRow): EntryTypeRecord {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    cadence: row.cadence,
    payloadSchema: row.payloadSchema,
    configSchema: row.configSchema,
    aggregations: row.aggregations,
    skillSlug: row.skillSlug,
    isBuiltIn: row.isBuiltIn !== 0,
    isActive: row.isActive !== 0,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export function listActiveEntryTypes(db: Db): EntryTypeRecord[] {
  return db
    .all<EntryTypeRow>(`SELECT * FROM "EntryType" WHERE "isActive" = 1 ORDER BY "createdAt" ASC`)
    .map(mapEntryTypeRow);
}

export function getEntryTypeBySlug(db: Db, slug: string): EntryTypeRecord | null {
  const row = db.get<EntryTypeRow>(`SELECT * FROM "EntryType" WHERE "slug" = ?`, [slug]);
  return row ? mapEntryTypeRow(row) : null;
}

export function getEntryTypeById(db: Db, id: string): EntryTypeRecord | null {
  const row = db.get<EntryTypeRow>(`SELECT * FROM "EntryType" WHERE "id" = ?`, [id]);
  return row ? mapEntryTypeRow(row) : null;
}
