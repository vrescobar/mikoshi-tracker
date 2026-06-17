import { afterEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

describe("circle member management endpoints", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  // ── POST /api/circles/:circleId/members ────────────────────────────────────

  it("POST /members returns 201 and adds the user as a circle member", async () => {
    context = await createTestContext();
    const { body: alice, cookie: aliceCookie } = await signUp(context.app);
    const { body: bob } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "bob@example.com" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      membership: expect.objectContaining({ userId: bob.user.id, role: "member" }),
    });
    void alice;
  });

  it("POST /members returns 404 when the email is not registered", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "nobody@example.com" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("POST /members returns 409 when the user is already a member", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);
    await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "bob@example.com" },
    });

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "bob@example.com" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "CONFLICT" });
  });

  it("POST /members returns 403 when caller is not the owner", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);
    const { cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });
    await signUp(context.app, { email: "carol@example.com", name: "Carol" });

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: bobCookie },
      payload: { email: "carol@example.com" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("POST /members returns 401 when unauthenticated", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    const response = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      payload: { email: "bob@example.com" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  // ── PATCH /api/circles/:circleId/members/:membershipId ─────────────────────

  it("PATCH /members/:membershipId returns 200 and updates the membership fields", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);
    await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    const addRes = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "bob@example.com" },
    });
    const membershipId = addRes.json().membership.membershipId;

    const response = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circleId}/members/${membershipId}`,
      headers: { cookie: aliceCookie },
      payload: { externalId: "ext-bob-42" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      membership: expect.objectContaining({ membershipId, externalId: "ext-bob-42" }),
    });
  });

  it("PATCH /members/:membershipId returns 404 for an unknown membershipId", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    const response = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circleId}/members/nonexistent-membership-id`,
      headers: { cookie: aliceCookie },
      payload: { externalId: "x" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("PATCH /members/:membershipId returns 404 when membershipId belongs to a different circle", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);
    await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circleARes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Circle A" },
    });
    const circleAId = circleARes.json().item.id;

    const circleBRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Circle B" },
    });
    const circleBId = circleBRes.json().item.id;

    // Add Bob to circle B
    const addRes = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleBId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "bob@example.com" },
    });
    const bobMembershipInB = addRes.json().membership.membershipId;

    // Try to patch Bob's membership via circle A's route
    const response = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circleAId}/members/${bobMembershipInB}`,
      headers: { cookie: aliceCookie },
      payload: { externalId: "x" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("PATCH /members/:membershipId promotes a member to owner", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);
    await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    const addRes = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "bob@example.com" },
    });
    const membershipId = addRes.json().membership.membershipId;

    const response = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circleId}/members/${membershipId}`,
      headers: { cookie: aliceCookie },
      payload: { role: "owner" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      membership: expect.objectContaining({ membershipId, role: "owner" }),
    });
  });

  it("PATCH /members/:membershipId returns 403 when attempting to demote the owner", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    // Get Alice's owner membership ID from the circle detail
    const detailRes = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circleId}`,
      headers: { cookie: aliceCookie },
    });
    const members = detailRes.json().members as Array<{ membershipId: string; role: string }>;
    const ownerMembership = members.find((m) => m.role === "owner");

    const response = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circleId}/members/${ownerMembership!.membershipId}`,
      headers: { cookie: aliceCookie },
      payload: { role: "member" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("PATCH /members/:membershipId returns 403 when caller is not the owner", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);
    const { cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    const addRes = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "bob@example.com" },
    });
    const membershipId = addRes.json().membership.membershipId;

    const response = await context.app.inject({
      method: "PATCH",
      url: `/api/circles/${circleId}/members/${membershipId}`,
      headers: { cookie: bobCookie },
      payload: { externalId: "x" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  // ── DELETE /api/circles/:circleId/members/:membershipId ────────────────────

  it("DELETE /members/:membershipId returns 204 and removes the member", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);
    const { body: bob } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    const addRes = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "bob@example.com" },
    });
    const membershipId = addRes.json().membership.membershipId;

    const response = await context.app.inject({
      method: "DELETE",
      url: `/api/circles/${circleId}/members/${membershipId}`,
      headers: { cookie: aliceCookie },
    });

    expect(response.statusCode).toBe(204);

    // Verify Bob no longer appears in the circle
    const detailRes = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circleId}`,
      headers: { cookie: aliceCookie },
    });
    const members = detailRes.json().members as Array<{ userId: string }>;
    expect(members.every((m) => m.userId !== bob.user.id)).toBe(true);
  });

  it("DELETE /members/:membershipId returns 403 when attempting to remove the owner", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    // Get Alice's owner membership ID from the circle detail
    const detailRes = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circleId}`,
      headers: { cookie: aliceCookie },
    });
    const members = detailRes.json().members as Array<{ membershipId: string; role: string }>;
    const ownerMembership = members.find((m) => m.role === "owner");

    const response = await context.app.inject({
      method: "DELETE",
      url: `/api/circles/${circleId}/members/${ownerMembership!.membershipId}`,
      headers: { cookie: aliceCookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("DELETE /members/:membershipId returns 404 for an unknown membershipId", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    const response = await context.app.inject({
      method: "DELETE",
      url: `/api/circles/${circleId}/members/nonexistent-membership-id`,
      headers: { cookie: aliceCookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("DELETE /members/:membershipId returns 403 when caller is not the owner", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);
    const { cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });
    await signUp(context.app, { email: "carol@example.com", name: "Carol" });

    const circleRes = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const circleId = circleRes.json().item.id;

    // Add Bob and Carol to the circle
    await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "bob@example.com" },
    });
    const addCarolRes = await context.app.inject({
      method: "POST",
      url: `/api/circles/${circleId}/members`,
      headers: { cookie: aliceCookie },
      payload: { email: "carol@example.com" },
    });
    const carolMembershipId = addCarolRes.json().membership.membershipId;

    // Bob (non-owner) tries to remove Carol
    const response = await context.app.inject({
      method: "DELETE",
      url: `/api/circles/${circleId}/members/${carolMembershipId}`,
      headers: { cookie: bobCookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
  });
});
