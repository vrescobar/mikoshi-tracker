import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { commonAuthErrorResponses, commonNotFoundResponse } from "@mikoshi-tracker/contracts/api";
import {
  addCircleMemberInputSchema,
  circleDetailResponseSchema,
  circleHabitActionResponseSchema,
  circleItemResponseSchema,
  circleLeaderboardResponseSchema,
  circleMemberHabitPathParamsSchema,
  circleMemberHabitsResponseSchema,
  circleMemberPathParamsSchema,
  circleMembershipPathParamsSchema,
  circleMembershipResponseSchema,
  circleMembersResponseSchema,
  circleListResponseSchema,
  circlePathParamsSchema,
  circleSetTotalInputSchema,
  circleSharePathParamsSchema,
  circleTokenCreatedResponseSchema,
  circleTokenListResponseSchema,
  circleTokenPathParamsSchema,
  createCircleInputSchema,
  createCircleTokenInputSchema,
  shareHabitInputSchema,
  undoNotCircleSourcedErrorSchema,
  updateCircleMemberInputSchema,
} from "@mikoshi-tracker/contracts/circles";

import type { PublicApiRouteDefinition } from "../../plugins/openapi";
import {
  addCircleMemberHandler,
  circleCompleteHabitHandler,
  circleSetHabitTotalHandler,
  circleUndoHabitHandler,
  createCircleHandler,
  createCircleTokenHandler,
  getCircleDetailHandler,
  getCircleLeaderboardHandler,
  getMemberHabitsHandler,
  listCircleMembersHandler,
  listCirclesHandler,
  listCircleTokensHandler,
  removeCircleMemberHandler,
  revokeCircleTokenHandler,
  shareHabitHandler,
  unshareHabitHandler,
  updateCircleMemberHandler,
} from "./circle.controller";

const emptyResponseSchema = z.object({});

const habitInactiveCircleResponse = {
  description: "The habit is archived and cannot receive check-ins.",
  schema: z.object({ code: z.literal("HABIT_INACTIVE"), message: z.string() }),
  examples: {
    archivedHabit: {
      summary: "Archived habit",
      value: { code: "HABIT_INACTIVE", message: "Archived habits are read-only until restored" },
    },
  },
} as const;

