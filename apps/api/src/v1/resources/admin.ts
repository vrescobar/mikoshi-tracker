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
  createCircleLeaderboardSnapshot,
  listCircleLeaderboardSnapshots,
} from "../../modules/circles/circle-snapshot.service";
import { getRequestTimestamp } from "../../shared/controller-helpers";
import { registerSchema } from "../apiMeta";
import { envelope, envelopeList, envelopeOne } from "../context";
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
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof snapshotCreateInput>;
        return createCircleLeaderboardSnapshot(ctx.deps, {
          circleId: input.circleId,
          season: input.season,
          timestamp: getRequestTimestamp(ctx.request),
        });
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
  ];
}
