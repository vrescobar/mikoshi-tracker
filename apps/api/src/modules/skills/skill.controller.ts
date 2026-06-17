import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { skillRunInputSchema } from "@mikoshi-tracker/contracts/skills";

import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { sendAuthError } from "../../shared/controller-helpers";

import {
  SkillNotRegisteredError,
  SkillRunnerError,
  SkillRunnerTimeoutError,
  SkillRunnerUnreachableError,
  getSkillHealth,
  runSkill,
} from "./skill.service";

function sendSkillError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ZodError) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: "Invalid skill run payload",
      issues: error.flatten(),
    });
    return reply;
  }

  if (error instanceof SkillNotRegisteredError) {
    reply.status(404).send({ code: "NOT_FOUND", message: error.message });
    return reply;
  }

  if (error instanceof SkillRunnerTimeoutError) {
    reply.status(504).send({ code: "RUNNER_TIMEOUT", message: error.message });
    return reply;
  }

  if (error instanceof SkillRunnerUnreachableError) {
    reply.status(503).send({ code: "RUNNER_UNREACHABLE", message: error.message });
    return reply;
  }

  if (error instanceof SkillRunnerError) {
    reply.status(502).send({ code: "RUNNER_ERROR", message: error.message });
    return reply;
  }

  throw error;
}

export async function runSkillHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const input = skillRunInputSchema.parse(request.body);
    const result = await runSkill(request.server.sqlite, {
      skillSlug: input.skillSlug,
      input: input.input,
      userId: user.id,
    });
    return result;
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendSkillError(reply, error);
  }
}

export async function getSkillHealthHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAuthenticatedUser(request);
    const { slug } = request.params as { slug: string };
    const result = await getSkillHealth(request.server.sqlite, { skillSlug: slug });
    return result;
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendSkillError(reply, error);
  }
}
