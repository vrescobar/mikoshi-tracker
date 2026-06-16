import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../locale";
import { SettingsPreferences } from "../settings-preferences";

const setDietPreferences = vi.fn();

vi.mock("../../../lib/diet-client", () => ({
  setDietPreferences: (input: unknown) => setDietPreferences(input),
}));

function renderPanel(initial: Record<string, unknown> | null) {
  return render(
    <LocaleProvider initialLocale="en">
      <SettingsPreferences initialPreferences={initial} />
    </LocaleProvider>,
  );
}

describe("SettingsPreferences", () => {
  beforeEach(() => {
    setDietPreferences.mockReset();
  });

  it("persists the weekly-report opt-in, preserving other preferences", async () => {
    setDietPreferences.mockResolvedValue({ units: "imperial", weeklyReportOptIn: true });
    renderPanel({ units: "imperial", dislikes: ["cilantro"], weeklyReportOptIn: false });

    fireEvent.click(screen.getByTestId("weekly-report-toggle"));

    await waitFor(() => expect(setDietPreferences).toHaveBeenCalledTimes(1));
    expect(setDietPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ units: "imperial", dislikes: ["cilantro"], weeklyReportOptIn: true }),
    );
  });

  it("reverts the toggle when the save fails", async () => {
    setDietPreferences.mockRejectedValue(new Error("offline"));
    renderPanel({ weeklyReportOptIn: false });

    const toggle = screen.getByTestId("weekly-report-toggle") as HTMLInputElement;
    fireEvent.click(toggle);

    await waitFor(() => expect(toggle.checked).toBe(false));
  });
});
