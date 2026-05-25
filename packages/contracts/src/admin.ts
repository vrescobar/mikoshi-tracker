import { z } from "zod";

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
