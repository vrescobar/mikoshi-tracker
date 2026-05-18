import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const optionalNonEmptyString = z.string().trim().min(1).optional();
const nullableNonEmptyString = z.string().trim().min(1).nullable();
const nullableOptionalNonEmptyString = z.string().trim().min(1).nullable().optional();

// ─── Domain shapes ───────────────────────────────────────────────────────────

export const circleMemberRoleSchema = z.enum(["owner", "member"]);

export const circleRecordSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  ownerId: nonEmptyString,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const circleMemberSchema = z.object({
  membershipId: nonEmptyString,
  userId: nonEmptyString,
  displayName: nonEmptyString,
  role: circleMemberRoleSchema,
  externalId: nullableNonEmptyString,
  joinedAt: isoDateTimeSchema,
});

export const circleTokenMetaSchema = z.object({
  tokenId: nonEmptyString,
  label: nullableNonEmptyString,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export const circleLeaderboardEntrySchema = z.object({
  userId: nonEmptyString,
  displayName: nonEmptyString,
  role: circleMemberRoleSchema,
  completedTodayCount: z.number().int().nonnegative(),
  sharedHabitCount: z.number().int().nonnegative(),
  currentStreak: z.number().int().nonnegative(),
  weeklyCompletionRate: z.number().min(0).max(1),
});

// ─── Member habits with today state ──────────────────────────────────────────

export const circleHabitKindSchema = z.enum(["boolean", "quantity"]);
export const circleHabitTodayStatusSchema = z.enum(["pending", "completed", "not_due"]);

export const circleMemberHabitSchema = z.object({
  habitId: nonEmptyString,
  name: nonEmptyString,
  kind: circleHabitKindSchema,
  todayStatus: circleHabitTodayStatusSchema,
  todayValue: z.number().int().nonnegative().nullable(),
  targetValue: z.number().int().positive().nullable(),
  unit: nullableNonEmptyString,
});

// ─── Path param schemas ───────────────────────────────────────────────────────

export const circlePathParamsSchema = z.object({
  circleId: nonEmptyString,
});

export const circleMemberPathParamsSchema = z.object({
  circleId: nonEmptyString,
  userId: nonEmptyString,
});

export const circleMemberHabitPathParamsSchema = z.object({
  circleId: nonEmptyString,
  userId: nonEmptyString,
  habitId: nonEmptyString,
});

export const circleMembershipPathParamsSchema = z.object({
  circleId: nonEmptyString,
  membershipId: nonEmptyString,
});

export const circleSharePathParamsSchema = z.object({
  circleId: nonEmptyString,
  habitId: nonEmptyString,
});

export const circleTokenPathParamsSchema = z.object({
  circleId: nonEmptyString,
  tokenId: nonEmptyString,
});

// ─── Session-auth input schemas ───────────────────────────────────────────────

export const createCircleInputSchema = z.object({
  name: nonEmptyString,
});

export const addCircleMemberInputSchema = z.object({
  email: z.string().email(),
  externalId: optionalNonEmptyString,
});

export const updateCircleMemberInputSchema = z
  .strictObject({
    role: circleMemberRoleSchema.optional(),
    externalId: nullableOptionalNonEmptyString,
  })
  .refine((v) => v.role !== undefined || v.externalId !== undefined, {
    message: "At least one of role or externalId must be provided",
  });

export const shareHabitInputSchema = z.object({
  habitId: nonEmptyString,
});

export const createCircleTokenInputSchema = z.object({
  label: optionalNonEmptyString,
});

// ─── Circle-token write input schemas ────────────────────────────────────────

export const circleSetTotalInputSchema = z.object({
  total: z.number().int().nonnegative(),
});

// ─── Response schemas ─────────────────────────────────────────────────────────

export const circleListResponseSchema = z.object({
  items: z.array(circleRecordSchema),
});

export const circleItemResponseSchema = z.object({
  item: circleRecordSchema,
});

export const circleSharedHabitSummarySchema = z.object({
  habitId: nonEmptyString,
  name: nonEmptyString,
});

export const circleDetailResponseSchema = z.object({
  circle: circleRecordSchema,
  members: z.array(circleMemberSchema),
  mySharedHabits: z.array(circleSharedHabitSummarySchema),
});

export const circleMembersResponseSchema = z.object({
  members: z.array(circleMemberSchema),
});

export const circleMembershipResponseSchema = z.object({
  membership: circleMemberSchema,
});

export const circleLeaderboardResponseSchema = z.object({
  leaderboard: z.array(circleLeaderboardEntrySchema),
});

export const circleMemberHabitsResponseSchema = z.object({
  habits: z.array(circleMemberHabitSchema),
});

export const circleHabitActionResponseSchema = z.object({
  habitId: nonEmptyString,
  userId: nonEmptyString,
  completed: z.boolean(),
  currentValue: z.number().int().nonnegative().nullable(),
});

export const circleTokenCreatedResponseSchema = z.object({
  token: nonEmptyString,
  tokenId: nonEmptyString,
  label: nullableNonEmptyString,
  createdAt: isoDateTimeSchema,
});

export const circleTokenListResponseSchema = z.object({
  tokens: z.array(circleTokenMetaSchema),
});

// ─── Circle-specific error codes ──────────────────────────────────────────────

export const circleErrorCodeSchema = z.enum(["HABIT_INACTIVE", "UNDO_NOT_CIRCLE_SOURCED"]);

export const undoNotCircleSourcedErrorSchema = z.object({
  code: z.literal("UNDO_NOT_CIRCLE_SOURCED"),
  message: nonEmptyString,
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type CircleMemberRole = z.infer<typeof circleMemberRoleSchema>;
export type CircleRecord = z.infer<typeof circleRecordSchema>;
export type CircleMember = z.infer<typeof circleMemberSchema>;
export type CircleTokenMeta = z.infer<typeof circleTokenMetaSchema>;
export type CircleLeaderboardEntry = z.infer<typeof circleLeaderboardEntrySchema>;
export type CircleHabitKind = z.infer<typeof circleHabitKindSchema>;
export type CircleHabitTodayStatus = z.infer<typeof circleHabitTodayStatusSchema>;
export type CircleMemberHabit = z.infer<typeof circleMemberHabitSchema>;
export type CirclePathParams = z.infer<typeof circlePathParamsSchema>;
export type CircleMemberPathParams = z.infer<typeof circleMemberPathParamsSchema>;
export type CircleMemberHabitPathParams = z.infer<typeof circleMemberHabitPathParamsSchema>;
export type CircleMembershipPathParams = z.infer<typeof circleMembershipPathParamsSchema>;
export type CircleSharePathParams = z.infer<typeof circleSharePathParamsSchema>;
export type CircleTokenPathParams = z.infer<typeof circleTokenPathParamsSchema>;
export type CreateCircleInput = z.infer<typeof createCircleInputSchema>;
export type AddCircleMemberInput = z.infer<typeof addCircleMemberInputSchema>;
export type UpdateCircleMemberInput = z.infer<typeof updateCircleMemberInputSchema>;
export type ShareHabitInput = z.infer<typeof shareHabitInputSchema>;
export type CreateCircleTokenInput = z.infer<typeof createCircleTokenInputSchema>;
export type CircleSetTotalInput = z.infer<typeof circleSetTotalInputSchema>;
export type CircleListResponse = z.infer<typeof circleListResponseSchema>;
export type CircleItemResponse = z.infer<typeof circleItemResponseSchema>;
export type CircleSharedHabitSummary = z.infer<typeof circleSharedHabitSummarySchema>;
export type CircleDetailResponse = z.infer<typeof circleDetailResponseSchema>;
export type CircleMembersResponse = z.infer<typeof circleMembersResponseSchema>;
export type CircleMembershipResponse = z.infer<typeof circleMembershipResponseSchema>;
export type CircleLeaderboardResponse = z.infer<typeof circleLeaderboardResponseSchema>;
export type CircleMemberHabitsResponse = z.infer<typeof circleMemberHabitsResponseSchema>;
export type CircleHabitActionResponse = z.infer<typeof circleHabitActionResponseSchema>;
export type CircleTokenCreatedResponse = z.infer<typeof circleTokenCreatedResponseSchema>;
export type CircleTokenListResponse = z.infer<typeof circleTokenListResponseSchema>;
export type CircleErrorCode = z.infer<typeof circleErrorCodeSchema>;
export type UndoNotCircleSourcedError = z.infer<typeof undoNotCircleSourcedErrorSchema>;
