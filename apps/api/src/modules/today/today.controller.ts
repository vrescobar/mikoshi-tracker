import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { getRequestTimestamp, sendAuthError } from "../../shared/controller-helpers";
import {
  serializeContractFrequencyType,
  serializeContractHabitKind,
  serializeContractWeekdays,
} from "../../shared/habit-contract-mappers";
import {
  completeHabitForToday,
  NothingToUndoError,
  setHabitTotalForToday,
  TodayActionUnavailableError,
  undoHabitForToday,
} from "../checkins/checkin.service";
import { HabitInactiveError } from "../habits/habit.service";

import { HABIT_ENTRY_TYPE_SLUGS, mapEntryToHabit } from "../habits/habit-entry-adapter";

import { buildTodaySummary } from "./today-summary";
import { resolveHabitDay } from "./today-clock";

type PeriodCounter = {
  week: number;
  month: number;
};

function serializeHabit(habit: {
  id: string;
  name: string;
  kind: string;
  frequencyType: string;
  frequencyCount: number | null;
  targetValue: number | null;
  unit: string | null;
  startDate: string;
  weekdays: Array<{ day: string }>;
}) {
  return {
    id: habit.id,
    name: habit.name,
    kind: serializeContractHabitKind(habit.kind),
    frequencyType: serializeContractFrequencyType(habit.frequencyType),
    frequencyCount: habit.frequencyCount,
    targetValue: habit.targetValue,
    unit: habit.unit,
    startDate: habit.startDate,
    weekdays: serializeContractWeekdays(habit.weekdays),
  };
}

function incrementPeriodCounter(counters: Map<string, PeriodCounter>, habitId: string, key: keyof PeriodCounter) {
  const current = counters.get(habitId) ?? {
    week: 0,
    month: 0,
  };

  current[key] += 1;
  counters.set(habitId, current);
}

async function buildTodayResponse(request: FastifyRequest, userId: string, timestamp: Date | number | string) {
  const user = await request.server.db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      timezone: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const day = resolveHabitDay({
    timestamp,
    timeZone: user.timezone,
  });
  const rangeStart = day.weekStartKey < day.monthStartKey ? day.weekStartKey : day.monthStartKey;
  const rangeEnd = day.weekEndKey > day.monthEndKey ? day.weekEndKey : day.monthEndKey;

  // Habits are Entry rows of the two habit types; check-ins are their EntryEvents.
  const habitSlugFilter = { entryType: { slug: { in: [...HABIT_ENTRY_TYPE_SLUGS] } } };
  const [habitEntries, dayStates, completedStates] = await Promise.all([
    request.server.db.entry.findMany({
      where: {
        userId,
        isActive: true,
        ...habitSlugFilter,
      },
      include: {
        entryType: { select: { slug: true } },
        weekdays: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    request.server.db.entryEvent.findMany({
      where: {
        userId,
        entry: habitSlugFilter,
        dateKey: day.todayKey,
      },
    }),
    request.server.db.entryEvent.findMany({
      where: {
        userId,
        entry: habitSlugFilter,
        completed: true,
        dateKey: {
          gte: rangeStart,
          lte: rangeEnd,
        },
      },
    }),
  ]);

  const periodCounters = new Map<string, PeriodCounter>();

  for (const state of completedStates) {
    if (state.dateKey >= day.weekStartKey && state.dateKey <= day.weekEndKey) {
      incrementPeriodCounter(periodCounters, state.entryId, "week");
    }

    if (state.dateKey >= day.monthStartKey && state.dateKey <= day.monthEndKey) {
      incrementPeriodCounter(periodCounters, state.entryId, "month");
    }
  }

  const summary = buildTodaySummary({
    day,
    habits: habitEntries.map((entry) => serializeHabit(mapEntryToHabit(entry))),
    dayStates: dayStates.map((state) => ({
      habitId: state.entryId,
      dateKey: state.dateKey,
      value: state.value === null ? null : Number(state.value),
      completed: state.completed ?? false,
    })),
    periodProgress: Array.from(periodCounters.entries()).flatMap(([habitId, counts]) => [
      {
        habitId,
        period: "week" as const,
        periodKey: day.weekKey,
        completions: counts.week,
      },
      {
        habitId,
        period: "month" as const,
        periodKey: day.monthKey,
        completions: counts.month,
      },
    ]),
  });

  return {
    summary,
  };
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
