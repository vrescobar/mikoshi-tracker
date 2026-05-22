import { expect, test } from "@playwright/test";

import { signUpInBrowser } from "../accessibility/helpers";

// Phase 12 removed the habit detail overlay (summary, current/longest streak,
// recent trends, recent history). Every legacy `/habits*` route — including the
// per-habit detail route — now redirects to the generic entries list. This spec
// guards that redirect and that the habit entry is listed on the destination
// surface. The removed detail/trends UI is no longer asserted (the dedicated
// per-habit trends spec was retired with the feature).

async function seedHabitEntry(page: import("@playwright/test").Page, name: string): Promise<string> {
  return page.evaluate(async (habitName) => {
    const response = await fetch("http://127.0.0.1:3001/api/entries", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entryTypeSlug: "habit_quantity",
        name: habitName,
        config: { frequencyType: "DAILY", targetValue: 10, unit: "pages" },
      }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return ((await response.json()) as { item: { id: string } }).item.id;
  }, name);
}

test("legacy habit detail routes redirect to the entries surface", async ({ page }) => {
  const email = `habit-detail-${Date.now()}@example.com`;

  await signUpInBrowser(page, email, "Detail User");
  const entryId = await seedHabitEntry(page, "Read pages");

  // A direct link to a legacy per-habit detail route redirects to the entries list.
  await page.goto(`/habits/${entryId}`);
  await expect(page).toHaveURL(/\/entries(\?|$)/);
  await expect(page.getByTestId("entries-page")).toBeVisible();
  await expect(page.getByTestId("habit-event-card").filter({ hasText: "Read pages" })).toBeVisible();

  // The collection route redirects to the same surface.
  await page.goto("/habits");
  await expect(page).toHaveURL(/\/entries(\?|$)/);
  await expect(page.getByTestId("habit-event-card").filter({ hasText: "Read pages" })).toBeVisible();
});
