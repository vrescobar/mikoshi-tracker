import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { buildV1RouteTable, generateV1OpenApi, type ApiV1Deps, type V1RouteMeta } from "../../src/v1";

/**
 * The contract "ratchet": every v1 route must be schema-complete. Resources not
 * yet wired live in COVERAGE_ALLOWLIST and are skipped; each stage shrinks the
 * allowlist until it is empty (only permanent exclusions remain). This makes
 * progress measurable and prevents regression — a newly added route without
 * schemas fails immediately unless explicitly allowlisted.
 */
const COVERAGE_ALLOWLIST = new Set<string>([
  // (stage 3+) resource paths land here until their schemas are wired, e.g.:
  // "GET /entries",
]);

/**
 * Permanent exclusions: binary streams and meta endpoints that legitimately
 * cannot be modeled as a typed JSON request/response (documented per mikoshi's
 * "no silent caps" rule). The discovery + openapi routes are registered outside
 * the table, so they never appear here.
 */
const PERMANENT_EXCLUSIONS = new Set<string>([]);

// The table is built from deps but never executes handlers here, so a stub db
// is sufficient for inspecting metadata.
const stubDeps = { db: {} as ApiV1Deps["db"] };

function routeKey(route: V1RouteMeta): string {
  return `${route.method} ${route.path}`;
}

function jsonSchemaIsSound(schema: z.ZodType, io: "input" | "output"): boolean {
  const result = z.toJSONSchema(schema, { io, target: "draft-2020-12", unrepresentable: "any" });
  return result !== undefined && typeof result === "object";
}

describe("v1 contract ratchet", () => {
  const routes = buildV1RouteTable(stubDeps);

  it("every route has a non-empty resource", () => {
    for (const route of routes) {
      expect(route.resource, `${routeKey(route)} missing resource`).toBeTruthy();
    }
  });

  it("every mutation (POST) declares an inputSchema", () => {
    for (const route of routes) {
      if (route.method !== "POST" || route.internal) continue;
      const key = routeKey(route);
      if (COVERAGE_ALLOWLIST.has(key) || PERMANENT_EXCLUSIONS.has(key)) continue;
      expect(route.inputSchema, `${key} must declare inputSchema`).toBeDefined();
    }
  });

  it("every list (GET) declares query + output schemas", () => {
    for (const route of routes) {
      if (!route.list || route.internal) continue;
      const key = routeKey(route);
      if (COVERAGE_ALLOWLIST.has(key) || PERMANENT_EXCLUSIONS.has(key)) continue;
      expect(route.querySchema, `${key} must declare querySchema`).toBeDefined();
      expect(route.outputSchema, `${key} must declare outputSchema`).toBeDefined();
    }
  });

  it("every declared schema converts to JSON Schema without throwing or returning undefined", () => {
    for (const route of routes) {
      if (route.inputSchema)
        expect(jsonSchemaIsSound(route.inputSchema, "input"), `${routeKey(route)} input`).toBe(true);
      if (route.querySchema)
        expect(jsonSchemaIsSound(route.querySchema, "input"), `${routeKey(route)} query`).toBe(true);
      if (route.paramsSchema)
        expect(jsonSchemaIsSound(route.paramsSchema, "input"), `${routeKey(route)} params`).toBe(true);
      if (route.outputSchema)
        expect(jsonSchemaIsSound(route.outputSchema, "output"), `${routeKey(route)} output`).toBe(true);
    }
  });

  it("allowlisted paths still exist in the table (no stale entries)", () => {
    const keys = new Set(routes.map(routeKey));
    for (const allowed of COVERAGE_ALLOWLIST) {
      expect(keys.has(allowed), `stale allowlist entry: ${allowed}`).toBe(true);
    }
  });
});

describe("v1 OpenAPI validity", () => {
  const spec = generateV1OpenApi(buildV1RouteTable(stubDeps)) as {
    openapi: string;
    paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
  };

  it("is OpenAPI 3.1 with components + bearerAuth", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.components.schemas).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
  });

  it("defines the ErrorEnvelope every operation's 4XX/5XX references", () => {
    expect(spec.components.schemas.ErrorEnvelope).toBeDefined();
  });

  it("every $ref resolves to a defined component", () => {
    const json = JSON.stringify(spec);
    const refs = [...json.matchAll(/"\$ref":\s*"#\/components\/schemas\/([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      expect(spec.components.schemas[ref], `unresolved $ref: ${ref}`).toBeDefined();
    }
  });

  it("every operation declares 4XX and 5XX error responses", () => {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        expect(op.responses?.["4XX"], `${method} ${path} missing 4XX`).toBeDefined();
        expect(op.responses?.["5XX"], `${method} ${path} missing 5XX`).toBeDefined();
      }
    }
  });
});
