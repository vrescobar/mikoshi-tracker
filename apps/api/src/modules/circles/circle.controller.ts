import type { FastifyReply, FastifyRequest } from "fastify";

function notImplemented(reply: FastifyReply) {
  reply.status(501).send({ code: "NOT_IMPLEMENTED", message: "Not yet implemented" });
  return reply;
}

// ─── Circle-token-authenticated handlers ─────────────────────────────────────

export async function listCircleMembersHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function getCircleLeaderboardHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
}

export async function getMemberHabitsHandler(_request: FastifyRequest, reply: FastifyReply) {
  return notImplemented(reply);
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