export const circleApiRouteDefinitions: PublicApiRouteDefinition[] = [
  // ── Circle-token-authenticated: reads ────────────────────────────────────────
  {
    method: "GET",
    path: "/api/circles/:circleId/members",
    operationId: "listCircleMembers",
    summary: "List circle members",
    description: "Returns every member of the circle. Requires a circle-scoped bearer token.",
    tags: ["Circles"],
    security: [{ CircleBearerAuth: [] }],
    request: { params: circlePathParamsSchema },
    responses: {
      200: { description: "All circle members.", schema: circleMembersResponseSchema },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/circles/:circleId/leaderboard",
    operationId: "getCircleLeaderboard",
    summary: "Get circle leaderboard",
    description:
      "Returns per-member stats computed over shared habits only: completed today, current streak, weekly completion rate. Requires a circle token.",
    tags: ["Circles"],
    security: [{ CircleBearerAuth: [] }],
    request: { params: circlePathParamsSchema },
    responses: {
      200: { description: "Leaderboard ranked by completion.", schema: circleLeaderboardResponseSchema },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/circles/:circleId/members/:userId/habits",
    operationId: "getCircleMemberHabits",
    summary: "Get member's shared habits",
    description:
      "Returns only the habits the member has shared into this circle, with today's state. Un-shared habits are never included. Requires a circle token.",
    tags: ["Circles"],
    security: [{ CircleBearerAuth: [] }],
    request: { params: circleMemberPathParamsSchema },
    responses: {
      200: { description: "The member's shared habits with today's state.", schema: circleMemberHabitsResponseSchema },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  // ── Circle-token-authenticated: writes ───────────────────────────────────────
  {
    method: "POST",
    path: "/api/circles/:circleId/members/:userId/habits/:habitId/complete",
    operationId: "circleCompleteHabit",
    summary: "Complete a habit (circle)",
    description:
      "Records a boolean check-in for the member's shared habit. Requires a circle token. The mutation is recorded with source: 'circle'.",
    tags: ["Circles"],
    security: [{ CircleBearerAuth: [] }],
    request: { params: circleMemberHabitPathParamsSchema },
    responses: {
      200: { description: "The updated habit state.", schema: circleHabitActionResponseSchema },
      404: commonNotFoundResponse,
      409: habitInactiveCircleResponse,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "POST",
    path: "/api/circles/:circleId/members/:userId/habits/:habitId/set-total",
    operationId: "circleSetHabitTotal",
    summary: "Set habit total (circle)",
    description:
      "Sets a quantity check-in value for the member's shared habit. Requires a circle token. The mutation is recorded with source: 'circle'.",
    tags: ["Circles"],
    security: [{ CircleBearerAuth: [] }],
    request: {
      params: circleMemberHabitPathParamsSchema,
      body: circleSetTotalInputSchema,
      bodyExamples: {
        setPages: { summary: "Set daily reading total", value: { total: 15 } },
      },
    },
    responses: {
      200: { description: "The updated habit state.", schema: circleHabitActionResponseSchema },
      404: commonNotFoundResponse,
      409: habitInactiveCircleResponse,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "POST",
    path: "/api/circles/:circleId/members/:userId/habits/:habitId/undo",
    operationId: "circleUndoHabit",
    summary: "Undo last circle check-in",
    description:
      "Undoes the day's latest check-in for the member's habit — only if that mutation was written by a circle token. Returns 409 UNDO_NOT_CIRCLE_SOURCED if the latest mutation came from a personal-token or web session.",
    tags: ["Circles"],
    security: [{ CircleBearerAuth: [] }],
    request: { params: circleMemberHabitPathParamsSchema },
    responses: {
      200: { description: "The habit state after undo.", schema: circleHabitActionResponseSchema },
      404: commonNotFoundResponse,
      409: {
        description: "The latest mutation was not circle-sourced; undo is refused to avoid touching the user's own history.",
        schema: undoNotCircleSourcedErrorSchema,
        examples: {
          webMutation: {
            summary: "Latest mutation is web-sourced",
            value: { code: "UNDO_NOT_CIRCLE_SOURCED", message: "The latest mutation was not created by a circle token" },
          },
        },
      },
      ...commonAuthErrorResponses,
    },
  },
  // ── Session-authenticated: circle lifecycle ───────────────────────────────────
  {
    method: "POST",
    path: "/api/circles",
    operationId: "createCircle",
    summary: "Create a circle",
    description:
      "Creates a new circle. The authenticated user becomes the owner and first member.",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    request: {
      body: createCircleInputSchema,
      bodyExamples: {
        newCircle: { summary: "Morning crew", value: { name: "Morning Crew" } },
      },
    },
    responses: {
      201: { description: "The created circle.", schema: circleItemResponseSchema },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/circles",
    operationId: "listCircles",
    summary: "List circles",
    description: "Returns circles the authenticated user belongs to (as owner or member).",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: { description: "The user's circles.", schema: circleListResponseSchema },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/circles/:circleId",
    operationId: "getCircleDetail",
    summary: "Get circle detail",
    description:
      "Returns the circle record, all members, and the authenticated user's own shared habits. Only accessible to circle members.",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    request: { params: circlePathParamsSchema },
    responses: {
      200: { description: "Circle detail with members and the user's shared habits.", schema: circleDetailResponseSchema },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  // ── Session-authenticated: member management (owner only) ─────────────────────
  {
    method: "POST",
    path: "/api/circles/:circleId/members",
    operationId: "addCircleMember",
    summary: "Add a circle member",
    description:
      "Adds an existing MikoshiTracker user to the circle by email (owner only). Optionally sets an externalId for integration purposes.",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    request: {
      params: circlePathParamsSchema,
      body: addCircleMemberInputSchema,
      bodyExamples: {
        addByEmail: { summary: "Add by email", value: { email: "alice@example.com" } },
        addWithExternalId: {
          summary: "Add with external identity",
          value: { email: "bob@example.com", externalId: "bob.whatsapp.id" },
        },
      },
    },
    responses: {
      201: { description: "The created membership.", schema: circleMembershipResponseSchema },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "PATCH",
    path: "/api/circles/:circleId/members/:membershipId",
    operationId: "updateCircleMember",
    summary: "Update a circle member",
    description:
      "Edits the member's role and/or externalId (owner only). At least one field must be present.",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    request: {
      params: circleMembershipPathParamsSchema,
      body: updateCircleMemberInputSchema,
      bodyExamples: {
        setExternalId: { summary: "Link to WhatsApp identity", value: { externalId: "jid@s.whatsapp.net" } },
      },
    },
    responses: {
      200: { description: "The updated membership.", schema: circleMembershipResponseSchema },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "DELETE",
    path: "/api/circles/:circleId/members/:membershipId",
    operationId: "removeCircleMember",
    summary: "Remove a circle member",
    description:
      "Removes the member from the circle (owner only). The owner cannot remove themselves. Shared habit rows are cascade-deleted.",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    request: { params: circleMembershipPathParamsSchema },
    responses: {
      204: { description: "Member removed successfully.", schema: emptyResponseSchema },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  // ── Session-authenticated: habit sharing (any member) ────────────────────────
  {
    method: "POST",
    path: "/api/circles/:circleId/shares",
    operationId: "shareHabit",
    summary: "Share a habit into a circle",
    description:
      "Shares one of the authenticated user's own habits into the circle. Once shared, the habit is visible to the circle token and to leaderboard reads. The habit must belong to the authenticated user.",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    request: {
      params: circlePathParamsSchema,
      body: shareHabitInputSchema,
      bodyExamples: {
        shareHabit: { summary: "Share a habit", value: { habitId: "habit_abc123" } },
      },
    },
    responses: {
      201: { description: "Habit successfully shared.", schema: emptyResponseSchema },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "DELETE",
    path: "/api/circles/:circleId/shares/:habitId",
    operationId: "unshareHabit",
    summary: "Unshare a habit from a circle",
    description:
      "Removes the habit from the circle's shared set. The habit must be owned by the authenticated user. Historical check-in data is preserved.",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    request: { params: circleSharePathParamsSchema },
    responses: {
      204: { description: "Habit unshared successfully.", schema: emptyResponseSchema },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
  // ── Session-authenticated: circle tokens (owner only) ────────────────────────
  {
    method: "POST",
    path: "/api/circles/:circleId/tokens",
    operationId: "createCircleToken",
    summary: "Mint a circle token",
    description:
      "Creates a new circle-scoped bearer token (owner only). The plain token is returned exactly once — store it immediately. The token grants read access to shared habits and write access to check-ins for the whole circle.",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    request: {
      params: circlePathParamsSchema,
      body: createCircleTokenInputSchema,
      bodyExamples: {
        withLabel: { summary: "Labelled token for a bot", value: { label: "Mikoshi bridge" } },
      },
    },
    responses: {
      201: {
        description: "The plain token (returned once) and metadata.",
        schema: circleTokenCreatedResponseSchema,
        examples: {
          created: {
            summary: "Minted token",
            value: {
              token: "mikoshi_tracker_circle_abc123...",
              tokenId: "tok_xyz",
              label: "Mikoshi bridge",
              createdAt: "2026-05-18T10:00:00.000Z",
            },
          },
        },
      },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/circles/:circleId/tokens",
    operationId: "listCircleTokens",
    summary: "List circle tokens",
    description: "Returns metadata for all circle tokens (owner only). Token values are never returned after creation.",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    request: { params: circlePathParamsSchema },
    responses: {
      200: { description: "Token metadata list (no values).", schema: circleTokenListResponseSchema },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "DELETE",
    path: "/api/circles/:circleId/tokens/:tokenId",
    operationId: "revokeCircleToken",
    summary: "Revoke a circle token",
    description:
      "Permanently revokes the circle token (owner only). Any request made with the revoked token will fail with 401 immediately.",
    tags: ["Circles"],
    security: [{ BearerAuth: [] }],
    request: { params: circleTokenPathParamsSchema },
    responses: {
      204: { description: "Token revoked successfully.", schema: emptyResponseSchema },
      404: commonNotFoundResponse,
      ...commonAuthErrorResponses,
    },
  },
];

export async function registerCircleRoutes(app: FastifyInstance) {
  // ── Circle-token-authenticated routes ──────────────────────────────────────
  app.get("/api/circles/:circleId/members", listCircleMembersHandler);
  app.get("/api/circles/:circleId/leaderboard", getCircleLeaderboardHandler);
  app.get("/api/circles/:circleId/members/:userId/habits", getMemberHabitsHandler);
  app.post(
    "/api/circles/:circleId/members/:userId/habits/:habitId/complete",
    circleCompleteHabitHandler,
  );
  app.post(
    "/api/circles/:circleId/members/:userId/habits/:habitId/set-total",
    circleSetHabitTotalHandler,
  );
  app.post(
    "/api/circles/:circleId/members/:userId/habits/:habitId/undo",
    circleUndoHabitHandler,
  );

  // ── Session-authenticated management routes ───────────────────────────────
  app.post("/api/circles", createCircleHandler);
  app.get("/api/circles", listCirclesHandler);
  app.get("/api/circles/:circleId", getCircleDetailHandler);
  app.post("/api/circles/:circleId/members", addCircleMemberHandler);
  app.patch("/api/circles/:circleId/members/:membershipId", updateCircleMemberHandler);
  app.delete("/api/circles/:circleId/members/:membershipId", removeCircleMemberHandler);
  app.post("/api/circles/:circleId/shares", shareHabitHandler);
  app.delete("/api/circles/:circleId/shares/:habitId", unshareHabitHandler);
  app.post("/api/circles/:circleId/tokens", createCircleTokenHandler);
  app.get("/api/circles/:circleId/tokens", listCircleTokensHandler);
  app.delete("/api/circles/:circleId/tokens/:tokenId", revokeCircleTokenHandler);
}
