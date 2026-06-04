import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { errorCodeSchema } from "@mikoshi-tracker/contracts/errors";

import { DOMAIN_ERROR_TABLE } from "../../src/v1/errors";

const V1_SRC_DIR = fileURLToPath(new URL("../../src/v1", import.meta.url));
const CODES = new Set<string>(errorCodeSchema.options);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : [];
  });
}

describe("v1 error catalogue", () => {
  it("every code mapped from a domain error is in the ErrorCode enum", () => {
    for (const { code } of Object.values(DOMAIN_ERROR_TABLE)) {
      expect(CODES.has(code), `unknown code ${code}`).toBe(true);
    }
  });

  it("every V1ApiError literal in src/v1 uses a code from the enum (guards against `as ErrorCode` casts)", () => {
    const literals = new Set<string>();
    for (const file of walk(V1_SRC_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/new V1ApiError\(\s*[^,]+,\s*"([A-Z_]+)"/g)) {
        literals.add(match[1]);
      }
    }
    for (const code of literals) {
      expect(CODES.has(code), `V1ApiError uses code not in enum: ${code}`).toBe(true);
    }
  });
});
