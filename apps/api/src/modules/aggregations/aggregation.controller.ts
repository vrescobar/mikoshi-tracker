import { ZodError } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { sendAuthError } from "../../shared/controller-helpers";
import {
  EntryTypeForAggregationNotFoundError,
  computeAggregations,
} from "./aggregation.service";
import { parseAggregationFilters } from "./aggregation.schema";

function sendAggregationError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    reply.status(400).send({
      code: "BAD_REQUEST",
      message: "Invalid aggregation filters",
      issues: error.flatten(),
    });
    return reply;
  }

  if (error instanceof EntryTypeForAggregationNotFoundError) {
    reply.status(404).send({
      code: "NOT_FOUND",
      message: error.message,
    });
    return reply;
  }

  throw error;
}

export async function getAggregationsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await requireAuthenticatedUser(request);
    const filters = parseAggregationFilters(request.query);
    const result = await computeAggregations(
      { db: request.server.db, sqlite: request.server.sqlite },
      {
        userId: user.id,
        entryTypeSlug: filters.entryTypeSlug,
        entryId: filters.entryId,
        from: filters.from,
        to: filters.to,
        groupBy: filters.groupBy,
        fields: filters.fields,
        include: filters.include,
        groupByPayload: filters.groupByPayload,
        limit: filters.limit,
      },
    );
    return result;
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    return sendAggregationError(reply, error);
  }
}
