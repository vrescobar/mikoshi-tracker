import type { TodayNutrition } from "@mikoshi-tracker/contracts/today";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";

import { LocaleProvider } from "../../locale";
import { DietProgressCard } from "../diet-progress-card";

function renderCard(nutrition: TodayNutrition | null) {
  return render(
    <LocaleProvider initialLocale="en">
      <MemoryRouter>
        <DietProgressCard nutrition={nutrition} mealCount={nutrition?.mealCount ?? 0} />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

const base: TodayNutrition = {
  kcal: 1000,
  protein_g: 60,
  carbs_g: 100,
  fat_g: 30,
  mealCount: 2,
  kcalTarget: 2000,
  proteinTargetG: 120,
  carbsTargetG: 200,
  fatTargetG: 60,
  objective: "maintain",
  bySlot: [{ slot: "lunch", kcal: 1000, kcalTarget: 700 }],
};

describe("DietProgressCard", () => {
  it("shows the kcal ring and macro progress against the goal", () => {
    renderCard(base);
    expect(screen.getByTestId("diet-progress-card")).toBeInTheDocument();
    // 1000 / 2000 → 50%
    expect(screen.getByText("50%")).toBeInTheDocument();
    // Macro consumed/target pair is shown.
    expect(screen.getByText(/120g/)).toBeInTheDocument();
  });

  it("nudges to set a goal when no target exists", () => {
    renderCard({ ...base, kcalTarget: null, proteinTargetG: null, carbsTargetG: null, fatTargetG: null, bySlot: [] });
    expect(screen.getByText("Set a goal")).toBeInTheDocument();
  });

  it("renders nothing for non-food users", () => {
    const { container } = renderCard(null);
    expect(container).toBeEmptyDOMElement();
  });
});
