import { z } from "zod";

import { createEntryInputSchema, entryRecordSchema } from "@mikoshi-tracker/contracts/entries";
import { entryTypeRecordSchema as entryTypeSchema } from "@mikoshi-tracker/contracts/entry-types";
import { paginationQuerySchema } from "@mikoshi-tracker/contracts/envelope";

import { getRequestTimestamp } from "../../shared/controller-helpers";
import {
  archiveEntry,
  createEntry,
  getEntry,
  listEntries,
  restoreEntry,
  updateEntry,
} from "../../modules/entries/entry.service";
import { registerSchema } from "../apiMeta";
import { envelopeList, envelopeOne, requireUserId } from "../context";
import { paginate, sortItems } from "../shared";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const Entry = registerSchema("Entry", entryRecordSchema);
const EntryType = registerSchema("EntryType", entryTypeSchema);

const nonEmpty = z.string().trim().min(1);

const entriesListQuerySchema = paginationQuerySchema.extend({
  entryTypeSlug: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

const entryIdInputSchema = z.object({ entryId: nonEmpty });

const entryUpdateInputSchema = z
  .object({
    entryId: nonEmpty,
    name: nonEmpty.optional(),
    description: nonEmpty.nullable().optional(),
    category: nonEmpty.nullable().optional(),
    config: z.unknown().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.description !== undefined || v.category !== undefined || v.config !== undefined,
    {
      message: "At least one editable entry field must be provided",
    },
  );

export function entryTypesV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "entry-types",
      path: "/entry-types",
      operationId: "entryTypesList",
      summary: "List active entry types",
      auth: "bearer",
      mutating: false,
      list: true,
      querySchema: paginationQuerySchema,
      outputSchema: envelopeList(EntryType),
      handler: async (ctx) => {
        requireUserId(ctx);
        const rows = await ctx.deps.db.entryType.findMany({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
        });
        const items = rows.map((et) => ({
          id: et.id,
          slug: et.slug,
          displayName: et.displayName,
          cadence: et.cadence,
          payloadSchema: JSON.parse(et.payloadSchema) as unknown,
          configSchema: JSON.parse(et.configSchema) as unknown,
          aggregations: JSON.parse(et.aggregations) as unknown,
          skillSlug: et.skillSlug,
          isBuiltIn: et.isBuiltIn,
          isActive: et.isActive,
          createdAt: et.createdAt.toISOString(),
          updatedAt: et.updatedAt.toISOString(),
        }));
        return paginate(items, ctx.query as z.infer<typeof paginationQuerySchema>);
      },
    },
  ];
}

export function entriesV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "entries",
      path: "/entries",
      operationId: "entriesList",
      summary: "List the caller's entries",
      auth: "bearer",
      mutating: false,
      list: true,
      querySchema: entriesListQuerySchema,
      outputSchema: envelopeList(Entry),
      handler: async (ctx) => {
        const query = ctx.query as z.infer<typeof entriesListQuerySchema>;
        const items = await listEntries(ctx.deps, {
          userId: requireUserId(ctx),
          filters: { entryTypeSlug: query.entryTypeSlug, isActive: query.isActive, query: query.q },
        });
        return paginate(sortItems(items, query), query);
      },
    },
    {
      method: "GET",
      resource: "entries",
      path: "/entries/:entryId",
      operationId: "entriesGet",
      summary: "Get one entry by id",
      auth: "bearer",
      mutating: false,
      paramsSchema: z.object({ entryId: nonEmpty }),
      outputSchema: envelopeOne(Entry),
      handler: (ctx) =>
        getEntry(ctx.deps, { userId: requireUserId(ctx), entryId: (ctx.params as { entryId: string }).entryId }),
    },
    {
      method: "POST",
      resource: "entries",
      path: "/entries/create",
      operationId: "entriesCreate",
      summary: "Create an entry",
      auth: "bearer",
      mutating: true,
      successStatus: 201,
      inputSchema: createEntryInputSchema,
      outputSchema: envelopeOne(Entry),
      handler: (ctx) =>
        createEntry(ctx.deps, {
          userId: requireUserId(ctx),
          input: ctx.input,
          timestamp: getRequestTimestamp(ctx.request),
        }),
    },
    {
      method: "POST",
      resource: "entries",
      path: "/entries/update",
      operationId: "entriesUpdate",
      summary: "Update an entry",
      auth: "bearer",
      mutating: true,
      inputSchema: entryUpdateInputSchema,
      outputSchema: envelopeOne(Entry),
      handler: (ctx) => {
        const { entryId, ...patch } = ctx.input as z.infer<typeof entryUpdateInputSchema>;
        return updateEntry(ctx.deps, { userId: requireUserId(ctx), entryId, input: patch });
      },
    },
    {
      method: "POST",
      resource: "entries",
      path: "/entries/archive",
      operationId: "entriesArchive",
      summary: "Archive an entry",
      auth: "bearer",
      mutating: true,
      inputSchema: entryIdInputSchema,
      outputSchema: envelopeOne(Entry),
      handler: (ctx) =>
        archiveEntry(ctx.deps, { userId: requireUserId(ctx), entryId: (ctx.input as { entryId: string }).entryId }),
    },
    {
      method: "POST",
      resource: "entries",
      path: "/entries/restore",
      operationId: "entriesRestore",
      summary: "Restore an archived entry",
      auth: "bearer",
      mutating: true,
      inputSchema: entryIdInputSchema,
      outputSchema: envelopeOne(Entry),
      handler: (ctx) =>
        restoreEntry(ctx.deps, { userId: requireUserId(ctx), entryId: (ctx.input as { entryId: string }).entryId }),
    },
  ];
}
