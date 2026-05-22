import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The suite runs with `pool: forks` + `isolate: false` (see vitest.config.ts) for
// speed on the ARM host, which reuses each worker process across the files it runs.
// Once any earlier file in the same worker loads the *real* circle-token module, the
// cached copy would defeat a top-level hoisted `vi.mock` (module mocking needs an
// un-cached registry). So we reset the module registry before each test and import the
// subject under test dynamically, guaranteeing it re-binds to the mocked dependency
// regardless of file scheduling. This is the only file in the api suite that mocks.
const { mockFindCircleByToken } = vi.hoisted(() => ({ mockFindCircleByToken: vi.fn() }));
vi.mock("../../src/auth/circle-token", () => ({ findCircleByToken: mockFindCircleByToken }));

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
  beforeEach(async () => {
    vi.resetModules();
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
