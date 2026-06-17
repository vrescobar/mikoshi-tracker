import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { getRequestTimestamp, sendAuthError } from "../../shared/controller-helpers";
import {
  completeHabitForToday,
  NothingToUndoError,
  setHabitTotalForToday,
  TodayActionUnavailableError,
  undoHabitForToday,
} from "../checkins/checkin.service";
import { HabitInactiveError } from "../habits/habit.service";

import { getTodaySummary } from "./today.service";

async function buildTodayResponse(request: FastifyRequest, userId: string, timestamp: Date | number | string) {
  return getTodaySummary({ db: request.server.db, sqlite: request.server.sqlite }, { userId, timestamp });
}

function sendRequestError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: "Invalid today payload",
      issues: error.flatten(),
    });
    return reply;
  }

  if (error instanceof Error && error.message === "Habit not found") {
    reply.status(404).send({
      code: "NOT_FOUND",
      message: error.message,
    });
    return reply;
  }

  if (error instanceof Error && /Only .* can use/.test(error.message)) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: error.message,
    });
    return reply;
  }

  if (error instanceof HabitInactiveError) {
    reply.status(409).send({
      code: "HABIT_INACTIVE",
      message: error.message,
    });
    return reply;
  }

  if (error instanceof TodayActionUnavailableError) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: error.message,
    });
    return reply;
  }

  if (error instanceof NothingToUndoError) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: error.message,
    });
    return reply;
  }

  throw error;
}

export async function getTodayHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    return await buildTodayResponse(request, user.id, getRequestTimestamp(request));
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }

    return sendRequestError(reply, error);
  }
}

export async function completeTodayHabitHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const timestamp = getRequestTimestamp(request);
    const result = await completeHabitForToday(
      {
        db: request.server.db,
      },
      {
        userId: user.id,
        ...(request.body as Record<string, unknown>),
        timestamp,
      } as Parameters<typeof completeHabitForToday>[1],
    );

    return {
      affectedHabit: result.habit,
      mutationId: result.mutation.id,
      ...(await buildTodayResponse(request, user.id, timestamp)),
    };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }

    return sendRequestError(reply, error);
  }
}

export async function setTodayHabitTotalHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const timestamp = getRequestTimestamp(request);
    const result = await setHabitTotalForToday(
      {
        db: request.server.db,
      },
      {
        userId: user.id,
        ...(request.body as Record<string, unknown>),
        timestamp,
      } as Parameters<typeof setHabitTotalForToday>[1],
    );

    return {
      affectedHabit: result.habit,
      mutationId: result.mutation.id,
      ...(await buildTodayResponse(request, user.id, timestamp)),
    };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }

    return sendRequestError(reply, error);
  }
}

export async function undoTodayHabitHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const timestamp = getRequestTimestamp(request);
    const result = await undoHabitForToday(
      {
        db: request.server.db,
      },
      {
        userId: user.id,
        ...(request.body as Record<string, unknown>),
        timestamp,
      } as Parameters<typeof undoHabitForToday>[1],
    );

    return {
      affectedHabit: result.habit,
      mutationId: result.mutation.id,
      ...(await buildTodayResponse(request, user.id, timestamp)),
    };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }

    return sendRequestError(reply, error);
  }
}
