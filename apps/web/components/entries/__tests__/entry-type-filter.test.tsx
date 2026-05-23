import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { EntryTypeFilter, type EntryTypeFilterCopy } from "../entry-type-filter";

const push = vi.fn();
const searchParamsRef: { current: URLSearchParams } = { current: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParamsRef.current,
}));

function setQuery(qs: string) {
  searchParamsRef.current = new URLSearchParams(qs);
}

const COPY: EntryTypeFilterCopy = {
  label: "Show",
  all: "All",
  slugs: {
    habit_boolean: "Check-in",
    habit_quantity: "Quantity",
    food_meal: "Food",
  },
};

const TYPES = [
  { id: "et-1", slug: "habit_boolean", name: "Habit (boolean)", cadence: "recurring" as const, skillSlug: null, isBuiltIn: true },
  { id: "et-2", slug: "habit_quantity", name: "Habit (quantity)", cadence: "recurring" as const, skillSlug: null, isBuiltIn: true },
  { id: "et-3", slug: "food_meal", name: "Food meal", cadence: "ad-hoc" as const, skillSlug: "mikoshi-tracker-food", isBuiltIn: true },
];

beforeEach(() => {
  push.mockReset();
  setQuery("");
});

describe("EntryTypeFilter", () => {
  it("renders one chip per known entry type plus an 'All' chip", () => {
    render(<EntryTypeFilter entryTypes={TYPES} copy={COPY} />);

    expect(screen.getByTestId("entry-type-filter-all")).toHaveTextContent("All");
    expect(screen.getByTestId("entry-type-filter-habit_boolean")).toHaveTextContent("Check-in");
    expect(screen.getByTestId("entry-type-filter-food_meal")).toHaveTextContent("Food");
  });

  it("uses entry type name as fallback when the copy slug is missing", () => {
    const TYPES_WITH_UNKNOWN = [
      ...TYPES,
      {
        id: "et-9",
        slug: "weight_log",
        name: "Weight log",
        cadence: "recurring" as const,
        skillSlug: null,
        isBuiltIn: false,
      },
    ];
    render(<EntryTypeFilter entryTypes={TYPES_WITH_UNKNOWN} copy={COPY} />);
    expect(screen.getByTestId("entry-type-filter-weight_log")).toHaveTextContent("Weight log");
  });

  it("treats no `entryTypeSlug` query as 'All' active", () => {
    setQuery("");
    render(<EntryTypeFilter entryTypes={TYPES} copy={COPY} />);
    expect(screen.getByTestId("entry-type-filter-all")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("entry-type-filter-habit_boolean")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("marks all slugs in the URL as active", () => {
    setQuery("entryTypeSlug=food_meal,habit_boolean");
    render(<EntryTypeFilter entryTypes={TYPES} copy={COPY} />);
    expect(screen.getByTestId("entry-type-filter-food_meal")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("entry-type-filter-habit_boolean")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("entry-type-filter-habit_quantity")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByTestId("entry-type-filter-all")).toHaveAttribute("aria-selected", "false");
  });

  it("clicking a chip pushes the new entryTypeSlug into the URL", () => {
    setQuery("");
    render(<EntryTypeFilter entryTypes={TYPES} copy={COPY} />);
    fireEvent.click(screen.getByTestId("entry-type-filter-food_meal"));
    expect(push).toHaveBeenCalledWith("/entries?entryTypeSlug=food_meal");
  });

  it("clicking an active chip removes it from the URL", () => {
    setQuery("entryTypeSlug=food_meal,habit_boolean");
    render(<EntryTypeFilter entryTypes={TYPES} copy={COPY} />);
    fireEvent.click(screen.getByTestId("entry-type-filter-food_meal"));
    expect(push).toHaveBeenCalledWith("/entries?entryTypeSlug=habit_boolean");
  });

  it("clicking 'All' clears the entryTypeSlug param", () => {
    setQuery("entryTypeSlug=food_meal");
    render(<EntryTypeFilter entryTypes={TYPES} copy={COPY} />);
    fireEvent.click(screen.getByTestId("entry-type-filter-all"));
    expect(push).toHaveBeenCalledWith("/entries");
  });

  it("preserves other query parameters when toggling chips", () => {
    setQuery("status=archived");
    render(<EntryTypeFilter entryTypes={TYPES} copy={COPY} />);
    fireEvent.click(screen.getByTestId("entry-type-filter-habit_boolean"));
    expect(push).toHaveBeenCalledWith("/entries?status=archived&entryTypeSlug=habit_boolean");
  });
});
