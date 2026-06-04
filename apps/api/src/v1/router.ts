import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { resolveAdminOperator } from "../auth/admin-key";
import { requireAuthenticatedUser } from "../auth/session";
import { requireCircleContext } from "../auth/circle-session";
import { mapV1Error } from "./errors";
import { v1FullPath, type ApiV1Deps, type V1Principal, type V1RouteMeta } from "./match";

function parseWith<T>(schema: { parse: (value: unknown) => T } | undefined, value: unknown): T | undefined {
  return schema ? schema.parse(value) : undefined;
}

async function resolveAuth(
  route: V1RouteMeta,
  request: FastifyRequest,
  params: Record<string, unknown>,
): Promise<V1Principal> {
  switch (route.auth) {
    case "bearer": {
      const user = await requireAuthenticatedUser(request);
      return { kind: "user", user };
    }
    case "admin-key": {
      const operator = await resolveAdminOperator(request);
      return { kind: "admin", operator };
    }
    case "circle": {
      const circleId = String(params.circleId ?? "");
      await requireCircleContext(request, circleId);
      return { kind: "circle", circleId };
    }
    case "public":
      return { kind: "public" };
  }
}

function requestId(request: FastifyRequest): string {
  const header = request.headers["x-request-id"];
  const provided = Array.isArray(header) ? header[0] : header;
  return provided && provided.length > 0 ? provided : randomUUID();
}

async function runRoute(deps: ApiV1Deps, route: V1RouteMeta, request: FastifyRequest, reply: FastifyReply) {
  // Correlation id: honour an inbound X-Request-ID or mint one; echo on every
  // response (success or error) so a client/log can trace a single call.
  const id = requestId(request);
  reply.header("X-Request-ID", id);

  try {
    const params = (parseWith(route.paramsSchema, request.params) ?? request.params) as Record<string, unknown>;
    const principal = await resolveAuth(route, request, params);
    const input = parseWith(route.inputSchema, request.body ?? {});
    const query = parseWith(route.querySchema, request.query ?? {});

    const data = await route.handler({ deps, request, reply, principal, input, query, params });

    if (route.deprecated) {
      reply.header("Deprecation", "true");
      if (route.deprecationSuccessor) {
        reply.header("Link", `<${route.deprecationSuccessor}>; rel="successor-version"`);
      }
    }

    reply.status(route.successStatus ?? 200);
    return { ok: true as const, data };
  } catch (error) {
    const mapped = mapV1Error(error);
    if (mapped.status >= 500) {
      request.log.error({ err: error, requestId: id, path: v1FullPath(route) }, "v1 request failed");
    }
    reply.status(mapped.status);
    return { ok: false as const, code: mapped.code, error: mapped.message };
  }
}

/** Registers every route in the table onto Fastify under `/api/v1`. */
export function registerV1Routes(app: FastifyInstance, deps: ApiV1Deps, routes: V1RouteMeta[]): void {
  for (const route of routes) {
    const url = v1FullPath(route);
    const handler = (request: FastifyRequest, reply: FastifyReply) => runRoute(deps, route, request, reply);

    if (route.method === "GET") {
      app.get(url, handler);
    } else {
      app.post(url, handler);
    }
  }
}
