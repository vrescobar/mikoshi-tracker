import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

// Sign up via the API and inject the returned session cookies into the browser context.
async function signUpThroughApi(
  request: APIRequestContext,
  context: BrowserContext,
  email: string,
  name: string,
) {
  const response = await request.post("http://127.0.0.1:3001/api/auth/sign-up/email", {
    data: { email, password: "password123", name },
  });
  expect(response.ok()).toBeTruthy();

  const cookies = response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => {
      const [cookiePair] = h.value.split(";");
      const sep = cookiePair.indexOf("=");
      return {
        name: cookiePair.slice(0, sep),
        value: cookiePair.slice(sep + 1),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax" as const,
      };
    });
  await context.addCookies(cookies);
}

test("habit regression: sign up, create habit, complete, undo, view stats overview", async ({
  page,
  request,
  context,
}) => {
  test.slow();

  const email = `habit-regression-flow-${Date.now()}@example.com`;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // (1) Sign up.
  await signUpThroughApi(request, context, email, "Habit Regression User");

  // (2) Create a boolean habit via the legacy /api/habits endpoint.
  //     startDate is yesterday so the habit is already due today.
  const habitId = await page.evaluate(
    async ({ startDate }: { startDate: string }) => {
      const res = await fetch("http://127.0.0.1:3001/api/habits", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Morning run",
          frequency: { type: "daily" },
          startDate,
        }),
      });
      if (!res.ok) throw new Error(`Create habit failed: ${await res.text()}`);
      const json = (await res.json()) as { item: { id: string } };
      return json.item.id;
    },
    { startDate: yesterday },
  );
  expect(habitId).toBeTruthy();

  // (3) Navigate to the dashboard and verify today panel shows the habit as pending.
  await page.goto("/dashboard");
  await expect(page.getByTestId("today-dashboard")).toBeVisible();
  const habitCard = page.getByTestId(`today-item-${habitId}`);
  await expect(habitCard).toBeVisible();
  await expect(habitCard).toContainText("Morning run");

  const completeButton = habitCard.getByRole("button", { name: /complete/i });
  await expect(completeButton).toBeVisible();

  // (4) Complete the habit via the today UI.
  await completeButton.click();

  // The card should now show a completed state and expose an Undo button.
  await expect(habitCard.getByRole("button", { name: /undo/i })).toBeVisible();

  // Verify counts updated.
  await expect(page.getByText(/^1 completed$/)).toBeVisible();

  // (5) Undo the check-in via the today UI.
  await habitCard.getByRole("button", { name: /undo/i }).click();

  // The card should return to pending state.
  await expect(habitCard.getByRole("button", { name: /complete/i })).toBeVisible();
  await expect(page.getByText(/^1 pending$/)).toBeVisible();

  // (6) View the stats overview panel — proves the overview renders after a check-in cycle.
  await expect(page.getByTestId("dashboard-overview")).toBeVisible();
  await expect(page.getByTestId("overview-metrics")).toBeVisible();

  // Verify the stats API contract is intact: active habit count should be at least 1.
  const overview = await page.evaluate(async () => {
    const res = await fetch("http://127.0.0.1:3001/api/stats/overview", {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Stats overview failed: ${await res.text()}`);
    return (await res.json()) as {
      overview: {
        metrics: { activeHabitCount: number; todayCompletedCount: number };
        stabilityRanking: Array<{ habitId: string; name: string }>;
        trends: { last7Days: unknown[]; last30Days: unknown[] };
      };
    };
  });

  expect(overview.overview.metrics.activeHabitCount).toBeGreaterThanOrEqual(1);
  expect(overview.overview.trends.last7Days).toHaveLength(7);
  expect(overview.overview.trends.last30Days).toHaveLength(30);
  expect(overview.overview.stabilityRanking.some((e) => e.habitId === habitId)).toBeTruthy();

  // After undo the completed count is 0.
  expect(overview.overview.metrics.todayCompletedCount).toBe(0);
});
