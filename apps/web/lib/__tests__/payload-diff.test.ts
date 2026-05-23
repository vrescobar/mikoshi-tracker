import { describe, expect, it } from "vitest";

import { diffPayload } from "../payload-diff";

describe("diffPayload", () => {
  it("returns an empty array when both payloads are identical primitives", () => {
    const a = { name: "Oatmeal", kcal: 320, fiber_g: null };
    const b = { name: "Oatmeal", kcal: 320, fiber_g: null };
    expect(diffPayload(a, b)).toEqual([]);
  });

  it("emits a row for each changed primitive field", () => {
    const a = { name: "Oatmeal", kcal: 480, protein_g: 12 };
    const b = { name: "Oatmeal", kcal: 500, protein_g: 12 };
    expect(diffPayload(a, b)).toEqual([{ field: "kcal", before: 480, after: 500 }]);
  });

  it("emits rows for added fields with before=undefined", () => {
    const a = { name: "Salad" };
    const b = { name: "Salad", kcal: 320 };
    expect(diffPayload(a, b)).toEqual([{ field: "kcal", before: undefined, after: 320 }]);
  });

  it("emits rows for removed fields with after=undefined", () => {
    const a = { name: "Salad", kcal: 320 };
    const b = { name: "Salad" };
    expect(diffPayload(a, b)).toEqual([{ field: "kcal", before: 320, after: undefined }]);
  });

  it("treats a missing previous as a creation (all fields after=value)", () => {
    expect(diffPayload(undefined, { name: "Coffee", kcal: 5 })).toEqual([
      { field: "name", before: undefined, after: "Coffee" },
      { field: "kcal", before: undefined, after: 5 },
    ]);
  });

  it("treats a missing next as a deletion (all fields after=undefined)", () => {
    expect(diffPayload({ name: "Coffee", kcal: 5 }, null)).toEqual([
      { field: "name", before: "Coffee", after: undefined },
      { field: "kcal", before: 5, after: undefined },
    ]);
  });

  it("skips deep-equal nested objects", () => {
    const a = { sources: ["brave", "vision"] };
    const b = { sources: ["brave", "vision"] };
    expect(diffPayload(a, b)).toEqual([]);
  });

  it("emits a row for non-equal nested values", () => {
    const a = { sources: ["a"] };
    const b = { sources: ["a", "b"] };
    expect(diffPayload(a, b)).toEqual([
      { field: "sources", before: ["a"], after: ["a", "b"] },
    ]);
  });

  it("preserves order: changed fields from next first, then removed-only keys from previous", () => {
    const a = { kcal: 480, protein_g: 12, fat_g: 5 };
    const b = { kcal: 500, name: "Oatmeal" };
    expect(diffPayload(a, b).map((d) => d.field)).toEqual(["kcal", "name", "protein_g", "fat_g"]);
  });
});
