import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../../locale";
import { FoodTodayPanel } from "../food-today-panel";

function makeAggregations(overrides: {
  count?: number;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}): AggregationResponse {
  return {
    buckets: [],
    total: {
      count: overrides.count ?? 1,
      sum: {
        kcal: overrides.kcal ?? 0,
        protein_g: overrides.protein_g ?? 0,
        carbs_g: overrides.carbs_g ?? 0,
        fat_g: overrides.fat_g ?? 0,
      },
    },
    weeklyAverage: null,
  };
}

function renderPanel(aggregations: AggregationResponse | null) {
  return render(
    <LocaleProvider initialLocale="en">
      <FoodTodayPanel aggregations={aggregations} />
    </LocaleProvider>,
  );
}

describe("FoodTodayPanel — empty state", () => {
  it("renders the empty state when aggregations is null", () => {
    renderPanel(null);
    expect(screen.getByTestId("dashboard-food-today")).toBeInTheDocument();
    expect(screen.queryByRole("strong")).not.toBeInTheDocument();
  });

  it("renders the empty state when total.count is 0", () => {
    renderPanel(makeAggregations({ count: 0 }));
    expect(screen.getByTestId("dashboard-food-today")).toBeInTheDocument();
    expect(screen.queryByRole("strong")).not.toBeInTheDocument();
  });
});

describe("FoodTodayPanel — metric cards", () => {
  it("displays rounded kcal", () => {
    renderPanel(makeAggregations({ kcal: 1234.7, count: 2 }));
    expect(screen.getByText("1235")).toBeInTheDocument();
  });

  it("displays protein with one decimal place", () => {
    renderPanel(makeAggregations({ protein_g: 45.678, count: 1 }));
    expect(screen.getByText("45.7g")).toBeInTheDocument();
  });

  it("displays carbs with one decimal place", () => {
    renderPanel(makeAggregations({ carbs_g: 120.333, count: 1 }));
    expect(screen.getByText("120.3g")).toBeInTheDocument();
  });

  it("displays fat with one decimal place", () => {
    renderPanel(makeAggregations({ fat_g: 30.05, count: 1 }));
    expect(screen.getByText("30.1g")).toBeInTheDocument();
  });

  it("displays the meal count", () => {
    renderPanel(makeAggregations({ count: 3 }));
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not render the empty state when data is present", () => {
    renderPanel(makeAggregations({ kcal: 500, count: 1 }));
    expect(screen.queryByText(/no food logged/i)).not.toBeInTheDocument();
  });
});
