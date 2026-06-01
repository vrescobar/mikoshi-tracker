import { z } from "zod";

import { createHabitInputSchema } from "./habits";

const nonEmptyString = z.string().trim().min(1);

export const provisionUserInputSchema = z.object({
  externalId: nonEmptyString,
  name: nonEmptyString.optional(),
  timezone: z.string().optional(),
});

export const provisionUserExistsResponseSchema = z.object({
  userId: nonEmptyString,
  alreadyExists: z.literal(true),
});

export const provisionUserCreatedResponseSchema = z.object({
  userId: nonEmptyString,
  personalToken: nonEmptyString,
  alreadyExists: z.literal(false),
});

export const resetProvisionedTokenInputSchema = z.object({
  externalId: nonEmptyString,
});

export const resetProvisionedTokenResponseSchema = z.object({
  userId: nonEmptyString,
  personalToken: nonEmptyString,
});

export const serviceUnavailableErrorSchema = z.object({
  code: z.literal("SERVICE_UNAVAILABLE"),
  message: nonEmptyString,
});

export const enrollMemberInputSchema = z.object({
  externalId: nonEmptyString,
});

export const enrollMemberResponseSchema = z.object({
  membershipId: nonEmptyString,
  userId: nonEmptyString,
  externalId: nonEmptyString,
});

export const adminCirclePathParamsSchema = z.object({
  circleId: nonEmptyString,
});

// ─── Admin circle lifecycle (contest management) ────────────────────────────

export const circleStatusSchema = z.enum(["active", "closed", "archived"]);
export const circleLeaderboardModeSchema = z.enum(["rolling", "snapshot"]);

/** Shared serialized shape of a circle returned by admin endpoints. */
export const adminCircleSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  ownerId: nonEmptyString,
  status: circleStatusSchema,
  season: z.string().nullable(),
  contestStartAt: z.string().nullable(),
  contestEndAt: z.string().nullable(),
  leaderboardMode: circleLeaderboardModeSchema,
  memberCount: z.number().int().nonnegative(),
  createdAt: nonEmptyString,
  updatedAt: nonEmptyString,
});

export const createCircleInputSchema = z.object({
  name: nonEmptyString,
  /** externalId of the provisioned user that will own the circle (owner-member). */
  ownerExternalId: nonEmptyString,
  season: nonEmptyString.optional(),
  contestStartAt: z.string().datetime().optional(),
  contestEndAt: z.string().datetime().optional(),
});

export const createCircleResponseSchema = z.object({
  circle: adminCircleSchema,
  /** Read-only circle token, returned once for the chat-scope binding. */
  circleToken: nonEmptyString,
});

export const updateCircleInputSchema = z
  .object({
    status: circleStatusSchema.optional(),
    season: nonEmptyString.nullable().optional(),
    contestStartAt: z.string().datetime().nullable().optional(),
    contestEndAt: z.string().datetime().nullable().optional(),
    leaderboardMode: circleLeaderboardModeSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });

export const bulkEnrollInputSchema = z.object({
  externalIds: z.array(nonEmptyString).min(1).max(500),
});

export const bulkEnrollResponseSchema = z.object({
  /** externalIds newly added as members. */
  added: z.array(nonEmptyString),
  /** externalIds that were already members (idempotent no-op). */
  alreadyMembers: z.array(nonEmptyString),
  /** externalIds with no provisioned user (skipped — provision them first). */
  notProvisioned: z.array(nonEmptyString),
});

// ─── Admin: assign a habit to a member inside a circle ──────────────────────
//
// Habits are personal `Entry` rows shared into a circle via `CircleEntryShare`,
// normally created with the user's own personal token. This admin primitive
// acts on the user's behalf (admin key) so an operator can rescue/seed habits:
// either create a new habit and share it, or share an existing one. Exactly one
// of `habit` / `habitId` must be provided.
export const assignHabitInputSchema = z
  .object({
    /** Mikoshi identity id of the member to assign the habit to. */
    externalId: nonEmptyString,
    /** Create this habit as the user, then share it into the circle. */
    habit: createHabitInputSchema.optional(),
    /** Or share an existing habit (by id, owned by the user) into the circle. */
    habitId: nonEmptyString.optional(),
  })
  .refine((v) => (v.habit === undefined) !== (v.habitId === undefined), {
    message: "Provide exactly one of `habit` or `habitId`",
  });

export const assignHabitResponseSchema = z.object({
  userId: nonEmptyString,
  habitId: nonEmptyString,
  /** true if a new habit was created; false if an existing habitId was shared. */
  created: z.boolean(),
  /** true if the habit is now linked to the circle (whether new or pre-existing). */
  shared: z.boolean(),
  /** true if the share already existed (idempotent no-op on the link). */
  alreadyShared: z.boolean(),
});

export type CircleStatus = z.infer<typeof circleStatusSchema>;
export type AdminCircle = z.infer<typeof adminCircleSchema>;
export type CreateCircleInput = z.infer<typeof createCircleInputSchema>;
export type CreateCircleResponse = z.infer<typeof createCircleResponseSchema>;
export type UpdateCircleInput = z.infer<typeof updateCircleInputSchema>;
export type BulkEnrollInput = z.infer<typeof bulkEnrollInputSchema>;
export type BulkEnrollResponse = z.infer<typeof bulkEnrollResponseSchema>;
export type AssignHabitInput = z.infer<typeof assignHabitInputSchema>;
export type AssignHabitResponse = z.infer<typeof assignHabitResponseSchema>;

