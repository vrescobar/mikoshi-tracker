import { expect, test } from "@playwright/test";

import { createFirstHabit, signUpInBrowser } from "../accessibility/helpers";

// The redesigned dashboard renders a TodayBoard (progress ring + statistics)
// followed by a "Today's habits" card. Each scheduled habit is a single toggle
// button labelled with the habit name: clicking it completes the habit (for a
// quantity habit it logs the full target in one tap) and clicking again undoes
// the check-in. The old per-item quantity inputs, pending/completed group
// headings, and inline feedback banners were removed in the rebuild.

async function createHabitViaApi(page: import("@playwright/test").Page, payload: Record<string, unknown>) {
  await page.evaluate(async (input) => {
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
  }, payload);
}

test("today's habits card stays in sync through complete and undo for boolean and quantity habits", async ({
  page,
}) => {
  const email = `today-user-${Date.now()}@example.com`;
  const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await signUpInBrowser(page, email, "Today User");
  await createFirstHabit(page, {
    name: "Morning walk",
    startDate,
  });

  await createHabitViaApi(page, {
    name: "Read pages",
    kind: "quantity",
    targetValue: 10,
    unit: "pages",
    startDate,
    frequency: {
      type: "daily",
    },
  });

  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Today's habits" })).toBeVisible();

  const walkToggle = page.getByRole("button", { name: "Morning walk" });
  const readToggle = page.getByRole("button", { name: "Read pages" });

  await expect(walkToggle).toBeVisible();
  await expect(readToggle).toBeVisible();
  await expect(walkToggle).toHaveAttribute("aria-pressed", "false");
  await expect(readToggle).toHaveAttribute("aria-pressed", "false");

  // Completing the boolean habit flips its toggle on.
  await walkToggle.click();
  await expect(walkToggle).toHaveAttribute("aria-pressed", "true");

  // Completing the quantity habit logs its full target in one tap.
  await readToggle.click();
  await expect(readToggle).toHaveAttribute("aria-pressed", "true");

  // Undoing returns each habit to the pending state.
  await readToggle.click();
  await expect(readToggle).toHaveAttribute("aria-pressed", "false");

  await walkToggle.click();
  await expect(walkToggle).toHaveAttribute("aria-pressed", "false");
});

test("today action failures leave the toggle in place inside the dashboard", async ({ page }) => {
  const email = `today-error-${Date.now()}@example.com`;

  await signUpInBrowser(page, email, "Today Error User");
  await createFirstHabit(page, {
    name: "Morning walk",
  });

  await page.route("**/api/today/complete", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Unable to mark habit complete right now",
      }),
    });
  });

  await page.goto("/dashboard");

  const walkToggle = page.getByRole("button", { name: "Morning walk" });
  await expect(walkToggle).toHaveAttribute("aria-pressed", "false");

  // A failed completion is swallowed best-effort: the toggle stays unchanged and
  // the user is never navigated away from the dashboard.
  await walkToggle.click();

  await expect(walkToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveURL(/\/dashboard$/);
});

// Removed: "today success feedback auto-dismisses after a short delay" and
// "mobile quantity cards keep input and actions on one horizontal row" — both
// exercised UI (inline today-feedback banners and per-item quantity inputs) that
// the dashboard rebuild deleted. The single-tap toggle has no equivalent
// feedback banner or amount input, so these cases no longer have a target.
