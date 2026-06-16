import { expect, test } from "@playwright/test";

import { signUpAndCreateFirstHabit } from "../accessibility/helpers";

test("protected shell shows utility access and active desktop navigation", async ({ page }) => {
  await signUpAndCreateFirstHabit(page, `shell-desktop-${Date.now()}@example.com`, "Shell User");

  const utilityNav = page.getByTestId("app-shell-utility-nav");
  const primaryNav = page.getByTestId("app-shell-primary-nav");

  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(primaryNav).toBeVisible();
  await expect(utilityNav).toBeVisible();
  await expect(page.getByText(/shell-desktop-/)).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  const apiAccessEntry = utilityNav.getByRole("link", { name: "API Access" });
  await expect(apiAccessEntry).toHaveAttribute("data-accented", "true");
  await expect(apiAccessEntry).not.toHaveAttribute("aria-current", "page");

  const circlesLink = primaryNav.getByRole("link", { name: "Circles" });
  await circlesLink.focus();
  await circlesLink.press("Enter");
  await expect(page).toHaveURL(/\/circles/);
  await expect(primaryNav.getByRole("link", { name: "Circles" })).toBeFocused();
  await expect(primaryNav.getByRole("link", { name: "Circles" })).toHaveAttribute("aria-current", "page");

  const apiAccessLink = utilityNav.getByRole("link", { name: "API Access" });
  await apiAccessLink.focus();
  await apiAccessLink.press("Enter");
  // /api-access now redirects to the tabbed Settings page on the API tab.
  await expect(page).toHaveURL(/\/settings\?tab=api$/);
  await expect(page.getByTestId("settings-index-page")).toBeVisible();
});

test.describe("mobile shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("protected shell uses bottom navigation on mobile while keeping utility access on top", async ({ page }) => {
    await signUpAndCreateFirstHabit(page, `shell-mobile-${Date.now()}@example.com`, "Shell User");

    const mobileNav = page.getByTestId("app-shell-mobile-nav");

    await expect(mobileNav).toBeVisible();
    await expect(page.getByTestId("app-shell-primary-nav")).not.toBeVisible();
    await expect(page.getByTestId("app-shell-utility-nav")).toBeVisible();
    await expect(mobileNav.getByRole("link", { name: /Today/i })).toHaveAttribute("aria-current", "page");

    await page.getByTestId("locale-switch-button").click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("app-shell-utility-nav").getByRole("link", { name: "API 访问" })).toBeVisible();
    await expect(mobileNav.getByRole("link", { name: "今天" })).toHaveAttribute("aria-current", "page");

    const mobileCirclesLink = mobileNav.getByRole("link", { name: "圈子" });
    await mobileCirclesLink.focus();
    await mobileCirclesLink.press("Enter");
    await expect(page).toHaveURL(/\/circles/);
    await expect(mobileCirclesLink.locator("span").last()).toBeVisible();
    await expect(mobileCirclesLink.locator("span").last()).toHaveText("圈子");
    await expect(mobileNav.getByRole("link", { name: "圈子" })).toBeFocused();
    await expect(mobileNav.getByRole("link", { name: "圈子" })).toHaveAttribute("aria-current", "page");

    const mobileApiAccessLink = page.getByTestId("app-shell-utility-nav").getByRole("link", { name: "API 访问" });
    await mobileApiAccessLink.focus();
    await mobileApiAccessLink.press("Enter");
    // /api-access now redirects to the tabbed Settings page on the API tab.
    await expect(page).toHaveURL(/\/settings\?tab=api$/);
    await expect(page.getByTestId("settings-index-page")).toBeVisible();
  });
});
