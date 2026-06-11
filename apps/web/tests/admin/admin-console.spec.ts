import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

async function signUpThroughApi(request: APIRequestContext, context: BrowserContext, email: string, name: string) {
  const response = await request.post("http://127.0.0.1:3001/api/auth/sign-up/email", {
    data: {
      email,
      password: "password123",
      name,
    },
  });

  expect(response.ok()).toBeTruthy();

  const cookies = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => {
      const [cookiePair] = header.value.split(";");
      const separatorIndex = cookiePair.indexOf("=");

      return {
        name: cookiePair.slice(0, separatorIndex),
        value: cookiePair.slice(separatorIndex + 1),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax" as const,
      };
    });

  await context.addCookies(cookies);
}

async function promoteSignedInUserToAdmin(request: APIRequestContext) {
  const response = await request.post("http://127.0.0.1:3001/api/test/session/promote-admin");

  expect(response.ok()).toBeTruthy();
}

test("admin sees the console: nav link, dashboard metrics, users list", async ({ page, request, context }) => {
  const email = `admin-console-${Date.now()}@example.com`;
  await signUpThroughApi(request, context, email, "Console Admin");
  await promoteSignedInUserToAdmin(request);

  await page.goto("/dashboard");
  // Utility nav shows the Admin link for admins only.
  const adminLink = page.getByTestId("app-shell-utility-nav").getByRole("link", { name: "Admin" });
  await expect(adminLink).toBeVisible();
  await adminLink.click();

  // Dashboard view renders system metrics.
  await expect(page.getByRole("heading", { name: "God mode" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Active circles")).toBeVisible();

  // Users view lists the admin account itself.
  await page.getByTestId("admin-nav").getByRole("link", { name: "Users" }).click();
  await expect(page.getByText(email)).toBeVisible();
});

test("non-admin gets 403 and no admin nav link", async ({ page, request, context }) => {
  // First account becomes admin automatically; create it, then a second one.
  const first = `admin-console-first-${Date.now()}@example.com`;
  await request.post("http://127.0.0.1:3001/api/auth/sign-up/email", {
    data: { email: first, password: "password123", name: "First" },
  });

  const email = `admin-console-second-${Date.now()}@example.com`;
  await signUpThroughApi(request, context, email, "Plain User");

  await page.goto("/dashboard");
  await expect(page.getByTestId("app-shell-utility-nav")).toBeVisible();
  await expect(
    page.getByTestId("app-shell-utility-nav").getByRole("link", { name: "Admin" }),
  ).toHaveCount(0);

  await page.goto("/admin");
  await expect(page.getByTestId("admin-forbidden")).toBeVisible();
});

test("god mode: view as user, banner, audited mutation context, exit", async ({ page, request, context }) => {
  const adminEmail = `admin-godmode-${Date.now()}@example.com`;
  await signUpThroughApi(request, context, adminEmail, "Godmode Admin");
  await promoteSignedInUserToAdmin(request);

  // A target user to impersonate (no cookies added — separate account).
  const targetEmail = `godmode-target-${Date.now()}@example.com`;
  const targetResponse = await request.post("http://127.0.0.1:3001/api/auth/sign-up/email", {
    data: { email: targetEmail, password: "password123", name: "Godmode Target" },
  });
  expect(targetResponse.ok()).toBeTruthy();

  // Admin opens the target's detail and enters god mode.
  await page.goto("/admin/users");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByText(targetEmail).click();
  await page.getByTestId("view-as-user").click();

  // The protected shell now renders AS the target, with the banner pinned.
  await expect(page.getByTestId("impersonation-banner")).toBeVisible();
  await expect(page.getByTestId("app-shell-header")).toContainText(targetEmail);

  // Refresh keeps god mode (sessionStorage survives reloads in the tab).
  await page.reload();
  await expect(page.getByTestId("impersonation-banner")).toBeVisible();

  // Exit restores the admin and returns to the console.
  await page.getByTestId("impersonation-exit").click();
  await expect(page.getByTestId("impersonation-banner")).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByTestId("app-shell-header")).toContainText(adminEmail);
});
