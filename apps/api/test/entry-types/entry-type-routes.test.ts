import { afterEach, describe, expect, it } from "bun:test";

import { createTestContext, signUp, type TestContext } from "../helpers/app";

describe("entry-type routes", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  describe("GET /api/entry-types", () => {
    it("returns 401 when unauthenticated", async () => {
      context = await createTestContext();
      const response = await context.app.inject({
        method: "GET",
        url: "/api/entry-types",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns seeded built-in entry types for authenticated user", async () => {
      context = await createTestContext();
      const { cookie } = await signUp(context.app);

      const response = await context.app.inject({
        method: "GET",
        url: "/api/entry-types",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: unknown[] };
      expect(Array.isArray(body.items)).toBe(true);

      const slugs = (body.items as Array<{ slug: string }>).map((t) => t.slug);
      expect(slugs).toContain("habit_boolean");
      expect(slugs).toContain("habit_quantity");
      expect(slugs).toContain("food_meal");
    });

    it("omits inactive entry types", async () => {
      context = await createTestContext();
      const { cookie } = await signUp(context.app);

      // Make one entry type inactive directly in the DB
      await context.app.db.entryType.updateMany({
        where: { slug: "food_meal" },
        data: { isActive: false },
      });

      const response = await context.app.inject({
        method: "GET",
        url: "/api/entry-types",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<{ slug: string }> };
      const slugs = body.items.map((t) => t.slug);
      expect(slugs).not.toContain("food_meal");
    });

    it("returns items with parsed payloadSchema objects (not strings)", async () => {
      context = await createTestContext();
      const { cookie } = await signUp(context.app);

      const response = await context.app.inject({
        method: "GET",
        url: "/api/entry-types",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<{ payloadSchema: unknown }> };
      for (const item of body.items) {
        expect(typeof item.payloadSchema).toBe("object");
        expect(item.payloadSchema).not.toBeNull();
      }
    });
  });

  describe("GET /api/entry-types/:slug", () => {
    it("returns 401 when unauthenticated", async () => {
      context = await createTestContext();
      const response = await context.app.inject({
        method: "GET",
        url: "/api/entry-types/habit_boolean",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns {item} for a known slug", async () => {
      context = await createTestContext();
      const { cookie } = await signUp(context.app);

      const response = await context.app.inject({
        method: "GET",
        url: "/api/entry-types/habit_boolean",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { item: { slug: string; cadence: string; isBuiltIn: boolean } };
      expect(body.item.slug).toBe("habit_boolean");
      expect(body.item.cadence).toBe("recurring");
      expect(body.item.isBuiltIn).toBe(true);
    });

    it("returns 404 for an unknown slug", async () => {
      context = await createTestContext();
      const { cookie } = await signUp(context.app);

      const response = await context.app.inject({
        method: "GET",
        url: "/api/entry-types/does_not_exist",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 404 for an inactive slug", async () => {
      context = await createTestContext();
      const { cookie } = await signUp(context.app);

      await context.app.db.entryType.updateMany({
        where: { slug: "habit_quantity" },
        data: { isActive: false },
      });

      const response = await context.app.inject({
        method: "GET",
        url: "/api/entry-types/habit_quantity",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
