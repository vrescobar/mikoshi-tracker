import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

// Minimal valid 1×1 PNG — passes magic-byte detection and sharp processing.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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

test("E2E food flow: create, edit, view insights, delete, audit trail", async ({
  page,
  request,
  context,
}) => {
  // Allow extra time: 8-step flow with multiple page navigations.
  test.slow();

  const email = `food-flow-${Date.now()}@example.com`;

  // (1) Sign up.
  await signUpThroughApi(request, context, email, "Food Flow Test User");

  // Land on an app-origin page before any in-page fetch — about:blank cannot
  // issue the credentialed cross-origin request to the API.
  await page.goto("/dashboard");

  // The base64 upload endpoint requires a CheckInMutation id (legacy habits system).
  // Create a habit and complete it to obtain one.
  const mutationId = await page.evaluate(async () => {
    const habitRes = await fetch("http://127.0.0.1:3001/api/habits", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Placeholder habit", frequency: { type: "daily" } }),
    });
    if (!habitRes.ok) throw new Error(`Create habit failed: ${await habitRes.text()}`);
    const { item } = (await habitRes.json()) as { item: { id: string } };

    const completeRes = await fetch("http://127.0.0.1:3001/api/today/complete", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habitId: item.id }),
    });
    if (!completeRes.ok) throw new Error(`Complete habit failed: ${await completeRes.text()}`);
    const json = (await completeRes.json()) as { mutationId: string | null };
    return json.mutationId;
  });
  expect(mutationId).toBeTruthy();

  // (2) Upload a base64 image via /api/attachments/base64.
  const attachmentId = await page.evaluate(
    async ({ mId, data }: { mId: string; data: string }) => {
      const res = await fetch("http://127.0.0.1:3001/api/attachments/base64", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mutationId: mId, data, originalName: "food.png" }),
      });
      if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
      const json = (await res.json()) as { attachment: { id: string } };
      return json.attachment.id;
    },
    { mId: mutationId as string, data: TINY_PNG_BASE64 },
  );
  expect(attachmentId).toBeTruthy();

  // (3) POST a complete food_meal event referencing the attachment.
  //     wireAttachmentsToMutation links the uploaded attachment to the EventMutation
  //     created for this event via the attachmentIds field.
  // Use the user's default timezone (Asia/Shanghai) to match the wall-clock date the
  // API will assign as dateKey for food events (cutoffHour=0 for event_log types).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const eventId = await page.evaluate(
    async ({ aId, todayStr }: { aId: string; todayStr: string }) => {
      // Reuse an existing food_meal Entry or create one.
      const listRes = await fetch(
        "http://127.0.0.1:3001/api/entries?entryTypeSlug=food_meal&isActive=true",
        { credentials: "include" },
      );
      if (!listRes.ok) throw new Error(`List entries failed: ${await listRes.text()}`);
      const { items } = (await listRes.json()) as { items: { id: string }[] };

      let entryId: string;
      if (items.length > 0) {
        entryId = items[0].id;
      } else {
        const createRes = await fetch("http://127.0.0.1:3001/api/entries", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entryTypeSlug: "food_meal",
            name: "Food log",
            config: {},
            startDate: todayStr,
          }),
        });
        if (!createRes.ok) throw new Error(`Create entry failed: ${await createRes.text()}`);
        const { item } = (await createRes.json()) as { item: { id: string } };
        entryId = item.id;
      }

      const eventRes = await fetch(
        `http://127.0.0.1:3001/api/entries/${encodeURIComponent(entryId)}/events`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            occurredAt: new Date().toISOString(),
            payload: {
              name: "Test meal",
              kcal: 500,
              protein_g: 30,
              carbs_g: 40,
              fat_g: 15,
              fiber_g: null,
              sugar_g: null,
              portion_g: null,
              mealSlot: "lunch",
              source: "manual",
              confidence: 1.0,
              similarToEventId: null,
              sources: null,
              notes: null,
            },
            attachmentIds: [aId],
            source: "WEB",
          }),
        },
      );
      if (!eventRes.ok) throw new Error(`Create event failed: ${await eventRes.text()}`);
      const { item } = (await eventRes.json()) as { item: { id: string } };
      return item.id;
    },
    { aId: attachmentId, todayStr: today },
  );
  expect(eventId).toBeTruthy();

  // (4) Visit /food and see the timeline card.
  await page.goto("/food");
  await expect(page.getByTestId("food-page")).toBeVisible();
  await expect(page.getByTestId("food-event-card")).toBeVisible();

  // (5) Edit kcal in /food/[eventId].
  await page.goto(`/food/${eventId}`);
  await expect(page.getByTestId("food-detail-page")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();

  const kcalInput = page.locator("#food-edit-kcal");
  await expect(kcalInput).toBeVisible();
  await kcalInput.fill("600");
  await page.getByRole("button", { name: "Save" }).click();

  // Edit form closes on success; the updated payload view is shown.
  await expect(kcalInput).not.toBeVisible();

  // (6) Visit /food/insights and see the heatmap rendered with data.
  await page.goto(`/food/insights?from=${today}&to=${today}`);
  await expect(page.getByTestId("food-insights-page")).toBeVisible();
  await expect(page.getByTestId("range-heatmap")).toBeVisible();

  // (7) Delete the event via the detail page.
  await page.goto(`/food/${eventId}`);
  await expect(page.getByTestId("food-detail-page")).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();

  // Soft delete: the "Undo deletion" button appears and the form reloads the event.
  await expect(page.getByRole("button", { name: "Undo deletion" })).toBeVisible();

  // (8) Confirm the audit trail shows CREATE → UPDATE → DELETE.
  //     Mutations are stored with data-type attributes for reliable selection.
  await expect(page.locator('[data-type="CREATE"]')).toBeVisible();
  await expect(page.locator('[data-type="UPDATE"]')).toBeVisible();
  await expect(page.locator('[data-type="DELETE"]')).toBeVisible();
});
