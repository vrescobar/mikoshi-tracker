import type { ZodType } from "zod";

import type { PrismaClient } from "../../generated/prisma/client";
import { jsonSchemaToZod } from "./json-schema-to-zod";

export interface AggregationSpec {
  metrics: string[];
  windows?: string[];
  sumFields?: string[];
  groupBy?: string[];
}

export interface CompiledSchema {
  payload: ZodType;
  config: ZodType;
  aggregations: AggregationSpec;
  cadence: string;
  skillSlug: string | null;
}

const cache = new Map<string, CompiledSchema>();

export async function getCompiledSchema(db: PrismaClient, entryTypeId: string): Promise<CompiledSchema> {
  const cached = cache.get(entryTypeId);
  if (cached !== undefined) return cached;

  const entryType = await db.entryType.findUnique({ where: { id: entryTypeId } });
  if (!entryType) {
    throw new Error(`EntryType not found: ${entryTypeId}`);
  }

  const compiled: CompiledSchema = {
    payload: jsonSchemaToZod(JSON.parse(entryType.payloadSchema) as unknown),
    config: jsonSchemaToZod(JSON.parse(entryType.configSchema) as unknown),
    aggregations: JSON.parse(entryType.aggregations) as AggregationSpec,
    cadence: entryType.cadence,
    skillSlug: entryType.skillSlug,
  };

  cache.set(entryTypeId, compiled);
  return compiled;
}

export function invalidateSchemaCache(entryTypeId?: string): void {
  if (entryTypeId !== undefined) {
    cache.delete(entryTypeId);
  } else {
    cache.clear();
  }
}
