import type { AggregationBucket } from "@mikoshi-tracker/contracts/aggregations";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KcalTrend } from "../KcalTrend";

function dateBucket(value: string, kcal: number): AggregationBucket {
  return {
    key: { kind: "date", value },
    sum: { kcal },
    count: kcal > 0 ? 1 : 0,
    missing: kcal === 0,
  };
}

describe("KcalTrend", () => {
  it("renders the empty state when no buckets carry data", () => {
    render(
      <KcalTrend
        buckets={[dateBucket("2026-05-01", 0), dateBucket("2026-05-02", 0)]}
        label="Trend"
        emptyLabel="No data yet."
      />,
    );
    expect(screen.getByTestId("kcal-trend-empty")).toHaveTextContent("No data yet.");
    expect(screen.queryByTestId("kcal-trend")).not.toBeInTheDocument();
  });

  it("renders the empty state when buckets are absent", () => {
    render(<KcalTrend buckets={[]} label="Trend" emptyLabel="No data yet." />);
    expect(screen.getByTestId("kcal-trend-empty")).toBeInTheDocument();
  });

  it("renders a line + one circle per date bucket when data is present", () => {
    const buckets = [
      dateBucket("2026-05-01", 1500),
      dateBucket("2026-05-02", 2000),
      dateBucket("2026-05-03", 1800),
    ];
    render(<KcalTrend buckets={buckets} label="Trend" emptyLabel="empty" />);

    expect(screen.getByTestId("kcal-trend")).toBeInTheDocument();
    expect(screen.getByTestId("kcal-trend-line")).toBeInTheDocument();
    expect(screen.getAllByTestId("kcal-trend-point")).toHaveLength(3);
  });

  it("ignores non-date buckets (skips payload-grouped entries)", () => {
    const buckets: AggregationBucket[] = [
      dateBucket("2026-05-01", 1500),
      {
        key: { kind: "payload", field: "name", value: "oatmeal" },
        sum: { kcal: 320 },
        count: 1,
        missing: false,
      },
      dateBucket("2026-05-02", 2000),
    ];
    render(<KcalTrend buckets={buckets} label="Trend" emptyLabel="empty" />);
    // Only the two date buckets become points.
    expect(screen.getAllByTestId("kcal-trend-point")).toHaveLength(2);
  });
});
