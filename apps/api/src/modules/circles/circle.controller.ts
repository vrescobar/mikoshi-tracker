import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { circleSetTotalInputSchema, createCircleInputSchema } from "@haaabit/contracts/circles";
import { CircleAuthError, requireCircleContext } from "../../auth/circle-session";
import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { getRequestTimestamp, sendAuthError } from "../../shared/controller-helpers";
import {
  circleCompleteHabit,
  CircleForbiddenError,
  CircleHabitInactiveError,
  CircleHabitNotFoundError,
  CircleHabitNotSharedError,
  CircleMemberNotFoundError,
  CircleNotFoundError,
  circleSetHabitTotal,
  circleUndoHabit,
  CircleUndoNotCircleSourcedError,
  createCircle,
  getCircleDetail,
  getCircleLeaderboard,
  getMemberHabitsForCircle,
  listCircleMembersForToken,
  listUserCircles,
  TodayActionUnavailableError,
} from "./circle.service";

function notImplemented(reply: FastifyReply) {
  reply.status(501).send({ code: "NOT_IMPLEMENTED", message: "Not yet implemented" });
  return reply;
}

function sendCircleAuthError(reply: FastifyReply, error: CircleAuthError) {
  reply.status(error.statusCode).send({
    code: error.statusCode === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    message: error.message,
  });
}

function sendCircleWriteError(reply: FastifyReply, error: unknown) {
  if (error instanceof CircleAuthError) {
    sendCircleAuthError(reply, error);
    return reply;
  }
  if (error instanceof CircleMemberNotFoundError || error instanceof CircleHabitNotFoundError) {
    reply.status(404).send({ code: "NOT_FOUND", message: (error as Error).message });
    return reply;
  }
  if (error instanceof CircleHabitNotSharedError) {
    reply.status(403).send({ code: "FORBIDDEN", message: error.message });
    return reply;
  }
  if (error instanceof CircleHabitInactiveError) {
    reply.status(409).send({ code: "HABIT_INACTIVE", message: error.message });
    return reply;
  }
  if (error instanceof CircleUndoNotCircleSourcedError) {
    reply.status(409).send({ code: "UNDO_NOT_CIRCLE_SOURCED", message: error.message });
    return reply;
  }
  if (error instanceof TodayActionUnavailableError) {
    reply.status(400).send({ code: "BAD_REQUEST", message: error.message });
    return reply;
  }
  if (error instanceof ZodError) {
    reply.status(400).send({ code: "BAD_REQUEST", message: "Invalid request body", issues: error.flatten() });
    return reply;
  }
  if (error instanceof Error && /Only .* can use/.test(error.message)) {
    reply.status(400).send({ code: "BAD_REQUEST", message: error.message });
    return reply;
  }
  throw error;
}

// ─── Circle-token-authenticated handlers ─────────────────────────────────────

export async function listCircleMembersHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { circleId } = request.params as { circleId: string };
    await requireCircleContext(request, circleId);
    return await listCircleMembersForToken({ db: request.server.db }, { circleId });
  } catch (error) {
    if (error instanceof CircleAuthError) {
      sendCircleAuthError(reply, error);
      return reply;
    }
    throw error;
  }
}

export async function getCircleLeaderboardHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { circleId } = request.params as { circleId: string };
    await requireCircleContext(request, circleId);
    const timestamp = getRequestTimestamp(request);
    return await getCircleLeaderboard({ db: request.server.db }, { circleId, timestamp });
  } catch (error) {
    if (error instanceof CircleAuthError) {
      sendCircleAuthError(reply, error);
      return reply;
    }
    throw error;
  }
}

export async function getMemberHabitsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { circleId, userId } = request.params as { circleId: string; userId: string };
    await requireCircleContext(request, circleId);
    const timestamp = getRequestTimestamp(request);
    return await getMemberHabitsForCircle({ db: request.server.db }, { circleId, userId, timestamp });
  } catch (error) {
    if (error instanceof CircleAuthError) {
      sendCircleAuthError(reply, error);
      return reply;
    }
    if (error instanceof CircleMemberNotFoundError) {
      reply.status(404).send({ code: "NOT_FOUND", message: error.message });
      return reply;
    }
    throw error;
  }
}

export async function circleCompleteHabitHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { circleId, userId, habitId } = request.params as {
      circleId: string;
      userId: string;
      habitId: string;
    };
    await requireCircleContext(request, circleId);
    const timestamp = getRequestTimestamp(request);
    return await circleCompleteHabit({ db: request.server.db }, { circleId, userId, habitId, timestamp });
  } catch (error) {
    return sendCircleWriteError(reply, error);
  }
}

export async function circleSetHabitTotalHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { circleId, userId, habitId } = request.params as {
      circleId: string;
      userId: string;
      habitId: string;
    };
    await requireCircleContext(request, circleId);
    const { total } = circleSetTotalInputSchema.parse(request.body);
    const timestamp = getRequestTimestamp(request);
    return await circleSetHabitTotal(
      { db: request.server.db },
      { circleId, userId, habitId, total, timestamp },
    );
  } catch (error) {
    return sendCircleWriteError(reply, error);
  }
}

export async function circleUndoHabitHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { circleId, userId, habitId } = request.params as {
      circleId: string;
      userId: string;
      habitId: string;
    };
    await requireCircleContext(request, circleId);
    const timestamp = getRequestTimestamp(request);
    return await circleUndoHabit({ db: request.server.db }, { circleId, userId, habitId, timestamp });
  } catch (error) {
    return sendCircleWriteError(reply, error);
  }
}

// ─── Session-authenticated management handlers ────────────────────────────────

function sendCircleManagementError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthSessionError) {
    sendAuthError(reply, error);
    return reply;
  }
  if (error instanceof CircleNotFoundError) {
    reply.status(404).send({ code: "NOT_FOUND", message: error.message });
    return reply;
  }
  if (error instanceof CircleForbiddenError) {
    reply.status(403).send({ code: "FORBIDDEN", message: error.message });
    return reply;
  }
  if (error instanceof ZodError) {
    reply.status(400).send({ code: "BAD_REQUEST", message: "Invalid request body", issues: error.flatten() });
    return reply;
  }
  throw error;
}

export async function createCircleHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { name } = createCircleInputSchema.parse(request.body);
    const result = await createCircle({ db: request.server.db }, { userId: user.id, name });
    reply.status(201);
    return result;
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}

export async function listCirclesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    return await listUserCircles({ db: request.server.db }, { userId: user.id });
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}

export async function getCircleDetailHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { circleId } = request.params as { circleId: string };
    return await getCircleDetail({ db: request.server.db }, { circleId, userId: user.id });
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}

export async function addCircleMemberHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function updateCircleMemberHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function removeCircleMemberHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function shareHabitHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function unshareHabitHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function createCircleTokenHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function listCircleTokensHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function revokeCircleTokenHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}
