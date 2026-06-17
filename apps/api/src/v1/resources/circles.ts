import { z } from "zod";

import { paginationQuerySchema } from "@mikoshi-tracker/contracts/envelope";
import {
  circleHabitActionResponseSchema,
  circleLeaderboardEntrySchema,
  circleMemberHabitSchema,
  circleMemberSchema,
  circleRecordSchema,
  circleSharedHabitSummarySchema,
  circleTokenCreatedResponseSchema,
  circleTokenMetaSchema,
} from "@mikoshi-tracker/contracts/circles";

import { getRequestTimestamp } from "../../shared/controller-helpers";
import {
  addCircleMember,
  circleCompleteHabit,
  circleSetHabitTotal,
  circleUndoHabit,
  createCircle,
  getCircleDetail,
  getCircleLeaderboard,
  getMemberHabitsForCircle,
  listCircleMembersForToken,
  listCircleTokensForOwner,
  listUserCircles,
  mintCircleToken,
  removeCircleMember,
  revokeCircleTokenForOwner,
  shareHabit,
  unshareHabit,
  updateCircleMember,
} from "../../modules/circles/circle.service";
import {
  configureCircleContest,
  getCircleMetricLeaderboard,
} from "../../modules/circles/circle-metric.service";
import { registerSchema } from "../apiMeta";
import { envelope, envelopeList, requireCircleId, requireUserId } from "../context";
import { paginate, sortItems } from "../shared";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const Circle = registerSchema("Circle", circleRecordSchema);
const CircleMember = registerSchema("CircleMember", circleMemberSchema);
const CircleLeaderboardEntry = registerSchema("CircleLeaderboardEntry", circleLeaderboardEntrySchema);
const CircleMemberHabit = registerSchema("CircleMemberHabit", circleMemberHabitSchema);
const CircleTokenMeta = registerSchema("CircleTokenMeta", circleTokenMetaSchema);

const nonEmpty = z.string().trim().min(1);
const circlesListQuerySchema = paginationQuerySchema.extend({
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
});
const circleIdParams = z.object({ circleId: nonEmpty });
const memberParams = z.object({ circleId: nonEmpty, userId: nonEmpty });

const createCircleInputSchema = z.object({ name: nonEmpty });
const addMemberInputSchema = z.object({
  circleId: nonEmpty,
  email: z.email(),
  externalId: nonEmpty.optional(),
});
const updateMemberInputSchema = z
  .object({
    circleId: nonEmpty,
    membershipId: nonEmpty,
    role: z.enum(["owner", "member"]).optional(),
    externalId: nonEmpty.nullable().optional(),
  })
  .refine((v) => v.role !== undefined || v.externalId !== undefined, {
    message: "At least one of role or externalId must be provided",
  });
const removeMemberInputSchema = z.object({ circleId: nonEmpty, membershipId: nonEmpty });

const contestConfigInputSchema = z
  .object({
    circleId: nonEmpty,
    contestKind: z.enum(["habit", "metric"]),
    metricEntryTypeSlug: nonEmpty.optional(),
    metricField: nonEmpty.optional(),
    metricMode: z.enum(["cumulative", "adherence", "delta"]).optional(),
    metricTarget: z.number().optional(),
    metricGoal: z.enum(["higher", "lower"]).optional(),
  })
  .refine(
    (v) =>
      v.contestKind !== "metric" ||
      (Boolean(v.metricEntryTypeSlug) && Boolean(v.metricField) && Boolean(v.metricMode)),
    { message: "metric contests require metricEntryTypeSlug, metricField and metricMode" },
  )
  .refine((v) => v.metricMode !== "adherence" || v.metricTarget !== undefined, {
    message: "adherence contests require metricTarget",
  });

const metricLeaderboardEntrySchema = z.object({
  userId: nonEmpty,
  displayName: nonEmpty,
  role: z.enum(["owner", "member"]),
  externalId: z.string().nullable(),
  rank: z.number().int().positive(),
  score: z.number(),
  mode: z.enum(["cumulative", "adherence", "delta"]),
});

const shareInputSchema = z.object({ circleId: nonEmpty, habitId: nonEmpty });
const backdateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const checkinInputSchema = z.object({ userId: nonEmpty, habitId: nonEmpty, date: backdateSchema.optional() });
const setTotalInputSchema = checkinInputSchema.extend({ total: z.number().int().nonnegative() });
const tokenMintInputSchema = z.object({ circleId: nonEmpty, label: nonEmpty.optional() });
const tokenRevokeInputSchema = z.object({ circleId: nonEmpty, tokenId: nonEmpty });

