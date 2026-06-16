import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  addCircleMemberInputSchema,
  circleCompleteInputSchema,
  circleSetTotalInputSchema,
  circleUndoInputSchema,
  createCircleInputSchema,
  createCircleTokenInputSchema,
  setCircleMemberNameInputSchema,
  shareHabitInputSchema,
  updateCircleMemberInputSchema,
} from "@mikoshi-tracker/contracts/circles";
import {
  CircleAuthError,
  actorEnforcementRequired,
  requireCircleContext,
  resolveCircleActor,
  type CircleContext,
} from "../../auth/circle-session";
import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { getRequestTimestamp, sendAuthError } from "../../shared/controller-helpers";
import {
  addCircleMember,
  assertCircleSelfOrOwner,
  CircleBackdateRangeError,
  circleCompleteHabit,
  CircleClosedError,
  CircleForbiddenError,
  CircleHabitAlreadySharedError,
  CircleHabitInactiveError,
  CircleHabitNotFoundError,
  CircleHabitNotSharedError,
  CircleMemberAlreadyExistsError,
  CircleMemberNotFoundError,
  CircleNotFoundError,
  circleSetHabitTotal,
  circleUndoHabit,
  CircleUndoNotCircleSourcedError,
  CircleUserNotFoundError,
  createCircle,
  getCircleDetail,
  getCircleLeaderboard,
  getMemberHabitsForCircle,
  listCircleMembersForToken,
  listCircleTokensForOwner,
  listUserCircles,
  mintCircleToken,
  removeCircleMember,
  revokeCircleTokenForOwner,
  setCircleMemberName,
  CircleTokenNotFoundError,
  shareHabit,
  TodayActionUnavailableError,
  unshareHabit,
  updateCircleMember,
} from "./circle.service";

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
    reply.status(404).send({ code: "NOT_FOUND", message: error.message });
    return reply;
  }
  if (error instanceof CircleHabitNotSharedError || error instanceof CircleForbiddenError) {
    reply.status(403).send({ code: "FORBIDDEN", message: error.message });
    return reply;
  }
  if (error instanceof CircleHabitInactiveError) {
    reply.status(409).send({ code: "HABIT_INACTIVE", message: error.message });
    return reply;
  }
  if (error instanceof CircleClosedError) {
    reply.status(409).send({ code: "CIRCLE_CLOSED", message: error.message });
    return reply;
  }
  if (error instanceof CircleUndoNotCircleSourcedError) {
    reply.status(409).send({ code: "UNDO_NOT_CIRCLE_SOURCED", message: error.message });
    return reply;
  }
  if (error instanceof TodayActionUnavailableError || error instanceof CircleBackdateRangeError) {
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

/**
 * AUTH-3 — enforcement de actor server-side en una escritura de círculo. Rollout
 * en 2 fases:
 *  - Fase A (default): una aserción FORJADA/expirada → 403 siempre; AUSENTE →
 *    log `circle.actor.absent` y procede (paridad legacy, cero rotura).
 *  - Fase B (MIKOSHI_TRACKER_REQUIRE_ACTOR=1): la ausencia también → 403.
 * Una aserción VÁLIDA siempre se enforce self-or-owner.
 */
async function enforceCircleActor(
  request: FastifyRequest,
  context: CircleContext,
  targetUserId: string,
): Promise<void> {
  const actor = resolveCircleActor(request, context);
  if (actor.status === "invalid") {
    throw new CircleAuthError(403, "Invalid actor assertion");
  }
  if (actor.status === "absent") {
    if (actorEnforcementRequired()) {
      throw new CircleAuthError(403, "Actor assertion required");
    }
    request.log.warn(
      { circleId: context.circle.id, targetUserId },
      "circle.actor.absent",
    );
    return;
  }
  await assertCircleSelfOrOwner(
    { db: request.server.db },
    { circleId: context.circle.id, targetUserId, actorExternalId: actor.actorExternalId },
  );
  request.log.info({ circleId: context.circle.id }, "circle.actor.present");
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
    const ctx = await requireCircleContext(request, circleId);
    await enforceCircleActor(request, ctx, userId);
    const { date } = circleCompleteInputSchema.parse(request.body ?? {});
    const timestamp = getRequestTimestamp(request);
    return await circleCompleteHabit({ db: request.server.db }, { circleId, userId, habitId, timestamp, date });
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
    const ctx = await requireCircleContext(request, circleId);
    await enforceCircleActor(request, ctx, userId);
    const { total, date } = circleSetTotalInputSchema.parse(request.body);
    const timestamp = getRequestTimestamp(request);
    return await circleSetHabitTotal(
      { db: request.server.db },
      { circleId, userId, habitId, total, timestamp, date },
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
    const ctx = await requireCircleContext(request, circleId);
    await enforceCircleActor(request, ctx, userId);
    const { date } = circleUndoInputSchema.parse(request.body ?? {});
    const timestamp = getRequestTimestamp(request);
    return await circleUndoHabit({ db: request.server.db }, { circleId, userId, habitId, timestamp, date });
  } catch (error) {
    return sendCircleWriteError(reply, error);
  }
}

export async function setCircleMemberNameHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { circleId, userId } = request.params as { circleId: string; userId: string };
    const ctx = await requireCircleContext(request, circleId);
    await enforceCircleActor(request, ctx, userId);
    const { name } = setCircleMemberNameInputSchema.parse(request.body);
    return await setCircleMemberName({ db: request.server.db }, { circleId, userId, name });
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
  if (
    error instanceof CircleNotFoundError ||
    error instanceof CircleUserNotFoundError ||
    error instanceof CircleMemberNotFoundError ||
    error instanceof CircleHabitNotFoundError ||
    error instanceof CircleHabitNotSharedError ||
    error instanceof CircleTokenNotFoundError
  ) {
    reply.status(404).send({ code: "NOT_FOUND", message: error.message });
    return reply;
  }
  if (error instanceof CircleForbiddenError) {
    reply.status(403).send({ code: "FORBIDDEN", message: error.message });
    return reply;
  }
  if (error instanceof CircleMemberAlreadyExistsError || error instanceof CircleHabitAlreadySharedError) {
    reply.status(409).send({ code: "CONFLICT", message: error.message });
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

export async function addCircleMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { circleId } = request.params as { circleId: string };
    const { email, externalId } = addCircleMemberInputSchema.parse(request.body);
    const result = await addCircleMember(
      { db: request.server.db },
      { circleId, callerId: user.id, email, externalId },
    );
    reply.status(201);
    return result;
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}

export async function updateCircleMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { circleId, membershipId } = request.params as { circleId: string; membershipId: string };
    const { role, externalId } = updateCircleMemberInputSchema.parse(request.body);
    return await updateCircleMember(
      { db: request.server.db },
      { circleId, callerId: user.id, membershipId, role, externalId },
    );
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}

