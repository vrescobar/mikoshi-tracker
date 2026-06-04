import type { FastifyRequest } from "fastify";
import { describe, expect, it, afterEach, beforeEach } from "vitest";

import { AdminKeyError, requireAdminKey, resolveAdminOperator } from "../../src/auth/admin-key";

const CORRECT_KEY = "super-secret-admin-key-for-tests";

/**
 * Minimal request mock. `adminToken` is what the named-token lookup
 * (`adminToken.findUnique`) returns when the static key doesn't match — null by
 * default so wrong-key cases fall through to a 401.
 */
function makeRequest(
  authorization?: string,
  adminToken: { id: string; label: string; revoked: boolean } | null = null,
): FastifyRequest {
  return {
    headers: { authorization },
    server: {
      db: {
        adminToken: {
          findUnique: () => Promise.resolve(adminToken),
          update: () => Promise.resolve(undefined),
        },
      },
    },
  } as unknown as FastifyRequest;
}

describe("requireAdminKey", () => {
  beforeEach(() => {
    process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = CORRECT_KEY;
  });

  afterEach(() => {
    delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
  });

  it("resolves when the correct key is provided", async () => {
    const request = makeRequest(`Bearer ${CORRECT_KEY}`);
    await expect(requireAdminKey(request)).resolves.toBeUndefined();
  });

  it("throws AdminKeyError 401 when Authorization header is missing", async () => {
    const request = makeRequest(undefined);
    await expect(requireAdminKey(request)).rejects.toBeInstanceOf(AdminKeyError);
    await expect(requireAdminKey(request)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws AdminKeyError 401 when Authorization scheme is not Bearer", async () => {
    const request = makeRequest("Basic dXNlcjpwYXNz");
    await expect(requireAdminKey(request)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("throws AdminKeyError 401 when the key is wrong", async () => {
    const request = makeRequest("Bearer wrong-key");
    await expect(requireAdminKey(request)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws AdminKeyError 401 when the key is a prefix of the correct key", async () => {
    const request = makeRequest(`Bearer ${CORRECT_KEY.slice(0, -1)}`);
    await expect(requireAdminKey(request)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws AdminKeyError 401 when the key is longer than the correct key", async () => {
    const request = makeRequest(`Bearer ${CORRECT_KEY}x`);
    await expect(requireAdminKey(request)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws AdminKeyError 503 when MIKOSHI_TRACKER_ADMIN_API_KEY is not set", async () => {
    delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
    const request = makeRequest(`Bearer ${CORRECT_KEY}`);
    await expect(requireAdminKey(request)).rejects.toBeInstanceOf(AdminKeyError);
    await expect(requireAdminKey(request)).rejects.toMatchObject({ statusCode: 503 });
  });

  it("throws AdminKeyError 503 when MIKOSHI_TRACKER_ADMIN_API_KEY is an empty string", async () => {
    process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = "";
    const request = makeRequest(`Bearer ${CORRECT_KEY}`);
    await expect(requireAdminKey(request)).rejects.toMatchObject({ statusCode: 503 });
  });

  it("resolves the static root key as the 'env' operator", async () => {
    const operator = await resolveAdminOperator(makeRequest(`Bearer ${CORRECT_KEY}`));
    expect(operator).toEqual({ type: "env", id: "env", label: "root" });
  });

  it("resolves a live named token as a 'token' operator", async () => {
    const request = makeRequest("Bearer mikoshi_tracker_admin_xyz", {
      id: "tok_1",
      label: "mikoshi-bot",
      revoked: false,
    });
    const operator = await resolveAdminOperator(request);
    expect(operator).toEqual({ type: "token", id: "tok_1", label: "mikoshi-bot" });
  });

  it("rejects a revoked named token with 401", async () => {
    const request = makeRequest("Bearer mikoshi_tracker_admin_xyz", {
      id: "tok_1",
      label: "old",
      revoked: true,
    });
    await expect(resolveAdminOperator(request)).rejects.toMatchObject({ statusCode: 401 });
  });
});
