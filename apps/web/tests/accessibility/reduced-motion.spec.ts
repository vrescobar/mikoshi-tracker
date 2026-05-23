import { expect, test } from "@playwright/test";

import { signUpAndCreateFirstHabit, signUpThroughApi } from "./helpers";

function parseDurationSeconds(raw: string) {
  const first = raw.split(",")[0]?.trim() ?? "0s";

  if (first.endsWith("ms")) {
    return Number.parseFloat(first.slice(0, -2)) / 1000;
  }

  if (first.endsWith("s")) {
    return Number.parseFloat(first.slice(0, -1));
  }

  return Number.NaN;
}

test("reduced-motion mode flattens shell transition timing", async ({ page }) => {
  // Phase 12 removed the habit edit overlay, so this spec no longer asserts the
  // overlay animation; the shell/nav transition flattening is still validated.
  const email = `reduced-motion-${Date.now()}@example.com`;

  await page.emulateMedia({ reducedMotion: "reduce" });
  await signUpAndCreateFirstHabit(page, email, "Reduced Motion User");

  await page.getByTestId("locale-switch-button").click();

  const habitsLink = page.getByTestId("app-shell-primary-nav").getByRole("link", { name: "条目" });
  const navTransitionDuration = await habitsLink.evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(parseDurationSeconds(navTransitionDuration)).toBeLessThanOrEqual(0.00001);
});

test("reduced-motion mode flattens dashboard charts and inline feedback motion", async ({ page, request, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const dashboardEmail = `reduced-motion-dashboard-${Date.now()}@example.com`;
  await signUpAndCreateFirstHabit(page, dashboardEmail, "Reduced Motion Dashboard User");

  const overviewChart = page.getByTestId("overview-trend-chart");
  await expect(overviewChart).toBeVisible();

  const firstBar = overviewChart.locator('div[style*="height:"]').first();
  const chartBarTransitionDuration = await firstBar.evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(parseDurationSeconds(chartBarTransitionDuration)).toBeLessThanOrEqual(0.00001);

  const apiEmail = `reduced-motion-api-${Date.now()}@example.com`;
  await signUpThroughApi(request, context, apiEmail, "Reduced Motion API User");
  await page.goto("/api-access");

  const generateTokenButton = page.getByRole("button", { name: "Generate token" });
  await generateTokenButton.click();

  const feedback = page.getByTestId("api-access-feedback");
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText("Token generated");

  const feedbackAnimationName = await feedback.evaluate((node) => getComputedStyle(node).animationName);
  expect(feedbackAnimationName).toBe("none");
});
