import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

/**
 * Security hardening for public exposure: HTTP security headers (helmet) and
 * IP-based rate limiting (global + a stricter limit for auth routes).
 *
 * In the `test` environment the limits are raised to an effectively-unlimited
 * value so the E2E suite (many sign-ins from 127.0.0.1) does not flake.
 */

const GLOBAL_MAX = 300;
const AUTH_MAX = 20;
const TEST_MAX = 1_000_000;

function isTestEnv(app: FastifyInstance): boolean {
  return app.env.NODE_ENV === "test";
}

/**
 * Per-route option object that tightens the rate limit on authentication
 * endpoints (sign-in / sign-up / password) to slow down brute-force attempts.
 */
export function authRateLimitOptions(app: FastifyInstance) {
  return {
    config: {
      rateLimit: {
        max: isTestEnv(app) ? TEST_MAX : AUTH_MAX,
        timeWindow: "1 minute",
      },
    },
  };
}

export async function registerSecurity(app: FastifyInstance): Promise<void> {
  await app.register(fastifyHelmet, {
    // The /api/docs page is server-rendered HTML with an inline <style> block.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(fastifyRateLimit, {
    global: true,
    max: isTestEnv(app) ? TEST_MAX : GLOBAL_MAX,
    timeWindow: "1 minute",
  });
}
