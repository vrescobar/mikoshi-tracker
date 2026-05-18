import type { FastifyRequest } from "fastify";

import { findCircleByToken } from "./circle-token";

export class CircleAuthError extends Error {
  constructor(
    public readonly statusCode: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "CircleAuthError";
  }
}

export interface CircleContext {
  circle: { id: string; name: string; ownerId: string };
  tokenId: string;
}

function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;

  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ", 2);

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireCircleContext(
  request: FastifyRequest,
  pathCircleId: string,
): Promise<CircleContext> {
  const bearer = getBearerToken(request);

  if (!bearer) {
    throw new CircleAuthError(401, "Circle token required");
  }

  const result = await findCircleByToken(request.server.db, bearer);

  if (!result) {
    throw new CircleAuthError(401, "Invalid or unknown circle token");
  }

  if (result.circle.id !== pathCircleId) {
    throw new CircleAuthError(403, "Circle token is not valid for this circle");
  }

  return {
    circle: result.circle,
    tokenId: result.tokenId,
  };
}
