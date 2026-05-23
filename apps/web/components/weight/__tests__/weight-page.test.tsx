import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: () => null }));
vi.mock("../../locale", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("../../ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  PageFrame: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageHeader: () => null,
  StatePanel: ({ title }: { title?: string }) => <div>{title}</div>,
  Surface: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../weight-trend", () => ({ WeightTrend: () => null }));
vi.mock("../../../lib/weight-client", () => ({
  isWeightPayload: (v: unknown): boolean => {
    if (!v || typeof v !== "object") return false;
    return typeof (v as Record<string, unknown>).weight_kg === "number";
  },
  ensureWeightEntry: vi.fn(),
  createWeightEvent: vi.fn(),
  deleteWeightEvent: vi.fn(),
}));
vi.mock("../../../lib/i18n/weight", () => ({
  getWeightCopy: () => ({
    page: {
      eyebrow: "Weight",
      title: "Weight log",
      description: "Track your weight.",
      emptyState: { title: "No weight logged yet", description: "Log your first weight entry." },
      logButton: "Log weight",
      logButtonSaving: "Saving…",
    },
    form: {
      weightKg: "Weight (kg)",
      notes: "Notes",
      notesPlaceholder: "Optional notes",
      save: "Save",
      cancel: "Cancel",
      errorRequired: "Weight is required.",
      errorPositive: "Weight must be positive.",
    },
    trend: { title: "Trend", empty: "No data.", label: "kg" },
    table: { date: "Date", weight: "Weight", notes: "Notes", actions: "Actions", delete: "Delete", confirmDelete: "Confirm", undoDeletion: "Undo" },
    dashboard: { eyebrow: "Weight", title: "Latest weight", latestLabel: "kg", logWeight: "Log weight →" },
  }),
}));

import type { EntryEventRecord } from "@mikoshi-tracker/contracts/events";

import { fireEvent, render, screen } from "@testing-library/react";

import { WeightPage } from "../weight-page";

function makeEvent(weight_kg: number, dateKey: string): EntryEventRecord {
  return {
    id: `ev-${dateKey}`,
    entryId: "entry-1",
    userId: "user-1",
    occurredAt: `${dateKey}T12:00:00.000Z`,
    dateKey,
    payload: { weight_kg, notes: null },
    value: weight_kg,
    completed: null,
    createdAt: `${dateKey}T12:00:00.000Z`,
    updatedAt: `${dateKey}T12:00:00.000Z`,
  };
}

describe("WeightPage", () => {
  it("renders the page container", () => {
    render(
      <WeightPage initialEvents={[]} initialAggregations={null} initialEntryId={null} />,
    );
    expect(screen.getByTestId("weight-page")).toBeInTheDocument();
  });

  it("shows empty state when no events", () => {
    render(
      <WeightPage initialEvents={[]} initialAggregations={null} initialEntryId={null} />,
    );
    expect(screen.getByText("No weight logged yet")).toBeInTheDocument();
  });

  it("renders a row for each event", () => {
    const events = [
      makeEvent(80.5, "2026-05-01"),
      makeEvent(80.0, "2026-05-02"),
    ];
    render(
      <WeightPage initialEvents={events} initialAggregations={null} initialEntryId="entry-1" />,
    );
    expect(screen.getAllByTestId("weight-row")).toHaveLength(2);
  });

  it("shows validation error when form submitted without a weight", () => {
    render(
      <WeightPage initialEvents={[]} initialAggregations={null} initialEntryId="entry-1" />,
    );
    const button = screen.getByRole("button", { name: "Log weight" });
    fireEvent.click(button);
    expect(screen.getByRole("alert")).toHaveTextContent("Weight is required.");
  });
});
