import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventCard } from "../EventCard";

vi.mock("../../../lib/entries-client", () => ({
  archiveEntry: vi.fn(),
  restoreEntry: vi.fn(),
}));

vi.mock("../../locale", () => ({ useLocale: () => ({ locale: "en" }) }));

function makeEntry(overrides: Partial<{ id: string; entryTypeSlug: string; isActive: boolean }> = {}) {
  return {
    id: overrides.id ?? "entry-1",
    userId: "user-1",
    entryTypeId: "et-1",
    entryTypeSlug: overrides.entryTypeSlug ?? "habit_boolean",
    name: "Morning run",
    description: null,
    category: null,
    config: { frequencyType: "daily" },
    startDate: "2026-01-01",
    isActive: overrides.isActive ?? true,
    weekdays: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("EventCard — dispatch", () => {
  it("renders HabitEventCard for habit_boolean", () => {
    render(<EventCard entry={makeEntry({ entryTypeSlug: "habit_boolean" })} />);
    expect(screen.getByTestId("habit-event-card")).toBeInTheDocument();
    expect(screen.queryByTestId("default-event-card")).not.toBeInTheDocument();
  });

  it("renders HabitEventCard for habit_quantity", () => {
    render(<EventCard entry={makeEntry({ entryTypeSlug: "habit_quantity" })} />);
    expect(screen.getByTestId("habit-event-card")).toBeInTheDocument();
    expect(screen.queryByTestId("default-event-card")).not.toBeInTheDocument();
  });

  it("renders default card for unknown entry type", () => {
    render(<EventCard entry={makeEntry({ entryTypeSlug: "food_meal" })} />);
    expect(screen.getByTestId("default-event-card")).toBeInTheDocument();
    expect(screen.queryByTestId("habit-event-card")).not.toBeInTheDocument();
  });

  it("default card carries the entry type slug as a data attribute", () => {
    render(<EventCard entry={makeEntry({ entryTypeSlug: "food_meal" })} />);
    const card = screen.getByTestId("default-event-card");
    expect(card).toHaveAttribute("data-entry-type-slug", "food_meal");
  });

  it("HabitEventCard shows the entry name", () => {
    render(<EventCard entry={makeEntry({ entryTypeSlug: "habit_boolean" })} />);
    expect(screen.getByText("Morning run")).toBeInTheDocument();
  });
});
