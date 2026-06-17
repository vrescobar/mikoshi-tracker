import { z } from "zod";

import { getSkillHealth, listAllowedSkillSlugs, runSkill } from "../../modules/skills/skill.service";
import { envelope, requireUserId } from "../context";
import type { ApiV1Deps, V1RouteMeta } from "../match";

const nonEmpty = z.string().trim().min(1);

/**
 * The skill `input` is opaque at the tracker boundary: the runner owns its
 * payload contract. The tracker only enforces that `skillSlug` is allow-listed
 * (an EntryType declares it) via `runSkill` — arbitrary skills cannot be driven
 * through the bridge. Output is whatever JSON the runner returns.
 */
const runInputSchema = z.object({ skillSlug: nonEmpty, input: z.unknown() });
const skillSlugParams = z.object({ skillSlug: nonEmpty });

export function skillsV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "GET",
      resource: "skills",
      path: "/skills",
      operationId: "skillsList",
      summary: "List the skill slugs the tracker is willing to invoke",
      auth: "bearer",
      mutating: false,
      outputSchema: envelope(z.object({ skills: z.array(z.string()) })),
      handler: async (ctx) => {
        requireUserId(ctx);
        const slugs = await listAllowedSkillSlugs(ctx.deps.sqlite);
        return { skills: [...slugs].sort() };
      },
    },
    {
      method: "GET",
      resource: "skills",
      path: "/skills/:skillSlug/health",
      operationId: "skillHealth",
      summary: "Proxy a skill runner health check",
      auth: "bearer",
      mutating: false,
      paramsSchema: skillSlugParams,
      outputSchema: envelope(z.unknown()),
      handler: (ctx) => {
        requireUserId(ctx);
        return getSkillHealth(ctx.deps.sqlite, { skillSlug: (ctx.params as { skillSlug: string }).skillSlug });
      },
    },
    {
      method: "POST",
      resource: "skills",
      path: "/skills/run",
      operationId: "skillRun",
      summary: "Run an allow-listed skill and return the runner's output",
      auth: "bearer",
      mutating: true,
      inputSchema: runInputSchema,
      outputSchema: envelope(z.unknown()),
      handler: (ctx) => {
        const input = ctx.input as z.infer<typeof runInputSchema>;
        return runSkill(ctx.deps.sqlite, {
          skillSlug: input.skillSlug,
          input: input.input,
          userId: requireUserId(ctx),
        });
      },
    },
  ];
}
