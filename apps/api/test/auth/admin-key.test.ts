import type { FastifyRequest } from "fastify";
import { describe, expect, it, afterEach, beforeEach } from "vitest";

import { AdminKeyError, requireAdminKey } from "../../src/auth/admin-key";

const CORRECT_KEY = "super-secret-admin-key-for-tests";

function makeRequest(authorization?: string): FastifyRequest {
  return {
    headers: { authorization },
  } as unknown as FastifyRequest;
}

describe("requireAdminKey", () => {
  beforeEach(() => {
    process.env.HAAABIT_ADMIN_API_KEY = CORRECT_KEY;
  });

  afterEach(() => {
    delete process.env.HAAABIT_ADMIN_API_KEY;
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

  it("throws AdminKeyError 503 when HAAABIT_ADMIN_API_KEY is not set", async () => {
    delete process.env.HAAABIT_ADMIN_API_KEY;
    const request = makeRequest(`Bearer ${CORRECT_KEY}`);
    await expect(requireAdminKey(request)).rejects.toBeInstanceOf(AdminKeyError);
    await expect(requireAdminKey(request)).rejects.toMatchObject({ statusCode: 503 });
  });

  it("throws AdminKeyError 503 when HAAABIT_ADMIN_API_KEY is an empty string", async () => {
    process.env.HAAABIT_ADMIN_API_KEY = "";
    const request = makeRequest(`Bearer ${CORRECT_KEY}`);
    await expect(requireAdminKey(request)).rejects.toMatchObject({ statusCode: 503 });
  });
});
