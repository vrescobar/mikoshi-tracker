import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../../locale";
import { SettingsSkillsPage } from "../settings-skills-page";

function renderPage(entries: Parameters<typeof SettingsSkillsPage>[0]["entries"]) {
  return render(
    <LocaleProvider initialLocale="en">
      <SettingsSkillsPage entries={entries} />
    </LocaleProvider>,
  );
}

describe("SettingsSkillsPage", () => {
  it("shows an empty state when no skills are registered", () => {
    renderPage([]);
    expect(screen.getByTestId("settings-skills-empty")).toBeInTheDocument();
  });

  it("renders an enrolled skill with last-run timestamp", () => {
    renderPage([
      {
        entryTypeName: "Food meal",
        health: {
          skillSlug: "mikoshi-tracker-food",
          enrolled: true,
          lastRunAt: "2026-05-22T10:30:00.000Z",
          lastError: null,
          unreachable: false,
        },
      },
    ]);
    const row = screen.getByTestId("settings-skill-mikoshi-tracker-food");
    expect(row).toHaveAttribute("data-tone", "enrolled");
    expect(screen.getByText("Enrolled")).toBeInTheDocument();
    expect(screen.getByText("2026-05-22T10:30:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("Food meal")).toBeInTheDocument();
    expect(screen.getByText("mikoshi-tracker-food")).toBeInTheDocument();
  });

  it("renders an unreachable skill with the danger tone", () => {
    renderPage([
      {
        entryTypeName: "Food meal",
        health: {
          skillSlug: "mikoshi-tracker-food",
          enrolled: null,
          lastRunAt: null,
          lastError: null,
          unreachable: true,
        },
      },
    ]);
    const row = screen.getByTestId("settings-skill-mikoshi-tracker-food");
    expect(row).toHaveAttribute("data-tone", "unreachable");
    expect(screen.getByText("Runner unreachable")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("renders the last error when present", () => {
    renderPage([
      {
        entryTypeName: "Food meal",
        health: {
          skillSlug: "mikoshi-tracker-food",
          enrolled: false,
          lastRunAt: null,
          lastError: "Missing ANTHROPIC_API_KEY",
          unreachable: false,
        },
      },
    ]);
    expect(screen.getByText("Missing ANTHROPIC_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("Not enrolled")).toBeInTheDocument();
  });
});
