import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

// Minimal valid 1×1 PNG — passes file-type magic-byte detection and sharp processing.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function signUpThroughApi(request: APIRequestContext, context: BrowserContext, email: string, name: string) {
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

test("upload a base64 attachment and see it in the habit detail gallery", async ({ page, request, context }) => {
  const email = `attachments-${Date.now()}@example.com`;

  await signUpThroughApi(request, context, email, "Attachment Test User");

  // Create a habit via the API (session cookie is now in the browser context).
  const habitId = await page.evaluate(async () => {
    const res = await fetch("http://127.0.0.1:3001/api/habits", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Morning walk", frequency: { type: "daily" } }),
    });

    if (!res.ok) {
      throw new Error(`Create habit failed: ${await res.text()}`);
    }

    return ((await res.json()) as { item: { id: string } }).item.id;
  });

  expect(habitId).toBeTruthy();

  // Complete the habit today to obtain a mutationId.
  const mutationId = await page.evaluate(async (hId: string) => {
    const res = await fetch("http://127.0.0.1:3001/api/today/complete", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habitId: hId }),
    });

    if (!res.ok) {
      throw new Error(`Complete habit failed: ${await res.text()}`);
    }

    return ((await res.json()) as { mutationId: string | null }).mutationId;
  }, habitId);

  expect(mutationId).toBeTruthy();

  // Upload a base64 image attached to that mutation.
  const attachmentId = await page.evaluate(
    async ({ mId, data }: { mId: string; data: string }) => {
      const res = await fetch("http://127.0.0.1:3001/api/attachments/base64", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mutationId: mId, data, originalName: "test.png" }),
      });

      if (!res.ok) {
        throw new Error(`Upload attachment failed: ${await res.text()}`);
      }

      return ((await res.json()) as { attachment: { id: string } }).attachment.id;
    },
    { mId: mutationId as string, data: TINY_PNG_BASE64 },
  );

  expect(attachmentId).toBeTruthy();

  // Open the habit detail page and verify the gallery renders the attachment.
  await page.goto(`/habits/${habitId}`);
  await expect(page.getByTestId("habit-detail-overlay")).toBeVisible();
  await expect(page.getByTestId("habit-attachments-gallery")).toBeVisible();
  await expect(page.getByTestId("habit-attachment-tile")).toBeVisible();
});
