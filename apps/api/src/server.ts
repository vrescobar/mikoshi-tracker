import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import type { PrismaClient } from "./generated/prisma/client";
import {
  API_DOCS_PATH,
  API_SPEC_PATH,
  getPersonalApiToken,
  migrateLegacyPersonalApiTokens,
  resetPersonalApiToken,
} from "./auth/api-token";
import { getActAsUserId } from "./auth/act-as";
import { AdminKeyError, resolveAdminOperator } from "./auth/admin-key";
import { registerAuth } from "./auth/auth";
import { recordAdminAction } from "./modules/admin/admin-audit.service";
import {
  getRegistrationStatus,
  isUserAdmin,
  makeFirstUserAdmin,
  promoteUserToAdmin,
  setRegistrationEnabled,
} from "./auth/registration";
import { AuthSessionError, assertOwnsUser, requireSession } from "./auth/session";
import { registerAdminRoutes } from "./modules/admin/admin.routes";
import { registerAggregationRoutes } from "./modules/aggregations/aggregation.routes";
import { registerAttachmentRoutes } from "./modules/attachments/attachment.routes";
import { registerSkillRoutes } from "./modules/skills/skill.routes";
import { registerCircleRoutes } from "./modules/circles/circle.routes";
import { registerEntryRoutes } from "./modules/entries/entry.routes";
import { registerEntryTypeRoutes } from "./modules/entry-types/entry-type.routes";
import { registerEventRoutes } from "./modules/events/event.routes";
import { invalidateSchemaCache } from "./modules/entry-types/schema-cache";
import { seedBuiltInEntryTypes } from "./modules/entry-types/seed";
import { registerHabitRoutes } from "./modules/habits/habit.routes";
import { registerStatsRoutes } from "./modules/stats/stats.routes";
import { registerTodayRoutes } from "./modules/today/today.routes";
import { registerCors } from "./plugins/cors";
import { registerDb } from "./plugins/db";
import { registerEnv } from "./plugins/env";
import { registerMultipart } from "./plugins/multipart";
import { registerOpenApi } from "./plugins/openapi";
import { registerV1 } from "./v1";
import { authRateLimitOptions, registerSecurity } from "./plugins/security";
import { normalizeUserTimeZone } from "./shared/timezone";
import { sendAuthError } from "./shared/controller-helpers";

type CreateAppOptions = {
  env?: Partial<NodeJS.ProcessEnv>;
  logger?: boolean;
  prisma?: PrismaClient;
};

function buildAuthProxyRequest(request: FastifyRequest) {
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  const headers = new Headers();

  Object.entries(request.headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(key, entry));
    } else if (value) {
      headers.append(key, value);
    }
  });

  return new Request(url.toString(), {
    method: request.method,
    headers,
    body: request.body ? JSON.stringify(request.body) : undefined,
  });
}

async function sendProxyResponse(reply: FastifyReply, response: Response) {
  const body = response.body ? await response.text() : null;

  reply.status(response.status);
  response.headers.forEach((value, key) => reply.header(key, value));
  reply.send(body);
}

