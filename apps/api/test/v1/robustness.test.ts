import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { signUp, type TestContext } from "../helpers/app";
import { createV1DepsContext } from "./helpers/fullV1Deps";

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

describe("v1 robustness: sort + timezone override", () => {
  let ctx: TestContext;
  let cookie: string;

  beforeAll(async () => {
    ({ ctx } = await createV1DepsContext());
    ({ cookie } = await signUp(ctx.app, { timezone: "UTC" }));
    for (const name of ["Banana", "Apple", "Cherry"]) {
      await ctx.app.inject({
        method: "POST",
        url: "/api/v1/entries/create",
        headers: { cookie },
        payload: { entryTypeSlug: "habit_boolean", name, config: { frequencyType: "DAILY" } },
      });
    }
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("sorts an entries list by name descending", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/entries?sort=name&order=desc",
      headers: { cookie },
    });
    const body = res.json() as Envelope<{ items: { name: string }[] }>;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected success");
    const names = body.data.items.map((e) => e.name);
    const sorted = [...names].sort((a, b) => b.localeCompare(a));
    expect(names).toEqual(sorted);
    expect(names[0]).toBe("Cherry");
  });

  it("honours the X-Mikoshi-Tracker-TZ override on today/summary", async () => {
    // A valid IANA zone is accepted; an invalid one is ignored (no 500).
    const ok = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/today/summary",
      headers: { cookie, "x-mikoshi-tracker-tz": "America/New_York" },
    });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as Envelope<unknown>).ok).toBe(true);

    const bogus = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/today/summary",
      headers: { cookie, "x-mikoshi-tracker-tz": "Not/AZone" },
    });
    expect(bogus.statusCode).toBe(200);
  });
});
