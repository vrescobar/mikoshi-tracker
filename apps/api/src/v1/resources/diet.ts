import { z } from "zod";

import {
  dietGoalInputSchema,
  dietGoalResponseSchema,
  dietPreferencesResponseSchema,
  dietPreferencesSchema,
} from "@mikoshi-tracker/contracts/diet";

import { getRequestTimestamp } from "../../shared/controller-helpers";
import {
  getDietPreferences,
  resolveActiveDietGoal,
  setDietGoal,
  setDietPreferences,
} from "../../modules/diet/diet.service";
import { registerSchema } from "../apiMeta";
import { envelope, requireUserId } from "../context";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const DietGoalResponse = registerSchema("DietGoalResponse", dietGoalResponseSchema);
const DietPreferencesResponse = registerSchema("DietPreferencesResponse", dietPreferencesResponseSchema);

export function dietV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "diet",
      path: "/diet/goal",
      operationId: "dietGoalGet",
      summary: "Get the caller's active diet goal (latest revision, or null)",
      auth: "bearer",
      mutating: false,
      outputSchema: envelope(DietGoalResponse),
      handler: async (ctx) => ({ goal: await resolveActiveDietGoal(ctx.deps, requireUserId(ctx)) }),
    },
    {
      method: "POST",
      resource: "diet",
      path: "/diet/goal",
      operationId: "dietGoalSet",
      summary: "Set the caller's diet goal (appends a dated revision)",
      auth: "bearer",
      mutating: true,
      inputSchema: dietGoalInputSchema,
      outputSchema: envelope(DietGoalResponse),
      handler: async (ctx) => ({
        goal: await setDietGoal(ctx.deps, {
          userId: requireUserId(ctx),
          input: ctx.input as z.infer<typeof dietGoalInputSchema>,
          timestamp: getRequestTimestamp(ctx.request),
        }),
      }),
    },
    {
      method: "GET",
      resource: "diet",
      path: "/diet/preferences",
      operationId: "dietPreferencesGet",
      summary: "Get the caller's dietary preferences",
      auth: "bearer",
      mutating: false,
      outputSchema: envelope(DietPreferencesResponse),
      handler: async (ctx) => ({ preferences: await getDietPreferences(ctx.deps, requireUserId(ctx)) }),
    },
    {
      method: "POST",
      resource: "diet",
      path: "/diet/preferences",
      operationId: "dietPreferencesSet",
      summary: "Replace the caller's dietary preferences",
      auth: "bearer",
      mutating: true,
      inputSchema: dietPreferencesSchema,
      outputSchema: envelope(DietPreferencesResponse),
      handler: async (ctx) => ({
        preferences: await setDietPreferences(ctx.deps, {
          userId: requireUserId(ctx),
          input: ctx.input as z.infer<typeof dietPreferencesSchema>,
          timestamp: getRequestTimestamp(ctx.request),
        }),
      }),
    },
  ];
}
