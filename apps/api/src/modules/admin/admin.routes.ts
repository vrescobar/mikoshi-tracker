import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  badRequestErrorSchema,
  commonNotFoundResponse,
  unauthorizedErrorSchema,
} from "@mikoshi-tracker/contracts/api";
import {
  adminCircleSchema,
  adminCirclePathParamsSchema,
  assignHabitInputSchema,
  assignHabitResponseSchema,
  bulkEnrollInputSchema,
  bulkEnrollResponseSchema,
  createCircleInputSchema,
  createCircleResponseSchema,
  enrollMemberInputSchema,
  enrollMemberResponseSchema,
  provisionUserInputSchema,
  provisionUserExistsResponseSchema,
  provisionUserCreatedResponseSchema,
  resetProvisionedTokenInputSchema,
  resetProvisionedTokenResponseSchema,
  serviceUnavailableErrorSchema,
  updateCircleInputSchema,
} from "@mikoshi-tracker/contracts/admin";

import {
  adminLoginAsHandler,
  assignHabitAdminHandler,
  attachExternalIdHandler,
  bulkEnrollAdminHandler,
  consumeMagicLinkHandler,
  createCircleAdminHandler,
  enrollMemberByExternalIdHandler,
  getCircleAdminHandler,
  issueMagicLinkHandler,
  magicLinkRedirectHandler,
  mergeUsersHandler,
  provisionUserHandler,
  resetProvisionedTokenHandler,
  updateCircleAdminHandler,
} from "./admin.controller";
import type { PublicApiRouteDefinition } from "../../plugins/openapi";

const adminCircleEnvelopeSchema = z.object({ circle: adminCircleSchema });

const serviceUnavailableResponse = {
  description: "Admin provisioning API is disabled (MIKOSHI_TRACKER_ADMIN_API_KEY not configured).",
  schema: serviceUnavailableErrorSchema,
  examples: {
    disabled: {
      summary: "Feature disabled",
      value: {
        code: "SERVICE_UNAVAILABLE",
        message: "Admin provisioning API is disabled (MIKOSHI_TRACKER_ADMIN_API_KEY not set)",
      },
    },
  },
} as const;

const adminUnauthorizedResponse = {
  description: "Missing or invalid admin API key.",
  schema: unauthorizedErrorSchema,
  examples: {
    unauthenticated: {
      summary: "Key required",
      value: { code: "UNAUTHORIZED", message: "Admin API key required" },
    },
  },
} as const;

