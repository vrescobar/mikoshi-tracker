import { afterEach, describe, expect, it } from "vitest";

import { addCircleMemberRecord, createCircleRecord } from "../../src/modules/circles/circle.repository";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

describe("circle token endpoints", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  // ─── POST /api/circles/:circleId/tokens ──────────────────────────────────────

  describe("POST /tokens", () => {
    it("returns 201 with token and tokenId once, and GET /tokens never returns the raw token", async () => {
      context = await createTestContext();
      const { cookie: aliceCookie } = await signUp(context.app);

      const circleRes = await context.app.inject({
        method: "POST",
        url: "/api/circles",
        headers: { cookie: aliceCookie },
        payload: { name: "Alice's Circle" },
      });
      const circleId = circleRes.json().item.id as string;

      const mintRes = await context.app.inject({
        method: "POST",
        url: `/api/circles/${circleId}/tokens`,
        headers: { cookie: aliceCookie },
        payload: { label: "My Token" },
      });

      expect(mintRes.statusCode).toBe(201);
      const minted = mintRes.json() as { token: string; tokenId: string; label: string | null; createdAt: string };
      expect(typeof minted.token).toBe("string");
      expect(minted.token.startsWith("haaabit_circle_")).toBe(true);
      expect(typeof minted.tokenId).toBe("string");
      expect(minted.label).toBe("My Token");

      // GET /tokens must not return the raw token — only metadata
      const listRes = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circleId}/tokens`,
        headers: { cookie: aliceCookie },
      });

      expect(listRes.statusCode).toBe(200);
      const { tokens } = listRes.json() as { tokens: Array<{ tokenId: string; label: string | null; createdAt: string; updatedAt: string }> };
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({ tokenId: minted.tokenId, label: "My Token" });
      expect(Object.keys(tokens[0])).not.toContain("token");
    });

    it("non-owner member gets 403 on POST /tokens", async () => {
      context = await createTestContext();
      const { body: alice } = await signUp(context.app);
      const { body: bob, cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

      const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });
      await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bob.user.id });

      const response = await context.app.inject({
        method: "POST",
        url: `/api/circles/${circle.id}/tokens`,
        headers: { cookie: bobCookie },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("non-member gets 403 on POST /tokens", async () => {
      context = await createTestContext();
      const { body: alice } = await signUp(context.app);
      const { cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

      const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });

      const response = await context.app.inject({
        method: "POST",
        url: `/api/circles/${circle.id}/tokens`,
        headers: { cookie: bobCookie },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ─── GET /api/circles/:circleId/tokens ───────────────────────────────────────

  describe("GET /tokens", () => {
    it("non-owner member gets 403 on GET /tokens", async () => {
      context = await createTestContext();
      const { body: alice } = await signUp(context.app);
      const { body: bob, cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

      const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });
      await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bob.user.id });

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/tokens`,
        headers: { cookie: bobCookie },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("non-member gets 403 on GET /tokens", async () => {
      context = await createTestContext();
      const { body: alice } = await signUp(context.app);
      const { cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

      const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });

      const response = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circle.id}/tokens`,
        headers: { cookie: bobCookie },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ─── DELETE /api/circles/:circleId/tokens/:tokenId ───────────────────────────

  describe("DELETE /tokens/:tokenId", () => {
    it("returns 204 and removes the token from GET /tokens", async () => {
      context = await createTestContext();
      const { cookie: aliceCookie } = await signUp(context.app);

      const circleRes = await context.app.inject({
        method: "POST",
        url: "/api/circles",
        headers: { cookie: aliceCookie },
        payload: { name: "Alice's Circle" },
      });
      const circleId = circleRes.json().item.id as string;

      const mintRes = await context.app.inject({
        method: "POST",
        url: `/api/circles/${circleId}/tokens`,
        headers: { cookie: aliceCookie },
        payload: {},
      });
      const { tokenId } = mintRes.json() as { tokenId: string };

      const deleteRes = await context.app.inject({
        method: "DELETE",
        url: `/api/circles/${circleId}/tokens/${tokenId}`,
        headers: { cookie: aliceCookie },
      });

      expect(deleteRes.statusCode).toBe(204);

      const listRes = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circleId}/tokens`,
        headers: { cookie: aliceCookie },
      });

      const { tokens } = listRes.json() as { tokens: unknown[] };
      expect(tokens).toHaveLength(0);
    });

    it("returns 404 for a non-existent tokenId", async () => {
      context = await createTestContext();
      const { cookie: aliceCookie } = await signUp(context.app);

      const circleRes = await context.app.inject({
        method: "POST",
        url: "/api/circles",
        headers: { cookie: aliceCookie },
        payload: { name: "Alice's Circle" },
      });
      const circleId = circleRes.json().item.id as string;

      const response = await context.app.inject({
        method: "DELETE",
        url: `/api/circles/${circleId}/tokens/nonexistent-token-id`,
        headers: { cookie: aliceCookie },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns 404 when tokenId belongs to a different circle and does not delete it", async () => {
      context = await createTestContext();
      const { cookie: aliceCookie } = await signUp(context.app);

      // Create two circles
      const circle1Res = await context.app.inject({
        method: "POST",
        url: "/api/circles",
        headers: { cookie: aliceCookie },
        payload: { name: "Circle One" },
      });
      const circleId1 = circle1Res.json().item.id as string;

      const circle2Res = await context.app.inject({
        method: "POST",
        url: "/api/circles",
        headers: { cookie: aliceCookie },
        payload: { name: "Circle Two" },
      });
      const circleId2 = circle2Res.json().item.id as string;

      // Mint a token in circle 2
      const mintRes = await context.app.inject({
        method: "POST",
        url: `/api/circles/${circleId2}/tokens`,
        headers: { cookie: aliceCookie },
        payload: {},
      });
      const { tokenId } = mintRes.json() as { tokenId: string };

      // Attempt to revoke it via circle 1 — scoped guard should block this
      const deleteRes = await context.app.inject({
        method: "DELETE",
        url: `/api/circles/${circleId1}/tokens/${tokenId}`,
        headers: { cookie: aliceCookie },
      });

      expect(deleteRes.statusCode).toBe(404);
      expect(deleteRes.json()).toMatchObject({ code: "NOT_FOUND" });

      // Token must still exist in circle 2
      const listRes = await context.app.inject({
        method: "GET",
        url: `/api/circles/${circleId2}/tokens`,
        headers: { cookie: aliceCookie },
      });
      const { tokens } = listRes.json() as { tokens: Array<{ tokenId: string }> };
      expect(tokens.some((t) => t.tokenId === tokenId)).toBe(true);
    });

    it("non-owner member gets 403 on DELETE /tokens/:tokenId", async () => {
      context = await createTestContext();
      const { body: alice } = await signUp(context.app);
      const { body: bob, cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

      const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });
      await addCircleMemberRecord(context.app.db, { circleId: circle.id, userId: bob.user.id });

      const response = await context.app.inject({
        method: "DELETE",
        url: `/api/circles/${circle.id}/tokens/some-token-id`,
        headers: { cookie: bobCookie },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    });

    it("non-member gets 403 on DELETE /tokens/:tokenId", async () => {
      context = await createTestContext();
      const { body: alice } = await signUp(context.app);
      const { cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

      const circle = await createCircleRecord(context.app.db, { ownerId: alice.user.id, name: "Circle" });

      const response = await context.app.inject({
        method: "DELETE",
        url: `/api/circles/${circle.id}/tokens/some-token-id`,
        headers: { cookie: bobCookie },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
