# Adding a new EntryType

> Companion to [`generic-entries.md`](./generic-entries.md). Walks through every
> file you need to touch when shipping a new typed-entry. Worked example:
> `weight_log`, a recurring numeric entry that lets a user log their bodyweight
> daily and aggregate it over time.
>
> Cross-link from: [`GOAL.md`](../../GOAL.md) §G9.1.

## TL;DR

Adding a new EntryType is mostly **declarative**: define a JSON Schema for
the payload, a JSON Schema for the config, an aggregations spec, and seed
a row in `EntryType`. No new tables. No new endpoints. No new services.

If the type wants AI-assisted ingestion, it also gets a skill in the
Mikoshi repo (under `skills/<slug>/`); the tracker invokes that skill
via the type-agnostic `POST /api/skills/run` bridge. If the type wants a
dedicated web surface beyond `/entries`, you create a new `(app)/<slug>/`
route — but the generic entries list and the dashboard panel work out of
the box.

## Six load-bearing pieces

### 1. Seed the EntryType row

Edit `apps/api/src/modules/entry-types/seed.ts`:

```ts
const WEIGHT_LOG_PAYLOAD_SCHEMA = JSON.stringify({
  type: "object",
  required: ["weight_kg"],
  properties: {
    weight_kg: { type: "number", minimum: 0 },
    notes: { type: "string", nullable: true },
  },
  additionalProperties: false,
});

const WEIGHT_LOG_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    targetWeightKg: { type: "number", minimum: 1, nullable: true },
  },
  additionalProperties: false,
});

const WEIGHT_LOG_AGGREGATIONS = JSON.stringify({
  metrics: ["avg", "missing_days"],
  sumFields: ["weight_kg"],
  cachedColumns: {}, // add a generated column later if EXPLAIN says so
});

// …in BUILT_IN_ENTRY_TYPES:
{
  slug: "weight_log",
  displayName: "entry_type.weight_log",
  cadence: "recurring",
  skillSlug: null,            // or "mikoshi-tracker-weight" if you build one
  payloadSchema: WEIGHT_LOG_PAYLOAD_SCHEMA,
  configSchema: WEIGHT_LOG_CONFIG_SCHEMA,
  aggregations: WEIGHT_LOG_AGGREGATIONS,
  isBuiltIn: true,
},
```

`seedBuiltInEntryTypes` upserts `aggregations` and `configSchema` on every
boot, so existing deployments pick up additive changes without a migration.
Bump-tests: add the new slug to `apps/api/test/entry-types/seed.test.ts`.

### 2. (Optional) Add a SQLite generated column for hot aggregations

Only do this when `EXPLAIN QUERY PLAN` shows the new field on a hot path
(see `docs/architecture/performance.md` for the food_meal precedent). The
recipe lives in `prisma/migrations/<ts>_add_<field>_cached_column/`:

1. Add a nullable Float to `EntryEvent` in `prisma/schema.prisma`.
2. Write a SQLite table-rebuild migration that adds a `STORED` generated
   column derived from `json_extract(payload, '$.<field>')` and a covering
   index over `(userId, dateKey, <field>_cached)`.
3. Wire `<field>: "<field>_cached"` into the type's `aggregations.cachedColumns`.

The aggregations engine uses `COALESCE(cached, CAST(json_extract(...) AS REAL))`
so the test DB (which doesn't run migrations) still works.

### 3. (Optional) Build a Mikoshi skill

If the type benefits from AI ingestion (voice/photo/text → structured
payload), create `skills/<slug>/` in the **mikoshi repo** following the
template in `skills/mikoshi-tracker-food/`:

- `SKILL.md` declares tools, secrets, runner, and the egress allow-list.
- `run.ts` is the stdin-JSON / stdout-JSON CLI.
- `lib/api-client.ts` wraps the tracker's `/api/entries`,
  `/api/entries/:id/events`, and `/api/aggregations` endpoints.
- Confidence gate + payload validation against
  `GET /api/entry-types/<slug>` happen inside the skill.

The tracker invokes the skill via `POST /api/skills/run` (already wired);
the only tracker-side change is the `skillSlug` field on the seeded row.

### 4. (Optional) Add MCP convenience tools

`packages/mcp/src/tools/<slug>.ts` exposes one-shot tools that POST to
`/api/skills/run`. Mirror `packages/mcp/src/tools/food.ts` and register
the new file in `catalog.ts` + `runtime.ts`. Rebuild `dist/` via `tsup`
so the stdio integration test picks them up.

### 5. (Optional) Dedicated web surface

If the type warrants more than the generic `/entries` row (e.g.
trend chart, photo gallery, calendar heatmap), create a new
`apps/web/app/(app)/<slug>/` route group:

- `page.tsx` server page fetches the day/range data via
  `getFoodAggregationsFromCookieHeader`-style helpers (or a new helper
  with the same shape).
- A client component renders the bespoke UI.
- Add a top-level nav item in `apps/web/lib/navigation.ts` if you want
  it surfaced; otherwise users still reach it via `/entries`.

Don't forget i18n: add a `lib/i18n/<slug>.ts` block with EN/ZH/ES strings
and wire `shell.navigation.<slug>` if the type gets nav real estate.

### 6. Tests

- `apps/api/test/entry-types/seed.test.ts` — assert the new slug is seeded
  with the right cadence/schema.
- `apps/api/test/aggregations/<slug>-aggregations.test.ts` — fixture
  + assertions.
- If you added a generated column: a perf test with ~10k rows is
  sufficient (see `apps/api/test/performance/aggregation-perf.test.ts`).
- If you shipped a skill: tests under `mikoshi/skills/<slug>/test/`.

## What you DO NOT need to do

- Create a new Prisma table.
- Create a new API module / route prefix.
- Touch `events.service.persistEvent` — every write still goes through
  that one function.
- Modify the existing `/api/entries/*` or `/api/events/*` endpoints.
- Special-case the new type in the aggregations engine — declarative
  `payloadSchema` + `aggregations` are enough.
- Special-case the new type in `EntryTypeFilter` — it shows up
  automatically once seeded; only the human-readable label needs an
  i18n line.

These properties are the §G9.1 invariants of the generic-entries engine
and they should continue to hold for every type you add. If you find
yourself adding a per-type code path, that's a smell — revisit the design.

## Worked example progression for `weight_log`

1. **Seed** the type (step 1). API now serves
   `GET /api/entry-types/weight_log` and the `EntryTypeFilter` chip shows
   "Weight log" on `/entries` for any user.
2. **First write**: agents/users POST `/api/entries` with
   `{ entryTypeSlug: "weight_log", name: "Daily weight", config: {} }`,
   then `/api/entries/:id/events` with `{ payload: { weight_kg: 78.2 } }`.
3. **Aggregations**: `GET /api/aggregations?entryTypeSlug=weight_log&from=...&to=...&fields=weight_kg`
   returns averages out of the box — no engine changes needed.
4. **Trend page** (optional, step 5): re-use `KcalTrend` with a different
   color and a different field — one component, two types.

When all of the above lands, the §G9.1 invariants still hold and the
tracker's "add a new type" loop closes in roughly the time it takes to
write the schema files.

---

**Reference implementation:** `weight_log` was shipped in Phase 14 — see
commits `task(73)` through `task(81)` in the main branch. That commit
train is the canonical example of the full loop from seed to E2E test.
