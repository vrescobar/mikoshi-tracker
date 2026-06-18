import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { AggregationResponse } from "@mikoshi-tracker/contracts/aggregations";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/food-client", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/food-client")>(
    "../../../lib/food-client",
  );
  return {
    ...actual,
    ensureFoodEntry: vi.fn(),
    createFoodEvent: vi.fn(),
  };
});
vi.mock("../../ui", () => ({
  Button: ({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
  Notice: ({ children, title }: { children?: ReactNode; title?: string }) => (
    <div role="alert">
      <strong>{title}</strong>
      {children}
    </div>
  ),
}));

import { createFoodEvent, ensureFoodEntry } from "../../../lib/food-client";
import { RepeatsPanel } from "../RepeatsPanel";

const COPY = {
  title: "Repeats",
  description: "desc",
  empty: "Empty",
  logAgain: "Log again",
  logging: "Logging…",
  errorTitle: "Could not log meal",
  countLabel: (count: number) => `${count}×`,
  variantsLabel: (count: number) => `includes ${count} variations`,
};

function buildAgg(rows: Array<{ name: string; count: number; kcal: number }>): AggregationResponse {
  return {
    buckets: rows.map((r) => ({
      key: {
        kind: "payload" as const,
        field: "name",
        value: r.name.toLowerCase(),
        sample: {
          name: r.name,
          kcal: r.kcal,
          protein_g: 10,
          carbs_g: 20,
          fat_g: 5,
          fiber_g: null,
          sugar_g: null,
          portion_g: null,
          mealSlot: null,
          source: "manual",
          confidence: 1.0,
          similarToEventId: null,
          sources: null,
          notes: null,
        },
      },
      sum: { kcal: r.count * r.kcal },
      count: r.count,
      missing: false,
    })),
    total: { sum: { kcal: 0 }, count: 0 },
    weeklyAverage: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RepeatsPanel", () => {
  it("renders empty state when there are no payload buckets", () => {
    render(<RepeatsPanel aggregations={null} copy={COPY} />);
    expect(screen.getByTestId("repeats-panel-empty")).toHaveTextContent("Empty");
  });

  it("renders one row per payload bucket with the count label", () => {
    const agg = buildAgg([
      { name: "Oatmeal", count: 4, kcal: 320 },
      { name: "Salad", count: 3, kcal: 250 },
    ]);
    render(<RepeatsPanel aggregations={agg} copy={COPY} />);
    const rows = screen.getAllByTestId("repeats-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Oatmeal")).toBeInTheDocument();
    expect(screen.getByText("4×")).toBeInTheDocument();
  });

  it("posts a new event with source=similar_to_event when Log again is clicked", async () => {
    (ensureFoodEntry as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "entry-1" });
    (createFoodEvent as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ev-1" });

    const onLogged = vi.fn();
    const agg = buildAgg([{ name: "Oatmeal", count: 4, kcal: 320 }]);
    render(<RepeatsPanel aggregations={agg} copy={COPY} onLogged={onLogged} />);

    fireEvent.click(screen.getByText("Log again"));

    await waitFor(() => expect(onLogged).toHaveBeenCalledTimes(1));
    expect(createFoodEvent).toHaveBeenCalledTimes(1);
    const call = (createFoodEvent as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const payload = call[1] as {
      source: string;
      confidence: number;
      name: string;
      kcal: number;
    };
    expect(payload.source).toBe("similar_to_event");
    expect(payload.confidence).toBe(1.0);
    expect(payload.name).toBe("Oatmeal");
    expect(payload.kcal).toBe(320);
  });
});
