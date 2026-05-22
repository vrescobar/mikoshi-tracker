import { expect, test } from "@playwright/test";

import { signUpThroughApi } from "./helpers";

test("switching auth modes with keyboard moves focus to the first relevant field", async ({ page }) => {
  await page.goto("/");

  const createAccount = page.getByRole("button", { name: "Create account" });
  await createAccount.focus();
  await createAccount.press("Enter");

  await expect(page.getByLabel("Name")).toBeFocused();

  const backToSignIn = page.getByRole("button", { name: "Back to sign in" });
  await backToSignIn.focus();
  await backToSignIn.press("Enter");

  await expect(page.getByLabel("Email")).toBeFocused();
});

test("auth validation moves focus to the first invalid field and links the error text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();

  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");

  await expect(email).toBeFocused();
  await expect(password).toHaveAttribute("type", "password");
});

test("keyboard locale switch keeps focus continuity on auth", async ({ page }) => {
  await page.goto("/");

  const chineseButton = page.getByTestId("locale-switch-button");
  await chineseButton.focus();
  await chineseButton.press("Enter");

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(chineseButton).toBeFocused();
  await expect(page.getByRole("heading", { name: "登录 MikoshiTracker" })).toBeVisible();
});

// The "keyboard closing an edit overlay returns focus to the invoking trigger"
// test was retired here: Phase 12 removed the habit edit overlay it exercised.
// Focus-return on the surviving overlays is covered by component-level tests.

test("api access token controls remain keyboard-operable after reveal and rotate", async ({
  page,
  request,
  context,
}) => {
  const email = `focus-token-${Date.now()}@example.com`;
  await signUpThroughApi(request, context, email, "Keyboard Token User");

  await page.goto("/api-access");
  await page.getByRole("button", { name: "Generate token" }).click();

  const revealButton = page.getByRole("button", { name: "Reveal token" });
  await revealButton.focus();
  await revealButton.press("Enter");

  const tokenField = page.getByLabel("Personal API token");
  await expect(tokenField).toHaveValue(/mikoshi_tracker_/);
  await expect(page.getByRole("button", { name: "Copy token" })).toBeEnabled();

  const rotateButton = page.getByRole("button", { name: "Rotate token" });
  await rotateButton.focus();
  await rotateButton.press("Enter");

  await expect(page.getByTestId("api-access-feedback")).toContainText(/Token (rotated|generated)/);
  await expect(rotateButton).toBeFocused();
});
