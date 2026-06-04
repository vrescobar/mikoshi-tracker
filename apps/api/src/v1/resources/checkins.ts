import { z } from "zod";

import {
  completeHabitInputSchema,
  setHabitTotalInputSchema,
  undoHabitInputSchema,
} from "@mikoshi-tracker/contracts/checkins";

import {
  completeHabitForToday,
  setHabitTotalForToday,
  undoHabitForToday,
} from "../../modules/checkins/checkin.service";
import { getRequestTimestamp } from "../../shared/controller-helpers";
import { registerSchema } from "../apiMeta";
import { envelope, requireUserId } from "../context";
import { V1ApiError } from "../errors";
import type { ApiV1Deps, V1RouteMeta } from "../match";

/**
 * v1 habit check-ins (complete / set-total / undo) wrapping the existing
 * checkin service. Bearer auth means these run through impersonation too, so the
 * god-mode admin panel can mark a habit for any user via `x-act-as-user`.
 */
const CheckinResult = registerSchema(
  "CheckinActionResult",
  z.object({
    habit: z.unknown(),
    currentState: z.unknown(),
    mutation: z.unknown(),
  }),
);

const checkinOutput = envelope(CheckinResult);

/**
 * The checkin service throws a couple of plain `Error`s (habit not found, wrong
 * kind for the action). Map those to typed v1 errors; the named domain errors
 * (HabitInactiveError, TodayActionUnavailableError, NothingToUndoError) are
 * already covered by the v1 error table.
 */
function mapCheckinError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message === "Habit not found") {
      throw new V1ApiError(404, "NOT_FOUND", error.message);
    }
    if (/^Only .* can use /.test(error.message)) {
      throw new V1ApiError(400, "BAD_REQUEST", error.message);
    }
  }
  throw error;
}

export function checkinsV1Routes(_deps: ApiV1Deps): V1RouteMeta[] {
  return [
    {
      method: "POST",
      resource: "checkins",
      path: "/checkins/complete",
      operationId: "checkinsComplete",
      summary: "Complete a boolean habit for today",
      auth: "bearer",
      mutating: true,
      inputSchema: completeHabitInputSchema,
      outputSchema: checkinOutput,
      handler: async (ctx) => {
        const input = ctx.input as z.infer<typeof completeHabitInputSchema>;
        try {
          return await completeHabitForToday(ctx.deps, {
            userId: requireUserId(ctx),
            habitId: input.habitId,
            source: input.source,
            note: input.note,
            timestamp: getRequestTimestamp(ctx.request),
          });
        } catch (error) {
          mapCheckinError(error);
        }
      },
    },
    {
      method: "POST",
      resource: "checkins",
      path: "/checkins/set-total",
      operationId: "checkinsSetTotal",
      summary: "Set a quantity habit's total for today",
      auth: "bearer",
      mutating: true,
      inputSchema: setHabitTotalInputSchema,
      outputSchema: checkinOutput,
      handler: async (ctx) => {
        const input = ctx.input as z.infer<typeof setHabitTotalInputSchema>;
        try {
          return await setHabitTotalForToday(ctx.deps, {
            userId: requireUserId(ctx),
            habitId: input.habitId,
            total: input.total,
            source: input.source,
            note: input.note,
            timestamp: getRequestTimestamp(ctx.request),
          });
        } catch (error) {
          mapCheckinError(error);
        }
      },
    },
    {
      method: "POST",
      resource: "checkins",
      path: "/checkins/undo",
      operationId: "checkinsUndo",
      summary: "Undo today's check-in for a habit",
      auth: "bearer",
      mutating: true,
      inputSchema: undoHabitInputSchema,
      outputSchema: checkinOutput,
      handler: async (ctx) => {
        const input = ctx.input as z.infer<typeof undoHabitInputSchema>;
        try {
          return await undoHabitForToday(ctx.deps, {
            userId: requireUserId(ctx),
            habitId: input.habitId,
            source: input.source,
            note: input.note,
            timestamp: getRequestTimestamp(ctx.request),
          });
        } catch (error) {
          mapCheckinError(error);
        }
      },
    },
  ];
}
