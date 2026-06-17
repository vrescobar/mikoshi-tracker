import { z } from "zod";

import { adminCircleSchema } from "@mikoshi-tracker/contracts/admin";
import { paginationQuerySchema } from "@mikoshi-tracker/contracts/envelope";

import {
  dashboardMetrics,
  listAllCircles,
  listAllEntries,
  listAllEvents,
  listAllUsers,
} from "../../modules/admin/admin-explore.repository";
import {
  compareCircleLeaderboardSnapshots,
  createCircleLeaderboardSnapshot,
  listCircleLeaderboardSnapshots,
} from "../../modules/circles/circle-snapshot.service";
import { bulkAssignHabit } from "../../modules/admin/admin-bulk.service";
import { ensureUserToken, readUserTokenMeta } from "../../modules/admin/admin-token.service";
import { listAdminAuditLog, recordAdminAction } from "../../modules/admin/admin-audit.service";
import { createAdminToken, listAdminTokens, revokeAdminToken } from "../../auth/admin-token";
import { createHabitInputSchema } from "@mikoshi-tracker/contracts/habits";
import { getRequestTimestamp } from "../../shared/controller-helpers";
import { registerSchema } from "../apiMeta";
import { envelope, envelopeList, requireAdminOperator } from "../context";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const nonEmpty = z.string().trim().min(1);

const AdminUser = registerSchema(
  "AdminUser",
  z.object({
    id: nonEmpty,
    name: z.string(),
    email: z.string(),
    externalId: z.string().nullable(),
    isAdmin: z.boolean(),
    timezone: z.string(),
    createdAt: z.string(),
  }),
);

const AdminCircle = registerSchema("AdminCircle", adminCircleSchema);

const AdminEntry = registerSchema(
  "AdminEntry",
  z.object({
    id: nonEmpty,
    userId: nonEmpty,
    entryTypeSlug: nonEmpty,
    name: z.string(),
    isActive: z.boolean(),
    createdAt: z.string(),
  }),
);

const AdminEvent = registerSchema(
  "AdminEvent",
  z.object({
    id: nonEmpty,
    entryId: nonEmpty,
    userId: nonEmpty,
    occurredAt: z.string(),
    dateKey: z.string(),
    completed: z.boolean().nullable(),
  }),
);

const DashboardMetrics = registerSchema(
  "AdminDashboardMetrics",
  z.object({
    users: z.number().int(),
    circles: z.number().int(),
    activeCircles: z.number().int(),
    entries: z.number().int(),
    events: z.number().int(),
    snapshots: z.number().int(),
  }),
);

const LeaderboardSnapshot = registerSchema(
  "CircleLeaderboardSnapshot",
  z.object({
    id: nonEmpty,
    circleId: nonEmpty,
    season: z.string(),
    userId: nonEmpty,
    rank: z.number().int(),
    score: z.number().int(),
    data: z.unknown(),
    createdAt: z.string(),
  }),
);