export async function removeCircleMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { circleId, membershipId } = request.params as { circleId: string; membershipId: string };
    await removeCircleMember({ db: request.server.db }, { circleId, callerId: user.id, membershipId });
    return await reply.code(204).send();
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}

export async function shareHabitHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { circleId } = request.params as { circleId: string };
    const { habitId } = shareHabitInputSchema.parse(request.body);
    const result = await shareHabit({ db: request.server.db }, { circleId, callerId: user.id, habitId });
    reply.status(201);
    return result;
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}

export async function unshareHabitHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { circleId, habitId } = request.params as { circleId: string; habitId: string };
    await unshareHabit({ db: request.server.db }, { circleId, callerId: user.id, habitId });
    return await reply.code(204).send();
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}

export async function createCircleTokenHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { circleId } = request.params as { circleId: string };
    const { label } = createCircleTokenInputSchema.parse(request.body);
    const result = await mintCircleToken(
      { db: request.server.db },
      { circleId, callerId: user.id, label },
    );
    reply.status(201);
    return result;
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}

export async function listCircleTokensHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { circleId } = request.params as { circleId: string };
    return await listCircleTokensForOwner({ db: request.server.db }, { circleId, callerId: user.id });
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}

export async function revokeCircleTokenHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { circleId, tokenId } = request.params as { circleId: string; tokenId: string };
    await revokeCircleTokenForOwner(
      { db: request.server.db },
      { circleId, callerId: user.id, tokenId },
    );
    return await reply.code(204).send();
  } catch (error) {
    return sendCircleManagementError(reply, error);
  }
}
