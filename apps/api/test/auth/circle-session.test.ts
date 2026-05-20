import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { CircleAuthError, requireCircleContext } from "../../src/auth/circle-session";

vi.mock("../../src/auth/circle-token", () => ({
  findCircleByToken: vi.fn(),
}));

import { findCircleByToken } from "../../src/auth/circle-token";

const mockFindCircleByToken = vi.mocked(findCircleByToken);

function makeRequest(authorization?: string): FastifyRequest {
  return {
    headers: { authorization },
    server: { db: {} },
  } as unknown as FastifyRequest;
}

const CIRCLE_ID = "circle-abc";
const TOKEN = "haaabit_circle_deadbeef";
const TOKEN_ID = "token-xyz";
const CIRCLE = { id: CIRCLE_ID, name: "Test Circle", ownerId: "owner-1" };

describe("requireCircleContext", () => {
  it("throws 401 when Authorization header is missing", async () => {
    const request = makeRequest(undefined);
    await expect(requireCircleContext(request, CIRCLE_ID)).rejects.toMatchObject({
      statusCode: 401,
      message: "Circle token required",
    });
  });

  it("throws 401 when Authorization scheme is not Bearer", async () => {
    const request = makeRequest("Basic dXNlcjpwYXNz");
    await expect(requireCircleContext(request, CIRCLE_ID)).rejects.toMatchObject({
      statusCode: 401,
      message: "Circle token required",
    });
  });

  it("throws 401 when token is unknown", async () => {
    mockFindCircleByToken.mockResolvedValueOnce(null);
    const request = makeRequest(`Bearer ${TOKEN}`);
    await expect(requireCircleContext(request, CIRCLE_ID)).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid or unknown circle token",
    });
  });

  it("throws 403 when token belongs to a different circle", async () => {
    mockFindCircleByToken.mockResolvedValueOnce({
      circle: { ...CIRCLE, id: "circle-other" },
      tokenId: TOKEN_ID,
    });
    const request = makeRequest(`Bearer ${TOKEN}`);
    await expect(requireCircleContext(request, CIRCLE_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(requireCircleContext(request, CIRCLE_ID)).rejects.toBeInstanceOf(CircleAuthError);
  });

  it("returns CircleContext when token is valid and matches pathCircleId", async () => {
    mockFindCircleByToken.mockResolvedValueOnce({ circle: CIRCLE, tokenId: TOKEN_ID });
    const request = makeRequest(`Bearer ${TOKEN}`);
    const ctx = await requireCircleContext(request, CIRCLE_ID);
    expect(ctx).toEqual({ circle: CIRCLE, tokenId: TOKEN_ID });
  });
});