export const adminApiRouteDefinitions: PublicApiRouteDefinition[] = [
  {
    method: "POST",
    path: "/api/admin/provision-user",
    operationId: "provisionUser",
    summary: "Provision a user",
    description:
      "Creates an API-only user identified by an opaque externalId, bypassing registration settings. If the user already exists, returns the existing userId without re-issuing a token. Requires the MIKOSHI_TRACKER_ADMIN_API_KEY system key.",
    tags: ["Admin"],
    security: [{ AdminKeyAuth: [] }],
    request: {
      body: provisionUserInputSchema,
      bodyExamples: {
        newUser: {
          summary: "New provisioned user",
          value: {
            externalId: "mikoshi-identity-abc123",
            name: "Alice",
            timezone: "Europe/Madrid",
          },
        },
      },
    },
    responses: {
      200: {
        description: "User already existed — existing userId returned, token not re-issued.",
        schema: provisionUserExistsResponseSchema,
        examples: {
          existingUser: {
            summary: "Already provisioned",
            value: { userId: "user_abc123", alreadyExists: true },
          },
        },
      },
      201: {
        description: "New user created — personalToken returned once and not re-issuable via this endpoint.",
        schema: provisionUserCreatedResponseSchema,
        examples: {
          createdUser: {
            summary: "Freshly provisioned",
            value: {
              userId: "user_abc123",
              personalToken: "mikoshi_tracker_aabbccdd...",
              alreadyExists: false,
            },
          },
        },
      },
      400: {
        description: "Invalid request payload.",
        schema: badRequestErrorSchema,
        examples: {
          invalid: {
            summary: "Missing externalId",
            value: {
              code: "BAD_REQUEST",
              message: "Invalid request payload",
              issues: { formErrors: [], fieldErrors: { externalId: ["Required"] } },
            },
          },
        },
      },
      401: adminUnauthorizedResponse,
      503: serviceUnavailableResponse,
    },
  },
  {
    method: "POST",
    path: "/api/admin/provision-user/reset-token",
    operationId: "resetProvisionedToken",
    summary: "Rotate a provisioned user's token",
    description:
      "Rotates the personal API token of a user identified by externalId. Returns the new token, shown once. Requires the MIKOSHI_TRACKER_ADMIN_API_KEY system key.",
    tags: ["Admin"],
    security: [{ AdminKeyAuth: [] }],
    request: {
      body: resetProvisionedTokenInputSchema,
      bodyExamples: {
        reset: {
          summary: "Reset by externalId",
          value: { externalId: "mikoshi-identity-abc123" },
        },
      },
    },
    responses: {
      200: {
        description: "Token rotated — new personalToken returned once.",
        schema: resetProvisionedTokenResponseSchema,
        examples: {
          rotated: {
            summary: "Token rotated",
            value: { userId: "user_abc123", personalToken: "mikoshi_tracker_aabbccdd..." },
          },
        },
      },
      400: {
        description: "Invalid request payload.",
        schema: badRequestErrorSchema,
        examples: {
          invalid: {
            summary: "Missing externalId",
            value: {
              code: "BAD_REQUEST",
              message: "Invalid request payload",
              issues: { formErrors: [], fieldErrors: { externalId: ["Required"] } },
            },
          },
        },
      },
      401: adminUnauthorizedResponse,
      404: commonNotFoundResponse,
      503: serviceUnavailableResponse,
    },
  },
  {
    method: "POST",
    path: "/api/admin/circles/:circleId/members",
    operationId: "enrollCircleMemberByExternalId",
    summary: "Enrol a member in a circle by externalId",
    description:
      "Resolves a provisioned user by their externalId and creates a CircleMembership with role 'member'. Idempotent: if the user is already a member the existing membership is returned (200). Requires the MIKOSHI_TRACKER_ADMIN_API_KEY system key. The circle token cannot add members.",
    tags: ["Admin"],
    security: [{ AdminKeyAuth: [] }],
    request: {
      params: adminCirclePathParamsSchema,
      body: enrollMemberInputSchema,
      bodyExamples: {
        enrol: {
          summary: "Enrol by externalId",
          value: { externalId: "mikoshi-identity-abc123" },
        },
      },
    },
    responses: {
      200: {
        description: "User was already a member — existing membership returned.",
        schema: enrollMemberResponseSchema,
        examples: {
          existing: {
            summary: "Already enrolled",
            value: {
              membershipId: "mem_abc123",
              userId: "user_abc123",
              externalId: "mikoshi-identity-abc123",
            },
          },
        },
      },
      201: {
        description: "New CircleMembership created.",
        schema: enrollMemberResponseSchema,
        examples: {
          created: {
            summary: "Freshly enrolled",
            value: {
              membershipId: "mem_abc123",
              userId: "user_abc123",
              externalId: "mikoshi-identity-abc123",
            },
          },
        },
      },
      400: {
        description: "Invalid request payload.",
        schema: badRequestErrorSchema,
        examples: {
          invalid: {
            summary: "Missing externalId",
            value: {
              code: "BAD_REQUEST",
              message: "Invalid request payload",
              issues: { formErrors: [], fieldErrors: { externalId: ["Required"] } },
            },
          },
        },
      },
      401: adminUnauthorizedResponse,
      404: commonNotFoundResponse,
      503: serviceUnavailableResponse,
    },
  },
  {
    method: "POST",
    path: "/api/admin/circles",
    operationId: "createCircleAdmin",
    summary: "Create a contest circle",
    description:
      "Creates a circle owned by a provisioned user (resolved by ownerExternalId) with optional contest window/season, and mints a read-only circle token (returned once). Requires the admin key.",
    tags: ["Admin"],
    security: [{ AdminKeyAuth: [] }],
    request: { body: createCircleInputSchema },
    responses: {
      201: { description: "Circle created.", schema: createCircleResponseSchema },
      400: { description: "Invalid request payload.", schema: badRequestErrorSchema },
      401: adminUnauthorizedResponse,
      404: commonNotFoundResponse,
      503: serviceUnavailableResponse,
    },
  },
  {
    method: "GET",
    path: "/api/admin/circles/:circleId",
    operationId: "getCircleAdmin",
    summary: "Get contest circle detail",
    description: "Returns a circle's lifecycle fields and member count. Requires the admin key.",
    tags: ["Admin"],
    security: [{ AdminKeyAuth: [] }],
    request: { params: adminCirclePathParamsSchema },
    responses: {
      200: { description: "Circle detail.", schema: adminCircleEnvelopeSchema },
      401: adminUnauthorizedResponse,
      404: commonNotFoundResponse,
      503: serviceUnavailableResponse,
    },
  },
  {
    method: "PATCH",
    path: "/api/admin/circles/:circleId",
    operationId: "updateCircleAdmin",
    summary: "Update contest lifecycle",
    description:
      "Patches a circle's status (active/closed/archived), contest window, season, or leaderboard mode. Requires the admin key.",
    tags: ["Admin"],
    security: [{ AdminKeyAuth: [] }],
    request: { params: adminCirclePathParamsSchema, body: updateCircleInputSchema },
    responses: {
      200: { description: "Circle updated.", schema: adminCircleEnvelopeSchema },
      400: { description: "Invalid request payload.", schema: badRequestErrorSchema },
      401: adminUnauthorizedResponse,
      404: commonNotFoundResponse,
      503: serviceUnavailableResponse,
    },
  },
  {
    method: "POST",
    path: "/api/admin/circles/:circleId/members/bulk",
    operationId: "bulkEnrollCircleMembers",
    summary: "Bulk-enrol members by externalId",
    description:
      "Enrols many provisioned users into a circle in one call. Idempotent; reports which externalIds were added, already members, or not yet provisioned. Requires the admin key.",
    tags: ["Admin"],
    security: [{ AdminKeyAuth: [] }],
    request: { params: adminCirclePathParamsSchema, body: bulkEnrollInputSchema },
    responses: {
      200: { description: "Bulk enrol result.", schema: bulkEnrollResponseSchema },
      400: { description: "Invalid request payload.", schema: badRequestErrorSchema },
      401: adminUnauthorizedResponse,
      404: commonNotFoundResponse,
      503: serviceUnavailableResponse,
    },
  },
  {
    method: "POST",
    path: "/api/admin/circles/:circleId/assign-habit",
    operationId: "assignHabitToCircleMember",
    summary: "Assign a habit to a circle member",
    description:
      "Assigns a habit to a member on the operator's behalf: either creates a new habit as the user and shares it into the circle (`habit`), or shares an existing habit owned by the user (`habitId`). The share step is idempotent. Requires the admin key.",
    tags: ["Admin"],
    security: [{ AdminKeyAuth: [] }],
    request: { params: adminCirclePathParamsSchema, body: assignHabitInputSchema },
    responses: {
      200: { description: "Habit shared into the circle.", schema: assignHabitResponseSchema },
      201: { description: "Habit created and shared into the circle.", schema: assignHabitResponseSchema },
      400: { description: "Invalid payload or user is not a member.", schema: badRequestErrorSchema },
      401: adminUnauthorizedResponse,
      404: commonNotFoundResponse,
      503: serviceUnavailableResponse,
    },
  },
];

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post("/api/admin/provision-user", provisionUserHandler);
  app.post("/api/admin/provision-user/reset-token", resetProvisionedTokenHandler);
  app.post("/api/admin/circles", createCircleAdminHandler);
  app.get("/api/admin/circles/:circleId", getCircleAdminHandler);
  app.patch("/api/admin/circles/:circleId", updateCircleAdminHandler);
  app.post("/api/admin/circles/:circleId/members/bulk", bulkEnrollAdminHandler);
  app.post("/api/admin/circles/:circleId/members", enrollMemberByExternalIdHandler);
  app.post("/api/admin/circles/:circleId/assign-habit", assignHabitAdminHandler);
  // User consolidation + God Mode (admin-key gated).
  app.post("/api/admin/users/merge", mergeUsersHandler);
  app.post("/api/admin/users/attach-external-id", attachExternalIdHandler);
  app.post("/api/admin/login-as", adminLoginAsHandler);
  // Magic-link issuance is admin-gated (creates a single-use login URL).
  app.post("/api/admin/issue-magic-link", issueMagicLinkHandler);
  // Consumption is public — the URL token IS the credential. Single-use
  // `consumedAt` write makes the URL non-replayable; 32 random bytes of
  // entropy make brute force infeasible.
  app.post("/api/auth/magic-link/consume", consumeMagicLinkHandler);
  // Browser-facing landing route for issued magic links. The URL shape
  // `{base}/magic?t=...` is a contract with the Mikoshi WhatsApp bot — links
  // already sent in chat history must keep working.
  app.get("/magic", magicLinkRedirectHandler);
}
