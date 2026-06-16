import { expect, test } from "@playwright/test";

import { createFirstHabit, signUpInBrowser } from "../accessibility/helpers";

async function createHabitViaApi(page: import("@playwright/test").Page, payload: Record<string, unknown>) {
  return page.evaluate(async (input) => {
    const response = await fetch("http://127.0.0.1:3001/api/habits", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as { item: { id: string } };
  }, payload);
}

test("dashboard shows the no-entries panel for a brand-new user with food panel visible", async ({
  page,
}) => {
  const email = `dashboard-no-entries-${Date.now()}@example.com`;

  await signUpInBrowser(page, email, "No Entries User");

  // Phase 13: empty-state taxonomy distinguishes "no entries of any type" from
  // "only food" and "only archived habits". A brand-new user has neither
  // habits nor food, so the panel offers both CTAs and the food panel still
  // surfaces beside the empty state.
  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(page.getByTestId("dashboard-primary-state")).toBeVisible();
  await expect(page.getByText("Nothing tracked yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create first habit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log a meal" })).toBeVisible();
});

test("dashboard shows the habits-empty panel when only food is present", async ({ page }) => {
  const email = `dashboard-habits-empty-${Date.now()}@example.com`;

  await signUpInBrowser(page, email, "Habits Empty User");

  // Create a food_meal entry via API so the user has food but zero habits.
  await page.evaluate(async () => {
    const entriesResponse = await fetch("http://127.0.0.1:3001/api/entries", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entryTypeSlug: "food_meal",
        name: "Meals",
        config: {},
      }),
    });
    if (!entriesResponse.ok) throw new Error(await entriesResponse.text());
  });

  await page.goto("/dashboard");

  await expect(page.getByTestId("dashboard-primary-state")).toBeVisible();
  await expect(page.getByText("No active habits right now")).toBeVisible();
});

test("dashboard's today habits card reflects scheduling and completion", async ({ page }) => {
  const email = `dashboard-states-${Date.now()}@example.com`;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await signUpInBrowser(page, email, "Dashboard States User");
  // A habit scheduled to start tomorrow is not due today, so the "Today's habits"
  // card shows the empty message rather than a toggle.
  await createFirstHabit(page, {
    name: "Tomorrow walk",
    startDate: tomorrow,
  });

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Today's habits" })).toBeVisible();
  await expect(page.getByText("Nothing scheduled for today.")).toBeVisible();

  // Add a habit that is due today; it now appears as a toggle button.
  await createHabitViaApi(page, {
    name: "Today walk",
    kind: "boolean",
    startDate: yesterday,
    frequency: {
      type: "daily",
    },
  });

  await page.goto("/dashboard");

  const todayToggle = page.getByRole("button", { name: "Today walk" });
  await expect(todayToggle).toBeVisible();
  await expect(todayToggle).toHaveAttribute("aria-pressed", "false");

  // Completing the habit flips the toggle on and lights up the progress ring.
  await todayToggle.click();
  await expect(todayToggle).toHaveAttribute("aria-pressed", "true");
});

test("dashboard keeps recoverable load errors inside the route shell", async ({ page }) => {
  const email = `dashboard-error-${Date.now()}@example.com`;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await signUpInBrowser(page, email, "Dashboard Error User");
  await createFirstHabit(page, {
    name: "Morning walk",
    startDate: yesterday,
  });

  await page.goto("/dashboard?simulateTodayError=1&simulateOverviewError=1");

  await expect(page.getByTestId("dashboard-bootstrap-state")).toBeVisible();
  await expect(page.getByText("Dashboard needs another try")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry dashboard" })).toBeVisible();
});
