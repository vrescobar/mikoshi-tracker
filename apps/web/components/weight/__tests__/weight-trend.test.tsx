import type { AggregationBucket } from "@mikoshi-tracker/contracts/aggregations";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WeightTrend } from "../weight-trend";

function dateBucket(value: string, weight_kg: number, missing = false): AggregationBucket {
  return {
    key: { kind: "date", value },
    sum: { weight_kg },
    count: weight_kg > 0 ? 1 : 0,
    missing,
  };
}

describe("WeightTrend", () => {
  it("renders empty state when all buckets are missing", () => {
    render(
      <WeightTrend
        buckets={[dateBucket("2026-02-01", 0, true), dateBucket("2026-02-02", 0, true)]}
        label="Weight trend"
        emptyLabel="No data yet."
      />,
    );
    expect(screen.getByTestId("weight-trend-empty")).toHaveTextContent("No data yet.");
    expect(screen.queryByTestId("weight-trend")).not.toBeInTheDocument();
  });

  it("renders empty state when bucket list is empty", () => {
    render(<WeightTrend buckets={[]} label="Weight trend" emptyLabel="No data yet." />);
    expect(screen.getByTestId("weight-trend-empty")).toBeInTheDocument();
  });

  it("renders a line and one circle per non-missing date bucket", () => {
    const buckets = [
      dateBucket("2026-02-01", 80.5),
      dateBucket("2026-02-02", 80.0),
      dateBucket("2026-02-03", 79.5),
    ];
    render(<WeightTrend buckets={buckets} label="Weight trend" emptyLabel="empty" />);

    expect(screen.getByTestId("weight-trend")).toBeInTheDocument();
    expect(screen.getByTestId("weight-trend-line")).toBeInTheDocument();
    expect(screen.getAllByTestId("weight-trend-point")).toHaveLength(3);
  });

  it("skips missing buckets when building points", () => {
    const buckets = [
      dateBucket("2026-02-01", 80.0),
      dateBucket("2026-02-02", 0, true),
      dateBucket("2026-02-03", 79.5),
    ];
    render(<WeightTrend buckets={buckets} label="Weight trend" emptyLabel="empty" />);
    expect(screen.getAllByTestId("weight-trend-point")).toHaveLength(2);
  });
});
