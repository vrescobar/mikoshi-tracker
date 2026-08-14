import { z } from "zod";

/**
 * Mikoshi extensions-platform contract surface (story 50).
 *
 * These are the shapes of `POST /api/platform/provision` as pinned by
 * `~/projects/mikoshi-stack/docs/contract-summary.md` — the namespace the
 * generic `ExtensionProvisionService` of Mikoshi speaks. The legacy
 * `/api/admin/provision-user` (+ reset-token) shapes in `admin.ts` keep
 * serving the hardcoded tracker flow until the provision switch (story 54).
 *
 * Magic-link issuance under `/api/platform/issue-magic-link` reuses the
 * admin schemas verbatim (`issueMagicLinkInputSchema` /
 * `issueMagicLinkResponseSchema`) — same shape in both namespaces. The link is
 * delivered to the requester's WhatsApp DM by the tracker; the response carries
 * only `{ delivered, expiresAt }`, never the raw URL (see admin.ts).
 */

const nonEmptyString = z.string().trim().min(1);

export const platformProvisionInputSchema = z.object({
  externalId: nonEmptyString,
  displayName: nonEmptyString.max(200).optional(),
  /** E.164-ish; accepted for contract compatibility, not persisted (no User field). */
  phone: z.string().max(32).optional(),
  timezone: z.string().max(64).optional(),
  /** Roster hints; membership sync consumes them from story 51 onwards. */
  cohorts: z
    .array(
      z.object({
        cohortId: nonEmptyString,
        name: z.string(),
      }),
    )
    .optional(),
});

export const platformProvisionResponseSchema = z.object({
  created: z.boolean(),
  userId: nonEmptyString,
  /**
   * Always present and freshly rotated: parity with the legacy
   * provision-user + reset-token round-trip Mikoshi performs when it
   * (re-)enrols a user it holds no stored secret for.
   */
  personalToken: nonEmptyString,
});

// ─── Membership push (cohorts = roster, story 51) ───────────────────────────

export const platformMembershipInputSchema = z.object({
  cohortId: nonEmptyString,
  members: z.array(
    z.object({
      externalId: nonEmptyString,
      displayName: z.string().optional(),
    }),
  ),
});

export const platformMembershipResponseSchema = z.object({
  cohortId: nonEmptyString,
  added: z.array(nonEmptyString),
  removed: z.array(nonEmptyString),
  skippedUnprovisioned: z.array(nonEmptyString),
});

export type PlatformProvisionInput = z.infer<typeof platformProvisionInputSchema>;
export type PlatformProvisionResponse = z.infer<typeof platformProvisionResponseSchema>;
export type PlatformMembershipInput = z.infer<typeof platformMembershipInputSchema>;
export type PlatformMembershipResponse = z.infer<typeof platformMembershipResponseSchema>;
