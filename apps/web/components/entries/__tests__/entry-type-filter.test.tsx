import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, useLocation, type Location } from "react-router";

import { EntryTypeFilter, type EntryTypeFilterCopy } from "../entry-type-filter";

/** Captures the live router location so assertions can read the URL after clicks. */
const locationRef: { current: Location | null } = { current: null };

function LocationProbe() {
  locationRef.current = useLocation();
  return null;
}

function renderWithQuery(qs: string) {
  locationRef.current = null;
  return render(
    <MemoryRouter initialEntries={[qs ? `/entries?${qs}` : "/entries"]}>
      <EntryTypeFilter entryTypes={TYPES} copy={COPY} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function currentUrl(): string {
  const location = locationRef.current;
  if (!location) throw new Error("location probe not mounted");
  return `${location.pathname}${decodeURIComponent(location.search)}`;
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
  { id: "et-1", slug: "habit_boolean", displayName: "Habit (boolean)", cadence: "recurring", skillSlug: null, isBuiltIn: true },
  { id: "et-2", slug: "habit_quantity", displayName: "Habit (quantity)", cadence: "recurring", skillSlug: null, isBuiltIn: true },
  { id: "et-3", slug: "food_meal", displayName: "Food meal", cadence: "ad-hoc", skillSlug: "mikoshi-tracker-food", isBuiltIn: true },
];

describe("EntryTypeFilter", () => {
  it("renders one chip per known entry type plus an 'All' chip", () => {
    renderWithQuery("");

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
        displayName: "Weight log",
        cadence: "recurring",
        skillSlug: null,
        isBuiltIn: false,
      },
    ];
    render(
      <MemoryRouter initialEntries={["/entries"]}>
        <EntryTypeFilter entryTypes={TYPES_WITH_UNKNOWN} copy={COPY} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("entry-type-filter-weight_log")).toHaveTextContent("Weight log");
  });

  it("treats no `entryTypeSlug` query as 'All' active", () => {
    renderWithQuery("");
    expect(screen.getByTestId("entry-type-filter-all")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("entry-type-filter-habit_boolean")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("marks all slugs in the URL as active", () => {
    renderWithQuery("entryTypeSlug=food_meal,habit_boolean");
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

  it("clicking a chip writes the new entryTypeSlug into the URL", () => {
    renderWithQuery("");
    fireEvent.click(screen.getByTestId("entry-type-filter-food_meal"));
    expect(currentUrl()).toBe("/entries?entryTypeSlug=food_meal");
  });

  it("clicking an active chip removes it from the URL", () => {
    renderWithQuery("entryTypeSlug=food_meal,habit_boolean");
    fireEvent.click(screen.getByTestId("entry-type-filter-food_meal"));
    expect(currentUrl()).toBe("/entries?entryTypeSlug=habit_boolean");
  });

  it("clicking 'All' clears the entryTypeSlug param", () => {
    renderWithQuery("entryTypeSlug=food_meal");
    fireEvent.click(screen.getByTestId("entry-type-filter-all"));
    expect(currentUrl()).toBe("/entries");
  });

  it("preserves other query parameters when toggling chips", () => {
    renderWithQuery("status=archived");
    fireEvent.click(screen.getByTestId("entry-type-filter-habit_boolean"));
    expect(currentUrl()).toBe("/entries?status=archived&entryTypeSlug=habit_boolean");
  });
});
