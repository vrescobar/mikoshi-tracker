import type { ApiV1Deps } from "../../../src/v1";
import { createTestContext, type TestContext } from "../../helpers/app";

/**
 * Builds a complete `ApiV1Deps` over an isolated test database, for tests that
 * actually execute v1 handlers. The route-table contract test does not need
 * this (it only inspects metadata) and uses a cheap stub instead.
 */
export async function createV1DepsContext(): Promise<{ deps: ApiV1Deps; ctx: TestContext }> {
  const ctx = await createTestContext();
  return { deps: { db: ctx.app.db, sqlite: ctx.app.sqlite }, ctx };
}
