import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

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

test("E2E weight flow: log, view, delete, dashboard panel", async ({
  page,
  request,
  context,
}) => {
  test.slow();

  const email = `weight-flow-${Date.now()}@example.com`;

  // (1) Sign up.
  await signUpThroughApi(request, context, email, "Weight Flow Test User");
  await page.goto("/dashboard");

  // (2) Visit /weight — expect empty state.
  await page.goto("/weight");
  await expect(page.getByTestId("weight-page")).toBeVisible();
  // No weight rows yet.
  expect(await page.getByTestId("weight-row").count()).toBe(0);

  // (3) Log a weight entry via the form.
  const kgInput = page.getByTestId("weight-kg-input");
  await kgInput.fill("78.2");
  await page.getByRole("button", { name: "Log weight" }).click();

  // Row appears.
  await expect(page.getByTestId("weight-row")).toHaveCount(1, { timeout: 10000 });
  await expect(page.getByTestId("weight-row").first()).toContainText("78.2");

  // (4) Visit /entries with entryTypeSlug=weight_log — the weight entry shows up.
  await page.goto("/entries?entryTypeSlug=weight_log");
  await expect(page.getByTestId("default-event-card")).toBeVisible({ timeout: 8000 });

  // (5) Visit /dashboard — WeightTodayPanel is present.
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-weight-today")).toBeVisible({ timeout: 8000 });
  // Panel shows the latest weight.
  await expect(page.getByTestId("dashboard-weight-today")).toContainText("78.2");

  // (6) Return to /weight and delete the event.
  await page.goto("/weight");
  await expect(page.getByTestId("weight-row")).toHaveCount(1, { timeout: 8000 });
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByTestId("weight-row")).toHaveCount(0, { timeout: 8000 });
});
