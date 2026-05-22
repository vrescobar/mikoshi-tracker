import { expect, test } from "@playwright/test";

import { signUpInBrowser } from "../accessibility/helpers";

// Phase 12 replaced the bespoke habits-management page (search, kind/category
// filters, inline edit overlay, status switch, per-action error feedback) with
// the generic entries list. `/habits*` now redirects to `/entries`, which lists
// habit entries as `habit-event-card`s and supports archive + restore only.
// Tests for the removed capabilities were dropped; the surviving flows — listing,
// archive, restore, and card layout — are exercised below against the new UI.
//
// Habits shown on the entries surface are generic `Entry` rows created through
// `/api/entries` (the legacy `/api/habits` table is disjoint and only feeds the
// dashboard/today views).

const HABITS_URL = "/entries?entryTypeSlug=habit_boolean,habit_quantity";
const ARCHIVED_URL = "/entries?entryTypeSlug=habit_boolean,habit_quantity&status=archived";

async function seedEntry(page: import("@playwright/test").Page, payload: Record<string, unknown>) {
  await page.evaluate(async (input) => {
    const response = await fetch("http://127.0.0.1:3001/api/entries", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }
  }, payload);
}

async function seedBooleanHabit(page: import("@playwright/test").Page, name: string) {
  await seedEntry(page, { entryTypeSlug: "habit_boolean", name, config: { frequencyType: "DAILY" } });
}

async function seedQuantityHabit(page: import("@playwright/test").Page, name: string) {
  await seedEntry(page, {
    entryTypeSlug: "habit_quantity",
    name,
    category: "learning",
    config: { frequencyType: "DAILY", targetValue: 10, unit: "pages" },
  });
}

test("habits surface lists habit entries and supports archive then restore", async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 900 });
  const email = `habits-manager-${Date.now()}@example.com`;

  await signUpInBrowser(page, email, "Habit Manager");
  await seedBooleanHabit(page, "Morning walk");
  await seedQuantityHabit(page, "Read pages");

  await page.goto("/habits");
  await expect(page.getByTestId("entries-page")).toBeVisible();

  const walkCard = page.getByTestId("habit-event-card").filter({ hasText: "Morning walk" });
  const readCard = page.getByTestId("habit-event-card").filter({ hasText: "Read pages" });
  await expect(walkCard).toBeVisible();
  await expect(readCard).toBeVisible();

  // Archiving a habit removes it from the active list while leaving the rest.
  await readCard.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByTestId("habit-event-card").filter({ hasText: "Read pages" })).toHaveCount(0);
  await expect(walkCard).toBeVisible();

  // The archived view surfaces the habit again with a Restore action.
  await page.goto(ARCHIVED_URL);
  const archivedReadCard = page.getByTestId("habit-event-card").filter({ hasText: "Read pages" });
  await expect(archivedReadCard).toBeVisible();
  await archivedReadCard.getByRole("button", { name: "Restore" }).click();

  // Restoring brings it back to the active list.
  await page.goto(HABITS_URL);
  await expect(page.getByTestId("habit-event-card").filter({ hasText: "Read pages" })).toBeVisible();
});

test.describe("mobile habits layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("habit card places its action below the metadata block", async ({ page }) => {
    const email = `habits-mobile-card-${Date.now()}@example.com`;

    await signUpInBrowser(page, email, "Habit Mobile Card User");
    await seedQuantityHabit(page, "Read pages");

    await page.goto("/habits");

    const card = page.getByTestId("habit-event-card").filter({ hasText: "Read pages" });
    const metaBox = await card.getByTestId("habit-event-card-meta").boundingBox();
    const actionBox = await card.getByRole("button", { name: "Archive" }).boundingBox();

    expect(metaBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect((actionBox?.y ?? 0) > (metaBox?.y ?? 0)).toBeTruthy();
  });
});
