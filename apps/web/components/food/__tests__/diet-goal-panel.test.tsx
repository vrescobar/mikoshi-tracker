import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../locale";
import { DietGoalPanel } from "../diet-goal-panel";

const getDietGoal = vi.fn();
const setDietGoal = vi.fn();

vi.mock("../../../lib/diet-client", () => ({
  getDietGoal: () => getDietGoal(),
  setDietGoal: (input: unknown) => setDietGoal(input),
}));

describe("DietGoalPanel", () => {
  beforeEach(() => {
    getDietGoal.mockReset();
    setDietGoal.mockReset();
  });

  it("loads the current goal and saves percent split with Atwater grams", async () => {
    getDietGoal.mockResolvedValue({
      kcalTarget: 2000,
      proteinPct: 30,
      carbsPct: 40,
      fatPct: 30,
      eventId: "g1",
      updatedAt: null,
    });
    setDietGoal.mockResolvedValue({ kcalTarget: 2000, eventId: "g2", updatedAt: null });

    render(
      <LocaleProvider initialLocale="en">
        <DietGoalPanel />
      </LocaleProvider>,
    );

    const save = await screen.findByRole("button", { name: "Save goal" });
    fireEvent.click(save);

    await waitFor(() => expect(setDietGoal).toHaveBeenCalledTimes(1));
    // 2000 kcal @ 30% protein = 600 kcal / 4 = 150 g; 40% carbs = 200 g; 30% fat = 600/9 = 67 g.
    expect(setDietGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        kcalTarget: 2000,
        macroMode: "percent",
        proteinPct: 30,
        proteinTargetG: 150,
        carbsTargetG: 200,
        fatTargetG: 67,
      }),
    );
  });
});
