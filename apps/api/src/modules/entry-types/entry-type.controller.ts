import type { FastifyReply, FastifyRequest } from "fastify";

import { AuthSessionError, requireAuthenticatedUser } from "../../auth/session";
import { sendAuthError } from "../../shared/controller-helpers";

function serializeEntryType(et: {
  id: string;
  slug: string;
  displayName: string;
  cadence: string;
  payloadSchema: string;
  configSchema: string;
  aggregations: string;
  skillSlug: string | null;
  isBuiltIn: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: et.id,
    slug: et.slug,
    displayName: et.displayName,
    cadence: et.cadence,
    payloadSchema: JSON.parse(et.payloadSchema) as unknown,
    configSchema: JSON.parse(et.configSchema) as unknown,
    aggregations: JSON.parse(et.aggregations) as unknown,
    skillSlug: et.skillSlug,
    isBuiltIn: et.isBuiltIn,
    isActive: et.isActive,
    createdAt: et.createdAt.toISOString(),
    updatedAt: et.updatedAt.toISOString(),
  };
}

export async function listEntryTypesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAuthenticatedUser(request);
    const items = await request.server.db.entryType.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
    return { items: items.map(serializeEntryType) };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    throw error;
  }
}

export async function getEntryTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await requireAuthenticatedUser(request);
    const { slug } = request.params as { slug: string };
    const entryType = await request.server.db.entryType.findUnique({ where: { slug } });
    if (!entryType?.isActive) {
      return await reply.status(404).send({ code: "NOT_FOUND", message: "Entry type not found" });
    }
    return { item: serializeEntryType(entryType) };
  } catch (error) {
    if (error instanceof AuthSessionError) {
      sendAuthError(reply, error);
      return reply;
    }
    throw error;
  }
}
