import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { getRequestTimestamp, sendAuthError } from "../../shared/controller-helpers";
import {
  archiveEntry,
  createEntry,
  EntryInactiveError,
  EntryNotFoundError,
  EntryTypeNotFoundError,
  getEntry,
  listEntries,
  restoreEntry,
  updateEntry,
} from "./entry.service";

function sendEntryRequestError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: "Invalid entry payload",
      issues: error.flatten(),
    });
    return reply;
  }

  if (error instanceof EntryTypeNotFoundError) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: error.message,
    });
    return reply;
  }

  if (error instanceof EntryNotFoundError) {
    reply.status(404).send({
      code: "NOT_FOUND",
      message: error.message,
    });
    return reply;
  }

  if (error instanceof EntryInactiveError) {
    reply.status(409).send({
      code: "ENTRY_INACTIVE",
      message: error.message,
    });
    return reply;
  }

  throw error;
}

function getEntryId(request: FastifyRequest) {
  return (request.params as { id: string }).id;
}

export async function listEntriesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const items = await listEntries(
      { db: request.server.sqlite },
      { userId: user.id, filters: request.query },
    );
    return { items };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEntryRequestError(reply, error);
  }
}

export async function createEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const item = await createEntry(
      { db: request.server.sqlite },
      {
        userId: user.id,
        input: request.body,
        timestamp: getRequestTimestamp(request),
      },
    );
    reply.status(201);
    return { item };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEntryRequestError(reply, error);
  }
}

export async function getEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const item = await getEntry(
      { db: request.server.sqlite },
      { userId: user.id, entryId: getEntryId(request) },
    );
    return { item };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEntryRequestError(reply, error);
  }
}

export async function updateEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const item = await updateEntry(
      { db: request.server.sqlite },
      {
        userId: user.id,
        entryId: getEntryId(request),
        input: request.body,
      },
    );
    return { item };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEntryRequestError(reply, error);
  }
}

export async function archiveEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const item = await archiveEntry(
      { db: request.server.sqlite },
      { userId: user.id, entryId: getEntryId(request) },
    );
    return { item };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEntryRequestError(reply, error);
  }
}

export async function restoreEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const item = await restoreEntry(
      { db: request.server.sqlite },
      { userId: user.id, entryId: getEntryId(request) },
    );
    return { item };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEntryRequestError(reply, error);
  }
}
