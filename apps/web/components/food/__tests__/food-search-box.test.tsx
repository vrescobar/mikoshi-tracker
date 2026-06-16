import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../locale";
import { FoodSearchBox } from "../food-search-box";

const searchFoods = vi.fn();
const relogFood = vi.fn();

vi.mock("../../../lib/diet-client", () => ({
  searchFoods: (...args: unknown[]) => searchFoods(...args),
  relogFood: (...args: unknown[]) => relogFood(...args),
}));

function renderBox(onLogged?: () => void) {
  return render(
    <LocaleProvider initialLocale="en">
      <FoodSearchBox onLogged={onLogged} />
    </LocaleProvider>,
  );
}

const HIT = {
  kind: "meal" as const,
  eventId: "evt-1",
  name: "Greek yogurt",
  kcal: 180,
  protein_g: 17,
  carbs_g: 9,
  fat_g: 4,
  fiber_g: 0,
  defaultPortionG: null,
  isRecipe: null,
  usageCount: 5,
  lastUsedAt: "2026-06-10T08:00:00.000Z",
};

describe("FoodSearchBox", () => {
  beforeEach(() => {
    searchFoods.mockReset();
    relogFood.mockReset();
  });

  it("searches after typing and re-logs a result", async () => {
    searchFoods.mockResolvedValue([HIT]);
    relogFood.mockResolvedValue({ eventId: "new-1", name: "Greek yogurt", kcal: 180, mealSlot: null });
    const onLogged = vi.fn();
    renderBox(onLogged);

    fireEvent.change(screen.getByLabelText("Quick re-log"), { target: { value: "yog" } });

    const relogButton = await screen.findByRole("button", { name: "Log again" });
    expect(searchFoods).toHaveBeenCalledWith("yog");

    fireEvent.click(relogButton);
    await waitFor(() => expect(relogFood).toHaveBeenCalledWith({ sourceEventId: "evt-1" }));
    await waitFor(() => expect(onLogged).toHaveBeenCalled());
  });

  it("does not search for a single character", async () => {
    renderBox();
    fireEvent.change(screen.getByLabelText("Quick re-log"), { target: { value: "y" } });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(searchFoods).not.toHaveBeenCalled();
  });
});
