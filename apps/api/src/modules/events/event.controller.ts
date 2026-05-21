import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { getRequestTimestamp, sendAuthError } from "../../shared/controller-helpers";
import {
  EntryForEventInactiveError,
  EntryForEventNotFoundError,
  EventAlreadyDeletedError,
  EventNotFoundError,
  NothingToUndoError,
  deleteEvent,
  getEvent,
  listEvents,
  persistEvent,
  undoEvent,
  updateEvent,
} from "./event.service";
import { parseCreateEventInput } from "./event.schema";

function sendEventError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: "Invalid event payload",
      issues: error.flatten(),
    });
    return reply;
  }

  if (error instanceof EntryForEventNotFoundError) {
    reply.status(404).send({
      code: "NOT_FOUND",
      message: error.message,
    });
    return reply;
  }

  if (error instanceof EntryForEventInactiveError) {
    reply.status(409).send({
      code: "ENTRY_INACTIVE",
      message: error.message,
    });
    return reply;
  }

  if (error instanceof EventNotFoundError) {
    reply.status(404).send({
      code: "NOT_FOUND",
      message: error.message,
    });
    return reply;
  }

  if (error instanceof EventAlreadyDeletedError) {
    reply.status(409).send({
      code: "EVENT_DELETED",
      message: error.message,
    });
    return reply;
  }

  if (error instanceof NothingToUndoError) {
    reply.status(409).send({
      code: "NOTHING_TO_UNDO",
      message: error.message,
    });
    return reply;
  }

  throw error;
}

function getEntryId(request: FastifyRequest) {
  return (request.params as { id: string }).id;
}

function getEventId(request: FastifyRequest) {
  return (request.params as { eventId: string }).eventId;
}

export async function createEventHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const parsed = parseCreateEventInput(request.body);
    const item = await persistEvent(
      { db: request.server.db },
      {
        entryId: getEntryId(request),
        userId: user.id,
        occurredAt: new Date(parsed.occurredAt),
        payload: parsed.payload,
        source: parsed.source,
        note: parsed.note,
        attachmentIds: parsed.attachmentIds ?? [],
      },
    );
    reply.status(201);
    return { item };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEventError(reply, error);
  }
}

export async function listEventsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    return await listEvents({ db: request.server.db }, { userId: user.id, filters: request.query });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEventError(reply, error);
  }
}

export async function getEventHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const item = await getEvent(
      { db: request.server.db },
      { eventId: getEventId(request), userId: user.id },
    );
    return { item };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEventError(reply, error);
  }
}

export async function updateEventHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const item = await updateEvent(
      { db: request.server.db },
      {
        eventId: getEventId(request),
        userId: user.id,
        input: request.body,
      },
    );
    return { item };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEventError(reply, error);
  }
}

export async function deleteEventHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    return await deleteEvent(
      { db: request.server.db },
      { eventId: getEventId(request), userId: user.id },
    );
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEventError(reply, error);
  }
}

export async function undoEventHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const item = await undoEvent(
      { db: request.server.db },
      { eventId: getEventId(request), userId: user.id },
    );
    return { item };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendEventError(reply, error);
  }
}
