import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { commonAuthErrorResponses } from "@mikoshi-tracker/contracts/api";
import {
  skillHealthResponseSchema,
  skillRunInputSchema,
  skillRunResponseSchema,
} from "@mikoshi-tracker/contracts/skills";

import type { PublicApiRouteDefinition } from "../../plugins/openapi";
import { getSkillHealthHandler, runSkillHandler } from "./skill.controller";

const skillSlugParamSchema = z.object({ slug: z.string().trim().min(1) });

const skillErrorSchema = z.object({ code: z.string(), message: z.string() });

export const skillApiRouteDefinitions: PublicApiRouteDefinition[] = [
  {
    method: "POST",
    path: "/api/skills/run",
    operationId: "runSkill",
    summary: "Run a registered skill",
    description:
      "Proxies the call to the Mikoshi skill runner (configured via " +
      "`MIKOSHI_SKILL_RUNNER_URL`, default `http://localhost:7990`). Only " +
      "skills declared as `EntryType.skillSlug` are accepted. The tracker " +
      "does not interpret `input`; the targeted skill does. 30s upstream timeout.",
    tags: ["Skills"],
    security: [{ BearerAuth: [] }],
    request: {
      body: skillRunInputSchema,
    },
    responses: {
      200: {
        description: "The skill's stdout JSON (passed through verbatim).",
        schema: skillRunResponseSchema,
      },
      400: { description: "Malformed body.", schema: skillErrorSchema },
      404: {
        description: "The `skillSlug` is not registered against any EntryType.",
        schema: skillErrorSchema,
      },
      502: {
        description: "The skill runner returned a non-2xx response.",
        schema: skillErrorSchema,
      },
      503: {
        description: "The skill runner is unreachable.",
        schema: skillErrorSchema,
      },
      504: {
        description: "The skill runner exceeded the 30s timeout.",
        schema: skillErrorSchema,
      },
      ...commonAuthErrorResponses,
    },
  },
  {
    method: "GET",
    path: "/api/skills/:slug/health",
    operationId: "getSkillHealth",
    summary: "Get skill runner health",
    description:
      "Proxies `GET <runner>/skills/<slug>/health` to expose enrolment, " +
      "last-run timestamp, and last error to the tracker's settings page.",
    tags: ["Skills"],
    security: [{ BearerAuth: [] }],
    request: { params: skillSlugParamSchema },
    responses: {
      200: { description: "Skill runner health.", schema: skillHealthResponseSchema },
      404: { description: "Unknown slug.", schema: skillErrorSchema },
      502: { description: "Runner returned a non-2xx response.", schema: skillErrorSchema },
      503: { description: "Runner unreachable.", schema: skillErrorSchema },
      504: { description: "Runner timeout.", schema: skillErrorSchema },
      ...commonAuthErrorResponses,
    },
  },
];

export async function registerSkillRoutes(app: FastifyInstance) {
  app.post("/api/skills/run", runSkillHandler);
  app.get("/api/skills/:slug/health", getSkillHealthHandler);
}
