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

test("today board statistics sit above the habits card and refresh after today actions", async ({ page }) => {
  const email = `dashboard-analytics-${Date.now()}@example.com`;
  const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await signUpInBrowser(page, email, "Dashboard Analytics User");
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

  // The redesigned dashboard folds the old analytics overview into the TodayBoard:
  // a progress ring plus a "Statistics" card with weekly average, habits
  // completed, and best streak tiles.
  await expect(page.getByText("Today's progress")).toBeVisible();
  await expect(page.getByText("0/2 habits")).toBeVisible();
  const statsCard = page.getByText("Statistics");
  await expect(statsCard).toBeVisible();
  await expect(page.getByText("Weekly average")).toBeVisible();
  await expect(page.getByText("Habits completed")).toBeVisible();
  await expect(page.getByText("Best streak", { exact: true })).toBeVisible();

  // The TodayBoard renders above the "Today's habits" card.
  const boardBox = await page.getByText("Today's progress").boundingBox();
  const habitsBox = await page.getByRole("heading", { name: "Today's habits" }).boundingBox();
  expect(boardBox).not.toBeNull();
  expect(habitsBox).not.toBeNull();
  expect((boardBox?.y ?? 0) < (habitsBox?.y ?? 0)).toBeTruthy();

  // Completing a due habit refreshes the overview-driven statistics: the
  // "Habits completed" tile (weekly completed count) ticks up from 0 to 1.
  // The value span immediately precedes its label span within the stat tile.
  const habitsCompletedValue = page
    .getByText("Habits completed")
    .locator("xpath=preceding-sibling::span[1]");
  await expect(habitsCompletedValue).toHaveText("0");

  await page.getByRole("button", { name: "Morning walk" }).click();

  await expect(habitsCompletedValue).toHaveText("1");
});

test.describe("mobile dashboard", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile dashboard keeps the today board (with statistics) above the habits card", async ({
    page,
  }) => {
    const email = `dashboard-mobile-${Date.now()}@example.com`;
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await signUpInBrowser(page, email, "Dashboard Mobile User");
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

    await expect(page.getByTestId("app-shell-mobile-nav")).toBeVisible();
    await expect(page.getByText("Today's progress")).toBeVisible();
    await expect(page.getByText("Statistics")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today's habits" })).toBeVisible();

    const boardBox = await page.getByText("Today's progress").boundingBox();
    const habitsBox = await page.getByRole("heading", { name: "Today's habits" }).boundingBox();

    expect(boardBox).not.toBeNull();
    expect(habitsBox).not.toBeNull();
    expect((boardBox?.y ?? 0) < (habitsBox?.y ?? 0)).toBeTruthy();
  });
});
