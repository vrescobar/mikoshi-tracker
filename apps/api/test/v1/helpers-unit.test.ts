import { describe, expect, it } from "vitest";

import { paginate, sortItems, sourceFromLegacy, sourceToLegacy } from "../../src/v1/shared";

describe("v1 shared helpers", () => {
  describe("paginate", () => {
    it("slices by limit/offset and reports the full total", () => {
      const all = [1, 2, 3, 4, 5];
      expect(paginate(all, { limit: 2, offset: 1 })).toEqual({ items: [2, 3], total: 5 });
    });

    it("returns everything when no limit is given", () => {
      expect(paginate([1, 2], undefined)).toEqual({ items: [1, 2], total: 2 });
    });
  });

  describe("sortItems", () => {
    const rows = [{ name: "Banana", n: 2 }, { name: "Apple", n: 3 }, { name: "Cherry", n: 1 }];

    it("is a no-op without a sort key", () => {
      expect(sortItems(rows)).toBe(rows);
    });

    it("sorts strings ascending and descending", () => {
      expect(sortItems(rows, { sort: "name", order: "asc" }).map((r) => r.name)).toEqual([
        "Apple",
        "Banana",
        "Cherry",
      ]);
      expect(sortItems(rows, { sort: "name", order: "desc" }).map((r) => r.name)).toEqual([
        "Cherry",
        "Banana",
        "Apple",
      ]);
    });

    it("sorts numbers numerically (not lexically)", () => {
      const items = [{ v: 2 }, { v: 10 }, { v: 1 }];
      expect(sortItems(items, { sort: "v", order: "asc" }).map((r) => r.v)).toEqual([1, 2, 10]);
    });

    it("does not mutate the input array", () => {
      const original = [...rows];
      sortItems(rows, { sort: "name" });
      expect(rows).toEqual(original);
    });
  });

  describe("source casing translation", () => {
    it("maps lowercase v1 source to the stored UPPERCASE", () => {
      expect(sourceToLegacy("ai")).toBe("AI");
      expect(sourceToLegacy("circle")).toBe("CIRCLE");
    });

    it("maps stored UPPERCASE back to lowercase v1 source", () => {
      expect(sourceFromLegacy("WEB")).toBe("web");
      expect(sourceFromLegacy("SYSTEM")).toBe("system");
    });
  });
});
