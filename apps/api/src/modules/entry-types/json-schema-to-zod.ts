import { z } from "zod";

interface JsonSchemaNode {
  type?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  nullable?: boolean;
  additionalProperties?: boolean | Record<string, unknown>;
}

/**
 * Compiles a JSON Schema subset into a Zod schema for runtime validation.
 * Supported subset: type (string|number|integer|boolean|object|array), enum,
 * required, properties, items, minimum, maximum, minLength, nullable, and
 * strict object mode (additionalProperties: false).
 */
export function jsonSchemaToZod(schema: unknown): z.ZodType {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new Error("JSON Schema root must be a plain object");
  }
  return compileNode(schema as JsonSchemaNode);
}

function compileNode(node: JsonSchemaNode): z.ZodType {
  if (node.enum !== undefined) {
    const values = node.enum as [string, ...string[]];
    const schema = z.enum(values);
    return node.nullable ? schema.nullable() : schema;
  }

  switch (node.type) {
    case "string": {
      let s = z.string();
      if (node.minLength !== undefined) s = s.min(node.minLength);
      return node.nullable ? s.nullable() : s;
    }

    case "number": {
      let n = z.number();
      if (node.minimum !== undefined) n = n.min(node.minimum);
      if (node.maximum !== undefined) n = n.max(node.maximum);
      return node.nullable ? n.nullable() : n;
    }

    case "integer": {
      let n = z.number().int();
      if (node.minimum !== undefined) n = n.min(node.minimum);
      if (node.maximum !== undefined) n = n.max(node.maximum);
      return node.nullable ? n.nullable() : n;
    }

    case "boolean": {
      const b = z.boolean();
      return node.nullable ? b.nullable() : b;
    }

    case "object": {
      const shape: Record<string, z.ZodType> = {};
      const required = new Set(node.required ?? []);
      for (const [key, propDef] of Object.entries(node.properties ?? {})) {
        const prop = compileNode(propDef);
        shape[key] = required.has(key) ? prop : prop.optional();
      }
      const obj =
        node.additionalProperties === false ? z.object(shape).strict() : z.object(shape);
      return node.nullable ? obj.nullable() : obj;
    }

    case "array": {
      const items = node.items !== undefined ? compileNode(node.items) : z.unknown();
      const arr = z.array(items);
      return node.nullable ? arr.nullable() : arr;
    }

    default:
      throw new Error(`Unsupported JSON Schema type: "${String(node.type)}"`);
  }
}
