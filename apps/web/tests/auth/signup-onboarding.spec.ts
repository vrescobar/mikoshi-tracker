import { expect, test } from "@playwright/test";

import { createFirstHabit, signUpInBrowser } from "../accessibility/helpers";

test("signed-in user can reach dashboard after creating the first habit", async ({ page }) => {
  const email = `new-user-${Date.now()}@example.com`;
  const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await signUpInBrowser(page, email, "New User");
  // Phase 12 removed the dedicated "Create your first habit" onboarding form;
  // habits are now created through the generic entries/API surface. Create the
  // first habit, then confirm the dashboard surfaces it.
  await createFirstHabit(page, { name: "Morning walk", startDate });

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("dashboard-overview")).toBeVisible();
  await expect(page.getByTestId("today-dashboard")).toBeVisible();
  // Scope the section headings to their regions: Phase 12 added a food panel to
  // the dashboard, so a bare "Today" heading is no longer unique.
  await expect(
    page.getByTestId("today-dashboard").getByRole("heading", { name: "Today" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("dashboard-overview").getByRole("heading", { name: "Overview" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Morning walk" })).toBeVisible();
});
