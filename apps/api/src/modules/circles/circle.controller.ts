import type { FastifyReply, FastifyRequest } from "fastify";

import { CircleAuthError, requireCircleContext } from "../../auth/circle-session";
import { getRequestTimestamp } from "../../shared/controller-helpers";
import {
  CircleMemberNotFoundError,
  getCircleLeaderboard,
  getMemberHabitsForCircle,
  listCircleMembersForToken,
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

export async function circleCompleteHabitHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function circleSetHabitTotalHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function circleUndoHabitHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

// ─── Session-authenticated management handlers ────────────────────────────────

export async function createCircleHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function listCirclesHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function getCircleDetailHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
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
