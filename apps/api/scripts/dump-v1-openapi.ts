import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildV1RouteTable, generateV1OpenApi, type ApiV1Deps } from "../src/v1";

// Builds the v1 route table with a stub db (the table never touches the database
// at build time) and writes the OpenAPI artifact. Committed + frozen by
// test/v1/openapi.snapshot.test.ts so CI fails if the spec drifts.
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "openapi.v1.json");

export function buildSpecJson(): string {
  const spec = generateV1OpenApi(buildV1RouteTable({ db: {} as ApiV1Deps["db"], sqlite: {} as ApiV1Deps["sqlite"] }));
  return `${JSON.stringify(spec, null, 2)}\n`;
}

function main() {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, buildSpecJson());
  console.log(`Wrote ${OUTPUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
