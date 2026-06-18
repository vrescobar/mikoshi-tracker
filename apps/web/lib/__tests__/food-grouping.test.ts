import { describe, expect, it } from "vitest";

import { groupSimilarMeals, significantTokens } from "../food-grouping";

describe("significantTokens", () => {
  it("drops quantities, units, and stop/prep words", () => {
    expect([...significantTokens("2 raciones de yfood Classic Choco preparado con agua")].sort()).toEqual(
      ["choco", "classic", "yfood"],
    );
  });

  it("drops a trailing weight token like 200g", () => {
    expect([...significantTokens("Ehrmann Schoko-Protein-Pudding 200g")].sort()).toEqual([
      "ehrmann",
      "protein",
      "pudding",
      "schoko",
    ]);
  });
});

describe("groupSimilarMeals", () => {
  it("folds the several yfood spellings into one group", () => {
    const names = [
      "yfood Classic Choco — 1 ración",
      "2 raciones de yfood Classic Choco preparado con agua",
      "yfood This Is Food Complete Meal classic choco — 1 ración",
    ];
    const groups = groupSimilarMeals(names, (n) => n);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("keeps genuinely different meals apart", () => {
    const names = [
      "Ensalada de espinaca, alubias, zanahoria, tomate, atún, AOVE y plátano",
      "Ensalada completa con pollo, aceite, soja, cacahuete y whey",
    ];
    const groups = groupSimilarMeals(names, (n) => n);
    expect(groups).toHaveLength(2);
  });

  it("does not merge singular/plural distinct dishes", () => {
    const names = [
      "1 huevo + 1 loncha cheddar Kerrygold",
      "5 huevos revueltos con tomate, ajo, AOVE, whey y bebida de soja",
    ];
    const groups = groupSimilarMeals(names, (n) => n);
    expect(groups).toHaveLength(2);
  });

  it("returns each unique item as its own group when nothing is similar", () => {
    const groups = groupSimilarMeals(["Banana", "Chicken", "Rice"], (n) => n);
    expect(groups).toHaveLength(3);
  });

  it("preserves first-seen order of groups", () => {
    const groups = groupSimilarMeals(["Rice", "yfood choco", "yfood choco con agua"], (n) => n);
    expect(groups[0][0]).toBe("Rice");
    expect(groups[1]).toContain("yfood choco");
  });
});
