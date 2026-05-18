import { afterEach, describe, expect, it } from "vitest";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

describe("circle lifecycle endpoints", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("POST /api/circles returns 201, creates owner membership, and creator appears in GET /api/circles/:id members", async () => {
    context = await createTestContext();
    const { body: alice, cookie } = await signUp(context.app);

    const createResponse = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie },
      payload: { name: "Alice's Circle" },
    });

    expect(createResponse.statusCode).toBe(201);
    const { item } = createResponse.json();
    expect(item).toMatchObject({ name: "Alice's Circle", ownerId: alice.user.id });

    const detailResponse = await context.app.inject({
      method: "GET",
      url: `/api/circles/${item.id}`,
      headers: { cookie },
    });

    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json();
    expect(detail.members).toContainEqual(
      expect.objectContaining({ userId: alice.user.id, role: "owner" }),
    );
  });

  it("GET /api/circles returns only circles the user belongs to", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);
    const { cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    // Alice creates a circle
    const aliceCircleResponse = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Circle" },
    });
    const aliceCircleId = aliceCircleResponse.json().item.id;

    // Bob creates a circle
    await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: bobCookie },
      payload: { name: "Bob's Circle" },
    });

    const aliceListResponse = await context.app.inject({
      method: "GET",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
    });

    expect(aliceListResponse.statusCode).toBe(200);
    const { items } = aliceListResponse.json();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(aliceCircleId);
  });

  it("GET /api/circles/:circleId returns 404 for a non-member on an existing circle", async () => {
    context = await createTestContext();
    const { cookie: aliceCookie } = await signUp(context.app);
    const { cookie: bobCookie } = await signUp(context.app, { email: "bob@example.com", name: "Bob" });

    const createResponse = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      headers: { cookie: aliceCookie },
      payload: { name: "Alice's Private Circle" },
    });
    const circleId = createResponse.json().item.id;

    const response = await context.app.inject({
      method: "GET",
      url: `/api/circles/${circleId}`,
      headers: { cookie: bobCookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("GET /api/circles/:circleId returns 404 for a non-existent circle id", async () => {
    context = await createTestContext();
    const { cookie } = await signUp(context.app);

    const response = await context.app.inject({
      method: "GET",
      url: "/api/circles/nonexistent-circle-id",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("unauthenticated POST /api/circles returns 401 via sendCircleManagementError", async () => {
    context = await createTestContext();

    const response = await context.app.inject({
      method: "POST",
      url: "/api/circles",
      payload: { name: "Ghost Circle" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("unauthenticated GET /api/circles returns 401 via sendCircleManagementError", async () => {
    context = await createTestContext();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/circles",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("unauthenticated GET /api/circles/:circleId returns 401 via sendCircleManagementError", async () => {
    context = await createTestContext();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/circles/some-circle-id",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
