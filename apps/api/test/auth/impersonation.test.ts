import type { FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { AdminKeyError } from "../../src/auth/admin-key";
import { ACT_AS_HEADER, resolveBearerOrImpersonation } from "../../src/auth/impersonation";
import { V1ApiError } from "../../src/v1/errors";

const ADMIN_KEY = "super-secret-admin-key-for-tests";
const TARGET_USER = { id: "user_target", name: "Target", email: "t@example.com", timezone: "UTC" };

// bun:sqlite-shaped stub. `getUserById` and `findUserByApiToken` both go through
// `.get(sql, params)`; we branch on the SQL so impersonation (User by id) and the
// personal-token fallback (ApiToken join) resolve independently.
type SqliteStub = {
  get: (sql: string, params?: unknown[]) => unknown;
  run: () => { changes: number; lastInsertRowid: number };
};

function makeDb(opts: { apiTokenUser?: { id: string; name: string } | null } = {}): SqliteStub {
  return {
    get: (sql: string, params?: unknown[]) => {
      if (sql.includes('"ApiToken"')) {
        return opts.apiTokenUser ?? null;
      }
      // getUserById: SELECT * FROM "User" WHERE id = ?
      return params?.[0] === TARGET_USER.id ? TARGET_USER : null;
    },
    run: () => ({ changes: 0, lastInsertRowid: 0 }),
  };
}

function makeRequest(headers: Record<string, string | undefined>, db: SqliteStub): FastifyRequest {
  return { headers, server: { sqlite: db } } as unknown as FastifyRequest;
}

describe("resolveBearerOrImpersonation", () => {
  beforeEach(() => {
    process.env.MIKOSHI_TRACKER_ADMIN_API_KEY = ADMIN_KEY;
  });
  afterEach(() => {
    delete process.env.MIKOSHI_TRACKER_ADMIN_API_KEY;
  });

  it("resolves the target user and the operator when admin key + act-as header are present", async () => {
    const db = makeDb();
    const request = makeRequest({ authorization: `Bearer ${ADMIN_KEY}`, [ACT_AS_HEADER]: TARGET_USER.id }, db);

    const result = await resolveBearerOrImpersonation(request, db as never);

    expect(result.user.id).toBe(TARGET_USER.id);
    expect(result.impersonatedBy).toEqual({ type: "env", id: "env", label: "root" });
  });

  it("rejects with 401 when the act-as header is present but the admin key is invalid", async () => {
    const db = makeDb();
    const request = makeRequest({ authorization: "Bearer wrong-key", [ACT_AS_HEADER]: TARGET_USER.id }, db);

    await expect(resolveBearerOrImpersonation(request, db as never)).rejects.toBeInstanceOf(AdminKeyError);
    await expect(resolveBearerOrImpersonation(request, db as never)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects with 404 when the impersonation target user does not exist", async () => {
    const db = makeDb();
    const request = makeRequest({ authorization: `Bearer ${ADMIN_KEY}`, [ACT_AS_HEADER]: "user_missing" }, db);

    await expect(resolveBearerOrImpersonation(request, db as never)).rejects.toBeInstanceOf(V1ApiError);
    await expect(resolveBearerOrImpersonation(request, db as never)).rejects.toMatchObject({ status: 404 });
  });

  it("ignores a blank act-as header and falls back to ordinary user auth", async () => {
    // A personal token resolves through findUserByApiToken (db.apiToken.findUnique → { user }).
    const db = makeDb({ apiTokenUser: { id: "user_self", name: "Self" } });
    const request = makeRequest({ authorization: "Bearer mikoshi_tracker_personal", [ACT_AS_HEADER]: "   " }, db);

    const result = await resolveBearerOrImpersonation(request, db as never);

    expect(result.user.id).toBe("user_self");
    expect(result.impersonatedBy).toBeNull();
  });

  it("falls back to ordinary user auth when no act-as header is present", async () => {
    const db = makeDb({ apiTokenUser: { id: "user_self", name: "Self" } });
    const request = makeRequest({ authorization: "Bearer mikoshi_tracker_personal" }, db);

    const result = await resolveBearerOrImpersonation(request, db as never);

    expect(result.user.id).toBe("user_self");
    expect(result.impersonatedBy).toBeNull();
  });
});
