import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildSpecJson } from "../../scripts/dump-v1-openapi";

const ARTIFACT = join(fileURLToPath(new URL("../../", import.meta.url)), "docs", "openapi.v1.json");

describe("v1 OpenAPI snapshot (anti-drift)", () => {
  it("matches the committed docs/openapi.v1.json", () => {
    expect(existsSync(ARTIFACT), "run `bun run scripts/dump-v1-openapi.ts`").toBe(true);
    const committed = readFileSync(ARTIFACT, "utf8");
    expect(buildSpecJson()).toBe(committed);
  });
});