const detailOutputSchema = envelope(
  z.object({
    circle: Circle,
    members: z.array(CircleMember),
    mySharedHabits: z.array(circleSharedHabitSummarySchema),
  }),
);
const leaderboardOutputSchema = envelope(z.object({ leaderboard: z.array(CircleLeaderboardEntry) }));
const membersOutputSchema = envelope(z.object({ members: z.array(CircleMember) }));
const memberHabitsOutputSchema = envelope(z.object({ habits: z.array(CircleMemberHabit) }));
const actionOutputSchema = envelope(circleHabitActionResponseSchema);

/**
 * Circles in v1. Reads/writes scoped by a circle token use `:circleId` in the
 * path so the token is validated against the circle (`requireCircleContext`).
 * Lifecycle/ownership operations (list, detail, share, tokens) use the user's
 * bearer auth. Leaderboard stays habit-only (food/weight are personal) — see
 * [[mikoshi-friction-decisions]].
 */
export function circlesV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    // ── Bearer: list + detail ────────────────────────────────────────────────
    {
      method: "GET",
      resource: "circles",
      path: "/circles",
      operationId: "circlesList",
      summary: "List circles the caller belongs to",
      auth: "bearer",
      mutating: false,
      list: true,
      querySchema: circlesListQuerySchema,
      outputSchema: envelopeList(Circle),
      handler: async (ctx) => {
        const query = ctx.query as z.infer<typeof circlesListQuerySchema>;
        const { items } = await listUserCircles({ db: ctx.deps.sqlite }, { userId: requireUserId(ctx) });
        return paginate(sortItems(items, query), query);
      },
    },
    {
      method: "GET",
      resource: "circles",
      path: "/circles/:circleId",
      operationId: "circlesGet",
      summary: "Get a circle with members and the caller's shared habits",
      auth: "bearer",
      mutating: false,
      paramsSchema: circleIdParams,
      outputSchema: detailOutputSchema,
      handler: (ctx) =>
        getCircleDetail({ db: ctx.deps.sqlite }, {
          circleId: (ctx.params as { circleId: string }).circleId,
          userId: requireUserId(ctx),
        }),
    },
    // ── Bearer: lifecycle + member management (owner) ────────────────────────
    {
      method: "POST",
      resource: "circles",
      path: "/circles/create",
      operationId: "circlesCreate",
      summary: "Create a circle (caller becomes owner and first member)",
      auth: "bearer",
      mutating: true,
      successStatus: 201,
      inputSchema: createCircleInputSchema,
      outputSchema: envelope(z.object({ item: Circle })),
      handler: (ctx) =>
        createCircle({ db: ctx.deps.sqlite }, {
          userId: requireUserId(ctx),
          name: (ctx.input as z.infer<typeof createCircleInputSchema>).name,
        }),
    },
    {
      method: "POST",
      resource: "circles",
      path: "/circles/members/add",
      operationId: "circleMemberAdd",
      summary: "Add an existing user to a circle by email (owner only)",
      auth: "bearer",
      mutating: true,
      successStatus: 201,
      inputSchema: addMemberInputSchema,
      outputSchema: envelope(z.object({ membership: CircleMember })),
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof addMemberInputSchema>;
        return addCircleMember({ db: ctx.deps.sqlite }, {
          circleId: input.circleId,
          callerId: requireUserId(ctx),
          email: input.email,
          externalId: input.externalId,
        });
      },
    },
    {
      method: "POST",
      resource: "circles",
      path: "/circles/members/update",
      operationId: "circleMemberUpdate",
      summary: "Edit a member's role and/or externalId (owner only)",
      auth: "bearer",
      mutating: true,
      inputSchema: updateMemberInputSchema,
      outputSchema: envelope(z.object({ membership: CircleMember })),
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof updateMemberInputSchema>;
        return updateCircleMember({ db: ctx.deps.sqlite }, {
          circleId: input.circleId,
          callerId: requireUserId(ctx),
          membershipId: input.membershipId,
          role: input.role,
          externalId: input.externalId,
        });
      },
    },
    {
      method: "POST",
      resource: "circles",
      path: "/circles/members/remove",
      operationId: "circleMemberRemove",
      summary: "Remove a member from a circle (owner only; not the owner)",
      auth: "bearer",
      mutating: true,
      inputSchema: removeMemberInputSchema,
      outputSchema: envelope(z.object({})),
      handler: async (ctx) => {
        const input = ctx.input as z.infer<typeof removeMemberInputSchema>;
        await removeCircleMember({ db: ctx.deps.sqlite }, {
          circleId: input.circleId,
          callerId: requireUserId(ctx),
          membershipId: input.membershipId,
        });
        return {};
      },
    },
    {
      method: "POST",
      resource: "circles",
      path: "/circles/contest/configure",
      operationId: "circleContestConfigure",
      summary: "Configure contest scoring: habit completion or a metric (owner only)",
      auth: "bearer",
      mutating: true,
      inputSchema: contestConfigInputSchema,
      outputSchema: envelope(
        z.object({
          circle: z.object({
            id: nonEmpty,
            contestKind: z.string(),
            metricEntryTypeSlug: z.string().nullable(),
            metricField: z.string().nullable(),
            metricMode: z.string().nullable(),
            metricTarget: z.number().nullable(),
            metricGoal: z.string().nullable(),
          }),
        }),
      ),
      handler: (ctx) => {
        const { circleId, ...config } = ctx.input as z.infer<typeof contestConfigInputSchema>;
        return configureCircleContest({ sqlite: ctx.deps.sqlite }, { circleId, callerId: requireUserId(ctx), config });
      },
    },
    // ── Circle token: reads ──────────────────────────────────────────────────
    {
      method: "GET",
      resource: "circles",
      path: "/circles/:circleId/leaderboard",
      operationId: "circleLeaderboard",
      summary: "Per-member standings over shared habits (circle token)",
      auth: "circle",
      mutating: false,
      paramsSchema: circleIdParams,
      outputSchema: leaderboardOutputSchema,
      handler: (ctx) =>
        getCircleLeaderboard({ db: ctx.deps.sqlite }, { circleId: requireCircleId(ctx), timestamp: getRequestTimestamp(ctx.request) }),
    },
    {
      method: "GET",
      resource: "circles",
      path: "/circles/:circleId/metric-leaderboard",
      operationId: "circleMetricLeaderboard",
      summary: "Metric-contest standings (kcal/weight/steps) — circle token",
      auth: "circle",
      mutating: false,
      paramsSchema: circleIdParams,
      outputSchema: envelope(z.object({ leaderboard: z.array(metricLeaderboardEntrySchema) })),
      handler: (ctx) =>
        getCircleMetricLeaderboard({ sqlite: ctx.deps.sqlite }, {
          circleId: requireCircleId(ctx),
          timestamp: getRequestTimestamp(ctx.request),
        }),
    },
    {
      method: "GET",
      resource: "circles",
      path: "/circles/:circleId/members",
      operationId: "circleMembers",
      summary: "List circle members (circle token)",
      auth: "circle",
      mutating: false,
      paramsSchema: circleIdParams,
      outputSchema: membersOutputSchema,
      handler: (ctx) => listCircleMembersForToken({ db: ctx.deps.sqlite }, { circleId: requireCircleId(ctx) }),
    },
    {
      method: "GET",
      resource: "circles",
      path: "/circles/:circleId/members/:userId/habits",
      operationId: "circleMemberHabits",
      summary: "A member's shared habits with today's state (circle token)",
      auth: "circle",
      mutating: false,
      paramsSchema: memberParams,
      outputSchema: memberHabitsOutputSchema,
      handler: (ctx) =>
        getMemberHabitsForCircle({ db: ctx.deps.sqlite }, {
          circleId: requireCircleId(ctx),
          userId: (ctx.params as { userId: string }).userId,
          timestamp: getRequestTimestamp(ctx.request),
        }),
    },
    // ── Circle token: check-in writes ────────────────────────────────────────
    {
      method: "POST",
      resource: "circles",
      path: "/circles/:circleId/complete",
      operationId: "circleComplete",
      summary: "Complete a member's shared habit (circle token, source: circle)",
      auth: "circle",
      mutating: true,
      paramsSchema: circleIdParams,
      inputSchema: checkinInputSchema,
      outputSchema: actionOutputSchema,
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof checkinInputSchema>;
        return circleCompleteHabit({ db: ctx.deps.sqlite }, {
          circleId: requireCircleId(ctx),
          userId: input.userId,
          habitId: input.habitId,
          timestamp: getRequestTimestamp(ctx.request),
          date: input.date,
        });
      },
    },
    {
      method: "POST",
      resource: "circles",
      path: "/circles/:circleId/set-total",
      operationId: "circleSetTotal",
      summary: "Set a member's quantity habit total (circle token)",
      auth: "circle",
      mutating: true,
      paramsSchema: circleIdParams,
      inputSchema: setTotalInputSchema,
      outputSchema: actionOutputSchema,
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof setTotalInputSchema>;
        return circleSetHabitTotal({ db: ctx.deps.sqlite }, {
          circleId: requireCircleId(ctx),
          userId: input.userId,
          habitId: input.habitId,
          total: input.total,
          timestamp: getRequestTimestamp(ctx.request),
          date: input.date,
        });
      },
    },
    {
      method: "POST",
      resource: "circles",
      path: "/circles/:circleId/undo",
      operationId: "circleUndo",
      summary: "Undo the day's circle-sourced check-in for a member (circle token)",
      auth: "circle",
      mutating: true,
      paramsSchema: circleIdParams,
      inputSchema: checkinInputSchema,
      outputSchema: actionOutputSchema,
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof checkinInputSchema>;
        return circleUndoHabit({ db: ctx.deps.sqlite }, {
          circleId: requireCircleId(ctx),
          userId: input.userId,
          habitId: input.habitId,
          timestamp: getRequestTimestamp(ctx.request),
          date: input.date,
        });
      },
    },
    // ── Bearer: habit sharing ────────────────────────────────────────────────
    {
      method: "POST",
      resource: "circles",
      path: "/circles/share",
      operationId: "circleShare",
      summary: "Share one of the caller's habits into a circle",
      auth: "bearer",
      mutating: true,
      successStatus: 201,
      inputSchema: shareInputSchema,
      outputSchema: envelope(
        z.object({ habitId: nonEmpty, circleId: nonEmpty, createdAt: nonEmpty }),
      ),
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof shareInputSchema>;
        return shareHabit({ db: ctx.deps.sqlite }, { circleId: input.circleId, callerId: requireUserId(ctx), habitId: input.habitId });
      },
    },
    {
      method: "POST",
      resource: "circles",
      path: "/circles/unshare",
      operationId: "circleUnshare",
      summary: "Remove a shared habit from a circle",
      auth: "bearer",
      mutating: true,
      inputSchema: shareInputSchema,
      outputSchema: envelope(z.object({})),
      handler: async (ctx) => {
        const input = ctx.input as z.infer<typeof shareInputSchema>;
        await unshareHabit({ db: ctx.deps.sqlite }, { circleId: input.circleId, callerId: requireUserId(ctx), habitId: input.habitId });
        return {};
      },
    },
    // ── Bearer: circle tokens (owner only) ───────────────────────────────────
    {
      method: "POST",
      resource: "circles",
      path: "/circles/token/mint",
      operationId: "circleTokenMint",
      summary: "Mint a circle token (owner only; plain token returned once)",
      auth: "bearer",
      mutating: true,
      successStatus: 201,
      inputSchema: tokenMintInputSchema,
      outputSchema: envelope(circleTokenCreatedResponseSchema),
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof tokenMintInputSchema>;
        return mintCircleToken({ db: ctx.deps.sqlite }, { circleId: input.circleId, callerId: requireUserId(ctx), label: input.label });
      },
    },
    {
      method: "GET",
      resource: "circles",
      path: "/circles/:circleId/tokens",
      operationId: "circleTokenList",
      summary: "List circle token metadata (owner only; values never returned)",
      auth: "bearer",
      mutating: false,
      paramsSchema: circleIdParams,
      outputSchema: envelope(z.object({ tokens: z.array(CircleTokenMeta) })),
      handler: (ctx) =>
        listCircleTokensForOwner({ db: ctx.deps.sqlite }, {
          circleId: (ctx.params as { circleId: string }).circleId,
          callerId: requireUserId(ctx),
        }),
    },
    {
      method: "POST",
      resource: "circles",
      path: "/circles/token/revoke",
      operationId: "circleTokenRevoke",
      summary: "Revoke a circle token (owner only)",
      auth: "bearer",
      mutating: true,
      inputSchema: tokenRevokeInputSchema,
      outputSchema: envelope(z.object({})),
      handler: async (ctx) => {
        const input = ctx.input as z.infer<typeof tokenRevokeInputSchema>;
        await revokeCircleTokenForOwner({ db: ctx.deps.sqlite }, {
          circleId: input.circleId,
          callerId: requireUserId(ctx),
          tokenId: input.tokenId,
        });
        return {};
      },
    },
  ];
}
