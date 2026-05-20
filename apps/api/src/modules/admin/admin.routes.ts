import type { FastifyInstance } from "fastify";

import {
  badRequestErrorSchema,
  commonNotFoundResponse,
  unauthorizedErrorSchema,
} from "@haaabit/contracts/api";
import {
  adminCirclePathParamsSchema,
  enrollMemberInputSchema,
  enrollMemberResponseSchema,
  provisionUserInputSchema,
  provisionUserExistsResponseSchema,
  provisionUserCreatedResponseSchema,
  resetProvisionedTokenInputSchema,
  resetProvisionedTokenResponseSchema,
  serviceUnavailableErrorSchema,
} from "@haaabit/contracts/admin";

import {
  enrollMemberByExternalIdHandler,
  provisionUserHandler,
  resetProvisionedTokenHandler,
} from "./admin.controller";
import type { PublicApiRouteDefinition } from "../../plugins/openapi";

const serviceUnavailableResponse = {
  description: "Admin provisioning API is disabled (HAAABIT_ADMIN_API_KEY not configured).",
  schema: serviceUnavailableErrorSchema,
  examples: {
    disabled: {
      summary: "Feature disabled",
      value: {
        code: "SERVICE_UNAVAILABLE",
        message: "Admin provisioning API is disabled (HAAABIT_ADMIN_API_KEY not set)",
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
      "Creates an API-only user identified by an opaque externalId, bypassing registration settings. If the user already exists, returns the existing userId without re-issuing a token. Requires the HAAABIT_ADMIN_API_KEY system key.",
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
              personalToken: "haaabit_aabbccdd...",
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
      "Rotates the personal API token of a user identified by externalId. Returns the new token, shown once. Requires the HAAABIT_ADMIN_API_KEY system key.",
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
            value: { userId: "user_abc123", personalToken: "haaabit_aabbccdd..." },
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
      "Resolves a provisioned user by their externalId and creates a CircleMembership with role 'member'. Idempotent: if the user is already a member the existing membership is returned (200). Requires the HAAABIT_ADMIN_API_KEY system key. The circle token cannot add members.",
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
];

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post("/api/admin/provision-user", provisionUserHandler);
  app.post("/api/admin/provision-user/reset-token", resetProvisionedTokenHandler);
  app.post("/api/admin/circles/:circleId/members", enrollMemberByExternalIdHandler);
}
