import { z } from "zod";

import { registeredSchemas } from "./apiMeta";
import { v1FullPath, type V1RouteMeta } from "./match";

type JsonObject = Record<string, unknown>;

function routePathToOpenApi(path: string): string {
  return path.replaceAll(/:([a-zA-Z0-9_]+)/g, "{$1}");
}

/** Convert a schema to JSON Schema, degrading to `{}` if conversion throws. */
function toJsonSchema(schema: z.ZodType, io: "input" | "output"): unknown {
  try {
    return z.toJSONSchema(schema, {
      io,
      target: "draft-2020-12",
      unrepresentable: "any",
    });
  } catch {
    return {};
  }
}

function objectProperties(jsonSchema: unknown): [string, unknown][] {
  if (!jsonSchema || typeof jsonSchema !== "object") return [];
  const props = (jsonSchema as { properties?: unknown }).properties;
  if (!props || typeof props !== "object") return [];
  return Object.entries(props as JsonObject);
}

function requiredSet(jsonSchema: unknown): Set<string> {
  const required = (jsonSchema as { required?: unknown }).required;
  return new Set(Array.isArray(required) ? (required as string[]) : []);
}

/** Emit `parameters[]` (in: query/path) from a zod object schema. */
function toParameters(schema: z.ZodType | undefined, location: "query" | "path"): JsonObject[] {
  if (!schema) return [];
  const json = toJsonSchema(schema, "input");
  const required = requiredSet(json);
  return objectProperties(json).map(([name, value]) => ({
    name,
    in: location,
    required: location === "path" ? true : required.has(name),
    schema: value,
  }));
}

function buildComponents(): JsonObject {
  const schemas: JsonObject = {};
  for (const [id, schema] of registeredSchemas()) {
    schemas[id] = toJsonSchema(schema, "output");
  }
  return schemas;
}

const ERROR_REF = { $ref: "#/components/schemas/ErrorEnvelope" };

export function generateV1OpenApi(routes: V1RouteMeta[]): JsonObject {
  const paths: Record<string, JsonObject> = {};
  const resources = new Set<string>();

  for (const route of routes) {
    if (route.internal) {
      // Internal/meta endpoints (discovery, openapi, binary streams) are documented
      // only as a path stub so the spec stays self-describing without forcing schemas.
    }
    resources.add(route.resource);
    const openApiPath = routePathToOpenApi(v1FullPath(route));

    const operation: JsonObject = {
      operationId: route.operationId,
      summary: route.summary,
      description: route.description,
      tags: [route.resource],
      deprecated: route.deprecated ?? undefined,
      security: route.auth === "public" ? undefined : [{ bearerAuth: [] }],
      parameters: [...toParameters(route.paramsSchema, "path"), ...toParameters(route.querySchema, "query")],
      requestBody:
        route.method === "POST" && route.inputSchema
          ? {
              required: true,
              content: { "application/json": { schema: toJsonSchema(route.inputSchema, "input") } },
            }
          : undefined,
      responses: {
        [String(route.successStatus ?? 200)]: {
          description: "Success",
          content: route.outputSchema
            ? { "application/json": { schema: toJsonSchema(route.outputSchema, "output") } }
            : undefined,
        },
        "4XX": { description: "Client error", content: { "application/json": { schema: ERROR_REF } } },
        "5XX": { description: "Server error", content: { "application/json": { schema: ERROR_REF } } },
      },
    };

    paths[openApiPath] ??= {};
    paths[openApiPath][route.method.toLowerCase()] = operation;
  }

  const components = buildComponents();
  // Ensure the error envelope is always present so 4XX/5XX `$ref`s resolve.
  components.ErrorEnvelope ??= {
    type: "object",
    properties: {
      ok: { const: false },
      code: { type: "string" },
      error: { type: "string" },
    },
    required: ["ok", "code", "error"],
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "MikoshiTracker API v1",
      version: "1.0.0",
      description:
        "Versioned, self-describing API for MikoshiTracker. Uniform envelope ({ok,data} / {ok,code,error}), typed error codes, paginated lists, and OpenAPI components. Converges with the companion mikoshi /api/v1 conventions so a single frontend or AI tool can consume both.",
    },
    servers: [{ url: "/" }],
    tags: [...resources].sort().map((resource) => ({ name: resource })),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Personal API token, circle token, or the admin API key, depending on the operation's auth scope.",
        },
      },
      schemas: components,
    },
    paths,
  };
}
