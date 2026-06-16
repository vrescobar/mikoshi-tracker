import { expect, test } from "@playwright/test";

import { signUpInBrowser } from "../accessibility/helpers";

// The dashboard/today view reads the legacy habit system. Phase 12 removed the
// habits-management UI that used to archive habits inline (the /habits surface
// now lists generic entries, a separate data system whose archive state does
// not feed the dashboard). This spec therefore drives archive/restore through
// the legacy `/api/habits/:id/{archive,restore}` endpoints — the source the
// dashboard actually reflects — to verify the dashboard stays in place when the
// last active habit is archived and recovers today when it is restored.

async function createLegacyHabit(
  page: import("@playwright/test").Page,
  name: string,
  startDate: string,
): Promise<string> {
  return page.evaluate(
    async ({ habitName, habitStartDate }) => {
      const response = await fetch("http://127.0.0.1:3001/api/habits", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: habitName, frequency: { type: "daily" }, startDate: habitStartDate }),
      });
      if (!response.ok) {
        throw new Error(`Create habit failed: ${await response.text()}`);
      }
      return ((await response.json()) as { item: { id: string } }).item.id;
    },
    { habitName: name, habitStartDate: startDate },
  );
}

async function setHabitArchived(page: import("@playwright/test").Page, habitId: string, archived: boolean) {
  await page.evaluate(
    async ({ id, action }) => {
      const response = await fetch(`http://127.0.0.1:3001/api/habits/${id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${action} failed: ${await response.text()}`);
      }
    },
    { id: habitId, action: archived ? "archive" : "restore" },
  );
}

test("archiving the last active habit keeps dashboard in place and restore makes today reachable again", async ({
  page,
}) => {
  const email = `habit-regression-${Date.now()}@example.com`;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await signUpInBrowser(page, email, "Regression User");
  const habitId = await createLegacyHabit(page, "Morning walk", yesterday);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  // The active habit surfaces as a toggle in the "Today's habits" card.
  await expect(page.getByRole("button", { name: "Morning walk" })).toBeVisible();

  // Archive the only active habit — the dashboard keeps its protected shell and
  // surfaces guidance instead of redirecting away.
  await setHabitArchived(page, habitId, true);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("dashboard-primary-state")).toBeVisible();
  await expect(page.getByText("No active habits right now")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review archived habits" })).toBeVisible();

  // Restoring brings today back online.
  await setHabitArchived(page, habitId, false);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Morning walk" })).toBeVisible();
});
