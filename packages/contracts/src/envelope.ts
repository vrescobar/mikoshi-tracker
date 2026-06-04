import { z } from "zod";

import { errorCodeSchema } from "./errors";

/**
 * Shared response/request envelope primitives for the `/api/v1` surface.
 *
 * Mirrors the companion product (mikoshi) conventions so a single frontend or
 * AI tool can consume both products with the same shapes:
 *   - success  → `{ ok: true, data }`
 *   - error    → `{ ok: false, code, error }`
 *   - lists    → `{ items, total, _identities? }`
 *   - paging   → `{ limit?, offset?, q? }` (limit capped at 500)
 *
 * These live in `@mikoshi-tracker/contracts` (not in the API package) so the
 * API, MCP, web, and admin SPA all import the exact same types — proving the
 * contracts package is the cross-frontend single source of truth.
 */

export const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  code: errorCodeSchema,
  error: z.string(),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function mutationEnvelope<T extends z.ZodType>(data: T) {
  return z.object({
    ok: z.literal(true),
    data,
  });
}

/**
 * A minimal identity hint, keyed by id in `_identities`. Optional everywhere —
 * costs nothing until a list endpoint chooses to enrich rows with display data.
 */
export const identityHintSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  externalId: z.string().optional(),
});

export type IdentityHint = z.infer<typeof identityHintSchema>;

export const identityMapSchema = z.record(z.string(), identityHintSchema);

export function listResponse<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    _identities: identityMapSchema.optional(),
  });
}

export const MAX_PAGE_LIMIT = 500;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_PAGE_LIMIT).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  q: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const sortOrderSchema = z.enum(["asc", "desc"]);

export const sortQuerySchema = z.object({
  sort: z.string().optional(),
  order: sortOrderSchema.optional(),
});

/**
 * Canonical check-in / event source, lowercase in v1. The legacy `/api` surface
 * and the stored `EventMutation.source` column use UPPERCASE; v1 handlers
 * translate at the service boundary (no stored-data migration).
 */
export const sourceSchema = z.enum(["web", "ai", "system", "circle"]);

export type Source = z.infer<typeof sourceSchema>;
