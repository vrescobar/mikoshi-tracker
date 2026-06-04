import { z } from "zod";

/**
 * Registers a resource schema under a stable `id` so the OpenAPI generator can
 * emit it once into `components.schemas` and have operations reference it by
 * `$ref` instead of inlining. Returns the same schema for fluent use.
 *
 * Registration is idempotent: calling twice with the same id is a no-op, which
 * keeps `buildV1RouteTable` safe to call repeatedly (tests build it per case).
 */
const registered = new Map<string, z.ZodType>();

export function registerSchema<T extends z.ZodType>(id: string, schema: T): T {
  if (!registered.has(id)) {
    registered.set(id, schema);
    schema.meta({ id });
  }
  return schema;
}

export function registeredSchemas(): ReadonlyMap<string, z.ZodType> {
  return registered;
}
