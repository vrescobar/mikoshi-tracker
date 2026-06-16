import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HabitDetail, HabitTrendPoint } from "@mikoshi-tracker/contracts/habits";

import { LocaleProvider } from "../../locale";
import { HabitDetailPage } from "../habit-detail-page";

const archiveHabit = vi.fn();
const restoreHabit = vi.fn();

vi.mock("../../../lib/auth-client", () => ({
  archiveHabit: (id: string) => archiveHabit(id),
  restoreHabit: (id: string) => restoreHabit(id),
}));

function trend(n: number, status: HabitTrendPoint["status"]): HabitTrendPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(2026, 0, 1 + i).toISOString().slice(0, 10),
    status,
    completionRate: status === "completed" ? 1 : 0,
    completedCount: status === "completed" ? 1 : 0,
    completionTarget: 1,
    value: null,
    valueTarget: null,
  }));
}

const DETAIL: HabitDetail = {
  habit: {
    id: "h1",
    userId: "u1",
    name: "Meditate",
    kind: "boolean",
    description: "Ten minutes",
    category: "mind",
    targetValue: null,
    unit: null,
    startDate: "2026-01-01",
    isActive: true,
    frequencyType: "daily",
    frequencyCount: null,
    weekdays: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  stats: { currentStreak: 5, longestStreak: 12, totalCompletions: 40, interruptionCount: 3 },
  recentHistory: [
    {
      periodType: "day",
      periodKey: "2026-05-28",
      periodStart: "2026-05-28",
      periodEnd: "2026-05-28",
      status: "completed",
      completionCount: 1,
      completionTarget: 1,
      value: null,
      valueTarget: null,
      unit: null,
    },
  ],
  trends: { last7Days: trend(7, "completed"), last30Days: trend(30, "completed") },
};

function renderDetail(detail: HabitDetail = DETAIL) {
  return render(
    <MemoryRouter>
      <LocaleProvider initialLocale="en">
        <HabitDetailPage detail={detail} />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

describe("HabitDetailPage", () => {
  beforeEach(() => {
    archiveHabit.mockReset();
    restoreHabit.mockReset();
  });

  it("renders streak stats and the 30-day heatmap", () => {
    renderDetail();
    expect(screen.getByRole("heading", { name: "Meditate" })).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument(); // current streak
    expect(screen.getByText("12")).toBeInTheDocument(); // longest streak
    const heatmap = screen.getByTestId("habit-month-heatmap");
    expect(heatmap.querySelectorAll('[data-status]').length).toBe(30);
  });

  it("archives an active habit and flips to the restore action", async () => {
    archiveHabit.mockResolvedValue({ id: "h1", isActive: false });
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Archive habit" }));
    await waitFor(() => expect(archiveHabit).toHaveBeenCalledWith("h1"));
    expect(await screen.findByRole("button", { name: "Restore habit" })).toBeInTheDocument();
  });
});
