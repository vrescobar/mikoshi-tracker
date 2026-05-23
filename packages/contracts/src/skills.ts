import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

/**
 * Body of POST /api/skills/run. The tracker is a dumb proxy here — it does
 * not interpret `input`; the targeted skill does. The skill's own contract
 * (in the Mikoshi `skills/<slug>/` directory) defines the input shape.
 *
 * `skillSlug` must match a registered `EntryType.skillSlug`; otherwise the
 * tracker refuses to invoke (404 NOT_FOUND).
 */
export const skillRunInputSchema = z.object({
  skillSlug: nonEmptyString,
  input: z.unknown(),
});

/**
 * Response from a skill run. The tracker passes through the skill's stdout
 * JSON verbatim — `passthrough()` keeps extra fields the skill includes.
 * The `action` field is well-known and matches the Mikoshi skill contract.
 */
export const skillRunResponseSchema = z
  .object({
    action: z
      .enum(["auto_posted", "pending_confirmation", "needs_enrolment", "error"])
      .optional(),
  })
  .passthrough();

/**
 * GET /api/skills/:slug/health proxies the skill runner's own health probe.
 * Used by `/settings/skills` to show enrolment + last-run state.
 */
export const skillHealthResponseSchema = z.object({
  skillSlug: nonEmptyString,
  enrolled: z.boolean(),
  lastRunAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

export type SkillRunInput = z.infer<typeof skillRunInputSchema>;
export type SkillRunResponse = z.infer<typeof skillRunResponseSchema>;
export type SkillHealthResponse = z.infer<typeof skillHealthResponseSchema>;
