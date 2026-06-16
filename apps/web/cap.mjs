import { chromium } from "@playwright/test";

const MAGIC = process.env.MAGIC_URL;
const BASE = "http://127.0.0.1:3000";
const OUT = process.env.OUT_DIR || "/tmp/verify";
const LOCALE = process.env.LOCALE || "";

const browser = await chromium.launch({
  headless: false,
  args: ["--headless=new", "--no-sandbox", "--no-zygote", "--disable-gpu"],
  chromiumSandbox: false,
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1500 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

async function settle(ms = 1800) {
  await page.waitForTimeout(ms);
}

// Authenticate via the magic link (sets the session cookie on 127.0.0.1).
if (MAGIC) {
  await page.goto(MAGIC, { waitUntil: "domcontentloaded" });
  await settle(3000);
}

// Optional: force a UI locale before navigating.
if (LOCALE) {
  await page.evaluate((loc) => localStorage.setItem("mikoshi-tracker.locale", loc), LOCALE);
}

const shots = [
  ["01-dashboard", "/dashboard"],
  ["02-diet-today", "/food"],
  ["03-diet-goal", "/food?tab=goal"],
  ["04-diet-trends", "/food?tab=trends"],
  ["05-habits", "/habits"],
  ["06-habits-archived", "/habits?tab=archived"],
  ["07-settings-prefs", "/settings"],
  ["08-settings-skills", "/settings?tab=skills"],
  ["09-settings-api", "/settings?tab=api"],
  ["10-circles", "/circles"],
];

for (const [name, path] of shots) {
  try {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await settle();
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log("shot", name);
  } catch (err) {
    console.log("FAIL", name, String(err).slice(0, 120));
  }
}

// Habit detail: click the first habit row link if present.
try {
  await page.goto(BASE + "/habits", { waitUntil: "domcontentloaded" });
  await settle();
  const link = page.locator('[data-testid="habit-row"] a').first();
  if (await link.count()) {
    await link.click();
    await settle(1500);
    await page.screenshot({ path: `${OUT}/11-habit-detail.png`, fullPage: true });
    console.log("shot 11-habit-detail");
  }
} catch (err) {
  console.log("FAIL habit-detail", String(err).slice(0, 120));
}

// Circle detail: click the first circle card link if present.
try {
  await page.goto(BASE + "/circles", { waitUntil: "domcontentloaded" });
  await settle();
  const link = page.locator('a[href^="/circles/"]').first();
  if (await link.count()) {
    await link.click();
    await settle(1500);
    await page.screenshot({ path: `${OUT}/12-circle-detail.png`, fullPage: true });
    console.log("shot 12-circle-detail");
  }
} catch (err) {
  console.log("FAIL circle-detail", String(err).slice(0, 120));
}

// Mobile viewport for the two hero screens.
await page.setViewportSize({ width: 390, height: 1600 });
for (const [name, path] of [
  ["13-mobile-dashboard", "/dashboard"],
  ["14-mobile-diet", "/food"],
]) {
  try {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await settle();
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log("shot", name);
  } catch (err) {
    console.log("FAIL", name, String(err).slice(0, 120));
  }
}

await browser.close();
console.log("done");
