import type { FastifyRequest } from "fastify";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

import * as circleTokenModule from "../../src/auth/circle-token";

// `mock.module` registers a process-global module override that subsequent
// imports resolve to. Bun runs the whole suite in one process, so we snapshot
// the real module first and restore it in afterAll — otherwise the mock would
// leak into other files (e.g. the real circle-token DB tests). We import the
// subject under test dynamically (in beforeEach) so it binds to the mock.
const realCircleToken = { ...circleTokenModule };
const mockFindCircleByToken = mock();
mock.module("../../src/auth/circle-token", () => ({ findCircleByToken: mockFindCircleByToken }));

type CircleSessionModule = typeof import("../../src/auth/circle-session");
let requireCircleContext: CircleSessionModule["requireCircleContext"];
let CircleAuthError: CircleSessionModule["CircleAuthError"];

function makeRequest(authorization?: string): FastifyRequest {
  return {
    headers: { authorization },
    server: { db: {} },
  } as unknown as FastifyRequest;
}

const CIRCLE_ID = "circle-abc";
const TOKEN = "mikoshi_tracker_circle_deadbeef";
const TOKEN_ID = "token-xyz";
const CIRCLE = { id: CIRCLE_ID, name: "Test Circle", ownerId: "owner-1" };

describe("requireCircleContext", () => {
  afterAll(() => {
    // Restore the real module so the mock does not leak into other test files.
    mock.module("../../src/auth/circle-token", () => realCircleToken);
  });

  beforeEach(async () => {
    mockFindCircleByToken.mockReset();
    ({ requireCircleContext, CircleAuthError } = await import("../../src/auth/circle-session"));
  });

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
    mockFindCircleByToken.mockResolvedValue({
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
