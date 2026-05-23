import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MacroPie } from "../MacroPie";

const LEGEND = { protein: "Protein", carbs: "Carbs", fat: "Fat" };

describe("MacroPie", () => {
  it("renders an empty state when all macros are zero", () => {
    render(
      <MacroPie
        proteinG={0}
        carbsG={0}
        fatG={0}
        label="Macros"
        emptyLabel="Log a meal first."
        legend={LEGEND}
      />,
    );
    expect(screen.getByTestId("macro-pie-empty")).toHaveTextContent("Log a meal first.");
    expect(screen.queryByTestId("macro-pie")).not.toBeInTheDocument();
  });

  it("renders three arcs when macros are present and computes kcal-share percentages", () => {
    // 25g protein × 4 = 100, 50g carbs × 4 = 200, 11.11g fat × 9 = 100 → total 400.
    // Shares: protein 25%, carbs 50%, fat 25%.
    render(
      <MacroPie
        proteinG={25}
        carbsG={50}
        fatG={11.111}
        label="Macros"
        emptyLabel="empty"
        legend={LEGEND}
      />,
    );
    const root = screen.getByTestId("macro-pie");
    expect(root).toBeInTheDocument();
    expect(screen.getByTestId("macro-pie-protein")).toBeInTheDocument();
    expect(screen.getByTestId("macro-pie-carbs")).toBeInTheDocument();
    expect(screen.getByTestId("macro-pie-fat")).toBeInTheDocument();
    // Aria-label reports percentages.
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Protein: 25%"),
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Carbs: 50%"),
    );
  });

  it("ignores negative values (clamps to zero)", () => {
    // Only carbs contribute, so 100% carbs.
    render(
      <MacroPie
        proteinG={-100}
        carbsG={50}
        fatG={-50}
        label="Macros"
        emptyLabel="empty"
        legend={LEGEND}
      />,
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Carbs: 100%"),
    );
  });
});