// ─── Magic-link issuance ────────────────────────────────────────────────────

export const issueMagicLinkInputSchema = z.object({
  externalId: nonEmptyString,
  /**
   * Optional in-app path the user should land on after consuming the link
   * (e.g. "/food"). Must start with "/" — never a full URL, to prevent
   * open-redirect abuse. The consumer endpoint validates again before redirecting.
   */
  next: z
    .string()
    .startsWith("/", "next must be a relative app path starting with '/'")
    .max(512)
    .optional(),
});

export const issueMagicLinkResponseSchema = z.object({
  url: nonEmptyString,
  expiresAt: nonEmptyString, // ISO timestamp
});

export const consumeMagicLinkInputSchema = z.object({
  token: nonEmptyString,
});

export const consumeMagicLinkResponseSchema = z.object({
  userId: nonEmptyString,
  next: z.string(), // may be empty if no next was set
});

export type IssueMagicLinkInput = z.infer<typeof issueMagicLinkInputSchema>;
export type IssueMagicLinkResponse = z.infer<typeof issueMagicLinkResponseSchema>;
export type ConsumeMagicLinkInput = z.infer<typeof consumeMagicLinkInputSchema>;
export type ConsumeMagicLinkResponse = z.infer<typeof consumeMagicLinkResponseSchema>;

export type ProvisionUserInput = z.infer<typeof provisionUserInputSchema>;
export type ProvisionUserExistsResponse = z.infer<typeof provisionUserExistsResponseSchema>;
export type ProvisionUserCreatedResponse = z.infer<typeof provisionUserCreatedResponseSchema>;
export type ResetProvisionedTokenInput = z.infer<typeof resetProvisionedTokenInputSchema>;
export type ResetProvisionedTokenResponse = z.infer<typeof resetProvisionedTokenResponseSchema>;
export type ServiceUnavailableError = z.infer<typeof serviceUnavailableErrorSchema>;
export type EnrollMemberInput = z.infer<typeof enrollMemberInputSchema>;
export type EnrollMemberResponse = z.infer<typeof enrollMemberResponseSchema>;

// ─── User consolidation (merge / link) + impersonation ──────────────────────
// One human can end up with two User rows: a web account (real email,
// externalId = null) and a provisioned account (synthetic email, externalId
// set by Mikoshi). These primitives consolidate them and let an admin act as
// any user (God Mode), so "admin vs member" is one account + a flag, not two
// fighting records.

export const mergeUsersInputSchema = z.object({
  /** The duplicate row to fold in and delete. */
  sourceUserId: nonEmptyString,
  /** The surviving canonical row (e.g. the real-email account). */
  targetUserId: nonEmptyString,
});

export const mergeUsersResponseSchema = z.object({
  targetUserId: nonEmptyString,
  /** externalId moved from source → target, if the source had one and target didn't. */
  movedExternalId: z.string().nullable(),
  /** true if the merged target ends up admin (either side was admin). */
  targetIsAdmin: z.boolean(),
  reparented: z.object({
    entries: z.number().int(),
    entryEvents: z.number().int(),
    eventMutations: z.number().int(),
    attachments: z.number().int(),
    circlesOwned: z.number().int(),
    circleMemberships: z.number().int(),
    circleMembershipsDeduped: z.number().int(),
    leaderboardSnapshots: z.number().int(),
    leaderboardSnapshotsDeduped: z.number().int(),
    sessions: z.number().int(),
    accounts: z.number().int(),
    magicLinks: z.number().int(),
    apiTokenMoved: z.boolean(),
  }),
});

export const attachExternalIdInputSchema = z.object({
  userId: nonEmptyString,
  externalId: nonEmptyString,
  /** Overwrite an existing externalId on the target (default: reject if set). */
  force: z.boolean().optional(),
});

export const attachExternalIdResponseSchema = z.object({
  userId: nonEmptyString,
  externalId: nonEmptyString,
  previousExternalId: z.string().nullable(),
});

export const adminLoginAsInputSchema = z.object({
  /** Any user id — admin mints a single-use login link to act as them. */
  userId: nonEmptyString,
  next: z
    .string()
    .startsWith("/", "next must be a relative app path starting with '/'")
    .max(512)
    .optional(),
});

export const adminLoginAsResponseSchema = z.object({
  url: nonEmptyString,
  userId: nonEmptyString,
  expiresAt: nonEmptyString, // ISO timestamp
});

export type MergeUsersInput = z.infer<typeof mergeUsersInputSchema>;
export type MergeUsersResponse = z.infer<typeof mergeUsersResponseSchema>;
export type AttachExternalIdInput = z.infer<typeof attachExternalIdInputSchema>;
export type AttachExternalIdResponse = z.infer<typeof attachExternalIdResponseSchema>;
export type AdminLoginAsInput = z.infer<typeof adminLoginAsInputSchema>;
export type AdminLoginAsResponse = z.infer<typeof adminLoginAsResponseSchema>;