export async function createApp(options: CreateAppOptions = {}) {
  const app = fastify({
    logger: options.logger ?? false,
    // The API is only reachable through the Caddy reverse proxy, which sets
    // X-Forwarded-For. trustProxy lets rate limiting key on the real client IP.
    trustProxy: true,
  });
  const defaultJsonParser = app.getDefaultJsonParser("ignore", "ignore");

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const rawBody = typeof body === "string" ? body : body.toString("utf8");

    if (rawBody.trim().length === 0) {
      done(null, {});
      return;
    }

    defaultJsonParser(request, rawBody, done);
  });

  await registerEnv(app, options.env);
  await registerDb(app, options.prisma);
  await migrateLegacyPersonalApiTokens(app.db);
  await registerCors(app);
  await registerSecurity(app);
  await registerMultipart(app);
  await registerAuth(app);
  await registerAdminRoutes(app);
  await registerHabitRoutes(app);
  invalidateSchemaCache();
  await seedBuiltInEntryTypes(app.db);
  await registerEntryTypeRoutes(app);
  await registerEntryRoutes(app);
  await registerEventRoutes(app);
  await registerAggregationRoutes(app);
  await registerStatsRoutes(app);
  await registerTodayRoutes(app);
  await registerCircleRoutes(app);
  await registerAttachmentRoutes(app);
  await registerSkillRoutes(app);
  await registerOpenApi(app);
  await registerV1(app);

  // God-mode audit for LEGACY routes: every successful impersonated mutation
  // outside /api/v1 (which audits itself per operation in v1/router.ts) is
  // attributed to the resolving operator. Best-effort — an audit write must
  // never turn an already-applied mutation into an error response.
  const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  app.addHook("onResponse", async (request, reply) => {
    if (!request.impersonation) return;
    if (!mutatingMethods.has(request.method)) return;
    if (reply.statusCode >= 400) return;

    const routePath = request.routeOptions.url ?? request.url;
    if (routePath.startsWith("/api/v1")) return;

    try {
      await recordAdminAction(
        { db: app.db },
        {
          operator: request.impersonation.operator,
          action: `impersonate.legacy.${request.method} ${routePath}`,
          targetType: "user",
          targetId: request.impersonation.userId,
          metadata: { method: request.method, path: request.url },
        },
      );
    } catch (auditError) {
      request.log.error({ err: auditError }, "legacy impersonation audit write failed");
    }
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/auth/registration", async () => getRegistrationStatus(app.db));

  app.post("/api/auth/sign-up/email", authRateLimitOptions(app), async (request, reply) => {
    const status = await getRegistrationStatus(app.db);
    const payload =
      typeof request.body === "object" && request.body !== null ? (request.body as Record<string, unknown>) : undefined;
    const requestedTimeZone = typeof payload?.timezone === "string" ? payload.timezone : undefined;
    const timezone = normalizeUserTimeZone(requestedTimeZone);

    if (status.hasUsers && !status.registrationEnabled) {
      reply.status(403).send({
        code: "FORBIDDEN",
        message: "Registration is currently disabled",
      });
      return reply;
    }

    const response = await app.auth.handler(buildAuthProxyRequest(request));
    const body = response.body ? await response.text() : null;

    if (response.ok && body) {
      try {
        const parsed = JSON.parse(body) as { user?: { id?: string } };

        if (typeof parsed.user?.id === "string") {
          await app.db.user.update({
            where: {
              id: parsed.user.id,
            },
            data: {
              timezone,
            },
          });
          await makeFirstUserAdmin(app.db, parsed.user.id);
        }
      } catch {
        // Ignore non-JSON bodies from auth provider.
      }
    }

    reply.status(response.status);
    response.headers.forEach((value, key) => reply.header(key, value));
    reply.send(body);
  });

  app.all("/api/auth/*", authRateLimitOptions(app), async (request, reply) => {
    const response = await app.auth.handler(buildAuthProxyRequest(request));
    await sendProxyResponse(reply, response);
  });

  app.get("/api/session", async (request, reply) => {
    try {
      // God-mode: with `x-act-as-user` + a valid admin credential the session
      // endpoint answers as the TARGET user (identity, isAdmin, timezone) plus
      // an `impersonating` marker, so every user page renders the target with
      // timezone-correct "today" bucketing and the UI can show a banner.
      const actAsUserId = getActAsUserId(request);
      if (actAsUserId) {
        const operator = await resolveAdminOperator(request);
        const target = await app.db.user.findUnique({
          where: { id: actAsUserId },
          select: { id: true, email: true, name: true, isAdmin: true, timezone: true },
        });
        if (!target) {
          reply.status(404).send({
            code: "NOT_FOUND",
            message: `Impersonation target user not found: ${actAsUserId}`,
          });
          return await reply;
        }
        return {
          user: {
            id: target.id,
            email: target.email,
            name: target.name,
            isAdmin: target.isAdmin,
          },
          timezone: target.timezone ?? "UTC",
          impersonating: { operator: { type: operator.type, label: operator.label } },
        };
      }

      const session = await requireSession(request);

      const dbUser = await app.db.user.findUnique({
        where: { id: session.user.id },
        select: { timezone: true },
      });

      return {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          isAdmin: await isUserAdmin(app.db, session.user.id),
        },
        // Timezone-aware "today" for client pages (food timeline, insights, dashboard)
        // so they match the timezone the API uses to bucket EntryEvent.dateKey.
        timezone: dbUser?.timezone ?? "UTC",
      };
    } catch (error) {
      if (error instanceof AuthSessionError) {
        sendAuthError(reply, error);
        return reply;
      }
      if (error instanceof AdminKeyError) {
        reply.status(error.statusCode).send({
          code: error.statusCode === 401 ? "UNAUTHORIZED" : "SERVICE_UNAVAILABLE",
          message: error.message,
        });
        return reply;
      }

      throw error;
    }
  });

  app.post("/api/test/session/promote-admin", async (request, reply) => {
    if (app.env.NODE_ENV !== "test") {
      reply.status(404).send({
        code: "NOT_FOUND",
        message: "Not found",
      });
      return reply;
    }

    try {
      const session = await requireSession(request);

      await promoteUserToAdmin(app.db, session.user.id);

      return {
        ok: true,
      };
    } catch (error) {
      if (error instanceof AuthSessionError) {
        sendAuthError(reply, error);
        return reply;
      }

      throw error;
    }
  });

  app.get("/api/users/:userId/ownership", async (request, reply) => {
    try {
      const session = await requireSession(request);
      assertOwnsUser(session, (request.params as { userId: string }).userId);

      return { ok: true };
    } catch (error) {
      if (error instanceof AuthSessionError) {
        sendAuthError(reply, error);
        return reply;
      }

      throw error;
    }
  });

  app.get("/api/admin/registration", async (request, reply) => {
    try {
      const session = await requireSession(request);
      const admin = await isUserAdmin(app.db, session.user.id);

      if (!admin) {
        throw new AuthSessionError(403, "Forbidden");
      }

      const status = await getRegistrationStatus(app.db);

      return {
        registrationEnabled: status.registrationEnabled,
      };
    } catch (error) {
      if (error instanceof AuthSessionError) {
        sendAuthError(reply, error);
        return reply;
      }

      throw error;
    }
  });

  app.post("/api/admin/registration", async (request, reply) => {
    try {
      const session = await requireSession(request);
      const admin = await isUserAdmin(app.db, session.user.id);

      if (!admin) {
        throw new AuthSessionError(403, "Forbidden");
      }

      const parsed = z
        .object({
          registrationEnabled: z.boolean(),
        })
        .parse(request.body);

      const settings = await setRegistrationEnabled(app.db, parsed.registrationEnabled);

      return {
        registrationEnabled: settings.registrationEnabled,
      };
    } catch (error) {
      if (error instanceof AuthSessionError) {
        sendAuthError(reply, error);
        return reply;
      }

      if (error instanceof z.ZodError) {
        reply.status(400).send({
          code: "BAD_REQUEST",
          message: "Invalid registration settings payload",
          issues: error.flatten(),
        });
        return reply;
      }

      throw error;
    }
  });

  app.get("/api/api-access/token", async (request, reply) => {
    try {
      const session = await requireSession(request);
      const currentToken = await getPersonalApiToken(app.db, session.user.id);

      return {
        token: null,
        hasToken: currentToken != null,
        lastRotatedAt: currentToken?.updatedAt.toISOString() ?? null,
        docsPath: API_DOCS_PATH,
        specPath: API_SPEC_PATH,
      };
    } catch (error) {
      if (error instanceof AuthSessionError) {
        sendAuthError(reply, error);
        return reply;
      }

      throw error;
    }
  });

  app.post("/api/api-access/token/reset", async (request, reply) => {
    try {
      const session = await requireSession(request);
      const token = await resetPersonalApiToken(app.db, session.user.id);

      return {
        token: token.token,
        hasToken: true,
        lastRotatedAt: token.updatedAt.toISOString(),
        docsPath: API_DOCS_PATH,
        specPath: API_SPEC_PATH,
      };
    } catch (error) {
      if (error instanceof AuthSessionError) {
        sendAuthError(reply, error);
        return reply;
      }

      throw error;
    }
  });

  await app.ready();

  return app;
}

async function start() {
  const app = await createApp();
  await app.listen({
    port: app.env.PORT,
    host: "0.0.0.0",
  });
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(entrypoint).href;
}

if (isDirectExecution()) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