const entriesQuery = paginationQuerySchema.extend({
  userId: z.string().optional(),
  entryTypeSlug: z.string().optional(),
});
const eventsQuery = paginationQuerySchema.extend({
  userId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
const snapshotCreateInput = z.object({ circleId: nonEmpty, season: nonEmpty.optional() });
const snapshotListQuery = z.object({ circleId: nonEmpty, season: z.string().optional() });
const snapshotCompareQuery = z.object({ circleId: nonEmpty, seasonA: nonEmpty, seasonB: nonEmpty });

const userRefQuery = z
  .object({ userId: z.string().optional(), externalId: z.string().optional() })
  .refine((v) => Boolean(v.userId) || Boolean(v.externalId), { message: "Provide userId or externalId" });
const userRefInput = userRefQuery;
const bulkAssignInput = z.object({
  circleId: nonEmpty,
  externalIds: z.array(nonEmpty).min(1),
  habit: createHabitInputSchema,
});

const adminTokenMintInput = z.object({ label: nonEmpty });
const adminTokenRevokeInput = z.object({ tokenId: nonEmpty });
const auditLogQuery = paginationQuerySchema.extend({ action: z.string().optional() });

export function adminV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "admin",
      path: "/admin/users",
      operationId: "adminUsersList",
      summary: "God-mode: list all users",
      auth: "admin-key",
      mutating: false,
      list: true,
      querySchema: paginationQuerySchema,
      outputSchema: envelopeList(AdminUser),
      handler: (ctx) => listAllUsers(ctx.deps, ctx.query as z.infer<typeof paginationQuerySchema>),
    },
    {
      method: "GET",
      resource: "admin",
      path: "/admin/circles",
      operationId: "adminCirclesList",
      summary: "God-mode: list all circles with member counts",
      auth: "admin-key",
      mutating: false,
      list: true,
      querySchema: paginationQuerySchema,
      outputSchema: envelopeList(AdminCircle),
      handler: (ctx) => listAllCircles(ctx.deps, ctx.query as z.infer<typeof paginationQuerySchema>),
    },
    {
      method: "GET",
      resource: "admin",
      path: "/admin/entries",
      operationId: "adminEntriesList",
      summary: "God-mode: list all entries across users",
      auth: "admin-key",
      mutating: false,
      list: true,
      querySchema: entriesQuery,
      outputSchema: envelopeList(AdminEntry),
      handler: (ctx) => listAllEntries(ctx.deps, ctx.query as z.infer<typeof entriesQuery>),
    },
    {
      method: "GET",
      resource: "admin",
      path: "/admin/events",
      operationId: "adminEventsList",
      summary: "God-mode: list all entry events across users",
      auth: "admin-key",
      mutating: false,
      list: true,
      querySchema: eventsQuery,
      outputSchema: envelopeList(AdminEvent),
      handler: (ctx) => listAllEvents(ctx.deps, ctx.query as z.infer<typeof eventsQuery>),
    },
    {
      method: "GET",
      resource: "admin",
      path: "/admin/dashboard/metrics",
      operationId: "adminDashboardMetrics",
      summary: "God-mode: system-wide counts",
      auth: "admin-key",
      mutating: false,
      outputSchema: envelope(DashboardMetrics),
      handler: (ctx) => dashboardMetrics(ctx.deps),
    },
    {
      method: "POST",
      resource: "admin",
      path: "/admin/circles/snapshot/create",
      operationId: "adminCircleSnapshotCreate",
      summary: "Freeze a circle's current leaderboard standings into a season snapshot",
      auth: "admin-key",
      mutating: true,
      successStatus: 201,
      inputSchema: snapshotCreateInput,
      outputSchema: envelope(z.object({ circleId: nonEmpty, season: z.string(), count: z.number().int() })),
      handler: async (ctx) => {
        const input = ctx.input as z.infer<typeof snapshotCreateInput>;
        const result = await createCircleLeaderboardSnapshot(ctx.deps, {
          circleId: input.circleId,
          season: input.season,
          timestamp: getRequestTimestamp(ctx.request),
        });
        await recordAdminAction(ctx.deps, {
          operator: requireAdminOperator(ctx),
          action: "circle.snapshot.create",
          targetType: "circle",
          targetId: input.circleId,
          metadata: { season: result.season, count: result.count },
        });
        return result;
      },
    },
    {
      method: "GET",
      resource: "admin",
      path: "/admin/circles/snapshot/list",
      operationId: "adminCircleSnapshotList",
      summary: "List frozen leaderboard snapshots for a circle (optionally one season)",
      auth: "admin-key",
      mutating: false,
      list: true,
      querySchema: snapshotListQuery,
      outputSchema: envelopeList(LeaderboardSnapshot),
      handler: async (ctx) => {
        const query = ctx.query as z.infer<typeof snapshotListQuery>;
        const items = await listCircleLeaderboardSnapshots(ctx.deps, query);
        return { items, total: items.length };
      },
    },
    {
      method: "GET",
      resource: "admin",
      path: "/admin/circles/snapshot/compare",
      operationId: "adminCircleSnapshotCompare",
      summary: "Diff two frozen seasons: per-user rank/score movement",
      auth: "admin-key",
      mutating: false,
      querySchema: snapshotCompareQuery,
      outputSchema: envelope(
        z.object({
          circleId: nonEmpty,
          seasonA: z.string(),
          seasonB: z.string(),
          rows: z.array(
            z.object({
              userId: nonEmpty,
              rankA: z.number().int().nullable(),
              rankB: z.number().int().nullable(),
              rankDelta: z.number().int().nullable(),
              scoreA: z.number().int().nullable(),
              scoreB: z.number().int().nullable(),
              scoreDelta: z.number().int().nullable(),
            }),
          ),
        }),
      ),
      handler: (ctx) => compareCircleLeaderboardSnapshots(ctx.deps, ctx.query as z.infer<typeof snapshotCompareQuery>),
    },
    // ── Per-user personal token (read-only meta + idempotent ensure) ──────────
    {
      method: "GET",
      resource: "admin",
      path: "/admin/users/token",
      operationId: "adminUserTokenMeta",
      summary: "Personal-token metadata for a user (never returns the plaintext)",
      auth: "admin-key",
      mutating: false,
      querySchema: userRefQuery,
      outputSchema: envelope(
        z.object({
          userId: nonEmpty,
          hasToken: z.boolean(),
          createdAt: z.string().nullable(),
          updatedAt: z.string().nullable(),
        }),
      ),
      handler: (ctx) => readUserTokenMeta(ctx.deps, ctx.query as z.infer<typeof userRefQuery>),
    },
    {
      method: "POST",
      resource: "admin",
      path: "/admin/users/token/ensure",
      operationId: "adminUserTokenEnsure",
      summary: "Mint a personal token only if absent (plaintext returned once on creation)",
      auth: "admin-key",
      mutating: true,
      inputSchema: userRefInput,
      outputSchema: envelope(
        z.object({
          userId: nonEmpty,
          created: z.boolean(),
          hasToken: z.boolean(),
          token: z.string().nullable(),
          updatedAt: z.string(),
        }),
      ),
      handler: async (ctx) => {
        const result = await ensureUserToken(ctx.deps, ctx.input as z.infer<typeof userRefInput>);
        await recordAdminAction(ctx.deps, {
          operator: requireAdminOperator(ctx),
          action: "user.token.ensure",
          targetType: "user",
          targetId: result.userId,
          metadata: { created: result.created },
        });
        return result;
      },
    },
    // ── Bulk contest setup ───────────────────────────────────────────────────
    {
      method: "POST",
      resource: "admin",
      path: "/admin/circles/bulk-assign-habit",
      operationId: "adminBulkAssignHabit",
      summary: "Create + share one habit for many circle members in a single call",
      auth: "admin-key",
      mutating: true,
      inputSchema: bulkAssignInput,
      outputSchema: envelope(
        z.object({
          assigned: z.array(z.string()),
          notMember: z.array(z.string()),
          notProvisioned: z.array(z.string()),
        }),
      ),
      handler: async (ctx) => {
        const input = ctx.input as z.infer<typeof bulkAssignInput>;
        const result = await bulkAssignHabit(ctx.deps, {
          circleId: input.circleId,
          externalIds: input.externalIds,
          habit: input.habit,
        });
        await recordAdminAction(ctx.deps, {
          operator: requireAdminOperator(ctx),
          action: "circle.bulk_assign_habit",
          targetType: "circle",
          targetId: input.circleId,
          metadata: { assigned: result.assigned.length, habit: input.habit.name },
        });
        return result;
      },
    },
    // ── Named admin tokens (per-operator identity; root key bootstraps) ───────
    {
      method: "POST",
      resource: "admin",
      path: "/admin/tokens/mint",
      operationId: "adminTokenMint",
      summary: "Mint a named admin token (plaintext returned once)",
      auth: "admin-key",
      mutating: true,
      successStatus: 201,
      inputSchema: adminTokenMintInput,
      outputSchema: envelope(
        z.object({ token: nonEmpty, tokenId: nonEmpty, label: z.string(), createdAt: z.string() }),
      ),
      handler: async (ctx) => {
        const input = ctx.input as z.infer<typeof adminTokenMintInput>;
        const result = await createAdminToken(ctx.deps.sqlite, input.label);
        await recordAdminAction(ctx.deps, {
          operator: requireAdminOperator(ctx),
          action: "admin_token.mint",
          targetType: "admin_token",
          targetId: result.tokenId,
          metadata: { label: result.label },
        });
        return result;
      },
    },
    {
      method: "GET",
      resource: "admin",
      path: "/admin/tokens",
      operationId: "adminTokenList",
      summary: "List named admin tokens (metadata only)",
      auth: "admin-key",
      mutating: false,
      outputSchema: envelope(
        z.object({
          tokens: z.array(
            z.object({
              tokenId: nonEmpty,
              label: z.string(),
              revoked: z.boolean(),
              lastUsedAt: z.string().nullable(),
              createdAt: z.string(),
            }),
          ),
        }),
      ),
      handler: async (ctx) => {
        requireAdminOperator(ctx);
        return { tokens: await listAdminTokens(ctx.deps.sqlite) };
      },
    },
    {
      method: "POST",
      resource: "admin",
      path: "/admin/tokens/revoke",
      operationId: "adminTokenRevoke",
      summary: "Revoke a named admin token",
      auth: "admin-key",
      mutating: true,
      inputSchema: adminTokenRevokeInput,
      outputSchema: envelope(z.object({ revoked: z.boolean() })),
      handler: async (ctx) => {
        const input = ctx.input as z.infer<typeof adminTokenRevokeInput>;
        const revoked = await revokeAdminToken(ctx.deps.sqlite, input.tokenId);
        await recordAdminAction(ctx.deps, {
          operator: requireAdminOperator(ctx),
          action: "admin_token.revoke",
          targetType: "admin_token",
          targetId: input.tokenId,
        });
        return { revoked };
      },
    },
    {
      method: "GET",
      resource: "admin",
      path: "/admin/audit-log",
      operationId: "adminAuditLog",
      summary: "God-mode: recent admin actions (who did what)",
      auth: "admin-key",
      mutating: false,
      list: true,
      querySchema: auditLogQuery,
      outputSchema: envelopeList(
        registerSchema(
          "AdminAuditEntry",
          z.object({
            id: nonEmpty,
            actorType: z.string(),
            actorId: z.string().nullable(),
            actorLabel: z.string().nullable(),
            action: z.string(),
            targetType: z.string().nullable(),
            targetId: z.string().nullable(),
            metadata: z.unknown(),
            createdAt: z.string(),
          }),
        ),
      ),
      handler: (ctx) => {
        requireAdminOperator(ctx);
        return listAdminAuditLog(ctx.deps, ctx.query as z.infer<typeof auditLogQuery>);
      },
    },
  ];
}
