import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";
import type { TodaySummary } from "@mikoshi-tracker/contracts/today";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../../locale";
import { TodayUnifiedStrip } from "../today-unified-strip";

function makeSummary(pending: number, completed: number): TodaySummary {
  return {
    date: "2026-05-22",
    totalCount: pending + completed,
    pendingCount: pending,
    completedCount: completed,
    completionRate: pending + completed === 0 ? 0 : completed / (pending + completed),
    pendingItems: [],
    completedItems: [],
  };
}

function makeAgg(kcal: number): AggregationResponse {
  return {
    buckets: [],
    total: { sum: { kcal }, count: kcal > 0 ? 1 : 0 },
    weeklyAverage: null,
  };
}

function renderStrip(
  summary: TodaySummary | null,
  agg: AggregationResponse | null,
  target: number | null,
) {
  return render(
    <LocaleProvider initialLocale="en">
      <TodayUnifiedStrip summary={summary} foodAggregations={agg} dailyKcalTarget={target} />
    </LocaleProvider>,
  );
}

describe("TodayUnifiedStrip", () => {
  it("does not render when no habits, no food today, and no target", () => {
    const { container } = renderStrip(makeSummary(0, 0), makeAgg(0), null);
    expect(container.firstChild).toBeNull();
  });

  it("renders pending count when habits are open", () => {
    renderStrip(makeSummary(2, 1), makeAgg(0), null);
    expect(screen.getByTestId("today-unified-strip")).toBeInTheDocument();
    expect(screen.getByText("2 pending")).toBeInTheDocument();
  });

  it("renders 'all done' when there are no pending habits but at least one completed", () => {
    renderStrip(makeSummary(0, 3), makeAgg(0), null);
    expect(screen.getByText("All done")).toBeInTheDocument();
  });

  it("renders kcal progress with target", () => {
    renderStrip(makeSummary(0, 0), makeAgg(1820), 2200);
    expect(screen.getByText("1820 / 2200")).toBeInTheDocument();
    expect(screen.getByTestId("today-unified-strip-progress")).toHaveAttribute(
      "aria-valuenow",
      "1820",
    );
  });

  it("renders kcal without progress when no target is set", () => {
    renderStrip(makeSummary(0, 0), makeAgg(1200), null);
    expect(screen.getByText("1200")).toBeInTheDocument();
    expect(screen.queryByTestId("today-unified-strip-progress")).not.toBeInTheDocument();
  });
});
