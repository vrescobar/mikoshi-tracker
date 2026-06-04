import { ZodError } from "zod";
import type { ErrorCode } from "@mikoshi-tracker/contracts/errors";

/**
 * The single error type the v1 RPC pipeline throws. `code` is typed against the
 * shared `ErrorCode` enum so the compiler — not a runtime test — guarantees
 * every emitted code is in the catalogue.
 */
export class V1ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "V1ApiError";
  }
}

type MappedError = { status: number; code: ErrorCode; message: string };

/**
 * Maps a thrown error (a `V1ApiError`, a Zod validation error, an auth error
 * with `.statusCode`, or a named domain error class from the modules) into the
 * v1 error envelope. Domain errors are matched by `error.name` so v1 does not
 * have to import all ~40 module error classes (and avoids import cycles).
 */
const DOMAIN_ERROR_TABLE: Record<string, { status: number; code: ErrorCode }> = {
  // entries / events
  EntryNotFoundError: { status: 404, code: "NOT_FOUND" },
  EntryInactiveError: { status: 409, code: "ENTRY_INACTIVE" },
  EntryTypeNotFoundError: { status: 404, code: "NOT_FOUND" },
  EntryTypeForAggregationNotFoundError: { status: 404, code: "NOT_FOUND" },
  EntryForEventNotFoundError: { status: 404, code: "NOT_FOUND" },
  EntryForEventInactiveError: { status: 409, code: "ENTRY_INACTIVE" },
  EventNotFoundError: { status: 404, code: "NOT_FOUND" },
  EventAlreadyDeletedError: { status: 410, code: "EVENT_DELETED" },
  NothingToUndoError: { status: 409, code: "NOTHING_TO_UNDO" },
  MutationNotFoundError: { status: 404, code: "NOT_FOUND" },
  // habits / today
  HabitNotFoundError: { status: 404, code: "NOT_FOUND" },
  HabitInactiveError: { status: 409, code: "HABIT_INACTIVE" },
  TodayActionUnavailableError: { status: 400, code: "BAD_REQUEST" },
  // circles
  CircleNotFoundError: { status: 404, code: "NOT_FOUND" },
  CircleForbiddenError: { status: 403, code: "FORBIDDEN" },
  CircleMemberNotFoundError: { status: 404, code: "NOT_FOUND" },
  CircleHabitNotFoundError: { status: 404, code: "NOT_FOUND" },
  CircleHabitNotSharedError: { status: 403, code: "FORBIDDEN" },
  CircleHabitInactiveError: { status: 409, code: "HABIT_INACTIVE" },
  CircleHabitAlreadySharedError: { status: 409, code: "CONFLICT" },
  CircleClosedError: { status: 409, code: "CIRCLE_CLOSED" },
  CircleUndoNotCircleSourcedError: { status: 409, code: "UNDO_NOT_CIRCLE_SOURCED" },
  CircleUserNotFoundError: { status: 404, code: "NOT_FOUND" },
  CircleMemberAlreadyExistsError: { status: 409, code: "CONFLICT" },
  CircleTokenNotFoundError: { status: 404, code: "NOT_FOUND" },
  // admin
  UserMergeError: { status: 409, code: "CONFLICT" },
  // attachments
  AttachmentNotFoundError: { status: 404, code: "NOT_FOUND" },
  AttachmentFileMissingError: { status: 404, code: "ATTACHMENT_FILE_MISSING" },
  AttachmentLimitError: { status: 409, code: "ATTACHMENT_LIMIT_REACHED" },
  AttachmentTooLargeError: { status: 413, code: "ATTACHMENT_TOO_LARGE" },
  UnsupportedMediaTypeError: { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
  MissingUploadError: { status: 400, code: "BAD_REQUEST" },
  // skills
  SkillNotRegisteredError: { status: 404, code: "NOT_FOUND" },
  SkillRunnerError: { status: 502, code: "RUNNER_ERROR" },
  SkillRunnerTimeoutError: { status: 504, code: "RUNNER_TIMEOUT" },
  SkillRunnerUnreachableError: { status: 502, code: "RUNNER_UNREACHABLE" },
};

export function mapV1Error(error: unknown): MappedError {
  if (error instanceof V1ApiError) {
    return { status: error.status, code: error.code, message: error.message };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      code: "BAD_REQUEST",
      message: error.issues[0]?.message ?? "Invalid request",
    };
  }

  if (error instanceof Error) {
    // Auth errors (`AuthSessionError`, `AdminKeyError`, `CircleAuthError`) carry a numeric statusCode.
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (statusCode === 401) {
      return { status: 401, code: "UNAUTHORIZED", message: error.message };
    }
    if (statusCode === 403) {
      return { status: 403, code: "FORBIDDEN", message: error.message };
    }
    if (statusCode === 503) {
      return { status: 503, code: "SERVICE_UNAVAILABLE", message: error.message };
    }

    const mapped = DOMAIN_ERROR_TABLE[error.name];
    if (mapped) {
      return { ...mapped, message: error.message };
    }
  }

  return { status: 500, code: "INTERNAL_ERROR", message: "Internal server error" };
}
