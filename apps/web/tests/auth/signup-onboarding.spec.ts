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
  // The redesigned dashboard renders a TodayBoard (greeting + progress) followed
  // by the "Today's habits" card, where each scheduled habit is a toggle button
  // labelled with the habit name.
  await expect(page.getByRole("heading", { name: "Today's habits" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Morning walk" })).toBeVisible();
});
