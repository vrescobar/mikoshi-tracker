# Food tracking — completion gaps & Phase 13 design

> Companion to [`generic-entries.md`](./generic-entries.md). This document
> catalogues every gap between Phase 12's `food_meal` foundation and a food
> experience the user can actually live with day-to-day, plus the design that
> Phase 13 implements to close those gaps. The authoritative task checklist
> is [`.ralphloop/tasks.md`](../../.ralphloop/tasks.md) tasks **59–72**;
> high-level plan is [`PLAN.md`](../../PLAN.md) Phase 13.

## Why this document exists

Phase 12 (tasks 32–58) built the generic entries engine and shipped
`food_meal` as its first non-habit type: schema, REST, aggregations, web
pages at `/food`, `/food/[eventId]`, `/food/insights`, a dashboard panel, and
the Mikoshi skill that owns AI ingestion. The verification matrix at task 58
passed.

However, opening the dashboard as a real user surfaces a different verdict:
the feature *exists* but is not *findable*, *reachable from where you start*,
or *complete enough to use without going through WhatsApp*. The food side of
the product is a back room of the house, not part of the main floor.

Phase 13 is the polish + closure pass that turns the food back room into a
front-of-house feature without re-architecting anything.

## What works today

| Layer | Status |
|---|---|
| Prisma schema (`EntryType`, `Entry`, `EntryEvent`, `EventMutation`, `CircleEntryShare`) | ✅ migrated and seeded |
| REST API (`/api/entry-types`, `/api/entries`, `/api/events`, `/api/aggregations`) | ✅ documented in OpenAPI |
| Page `/food` (timeline + DayTotalsStrip + add dialog) | ✅ |
| Page `/food/[eventId]` (inline edit + audit trail + soft delete + undo) | ✅ |
| Page `/food/insights` (range picker, heatmap, repeated meals, missing days) | ✅ |
| `FoodTodayPanel` on dashboard | ✅ (with the bug below fixed) |
| Manual entry via `ProposalDialog` (name + macros + meal slot + notes) | ✅ |
| i18n EN / ZH-CN / ES across every new string | ✅ |
| Performance: `kcal_cached` generated column + covering index | ✅ |
| E2E `tests/food-flow.spec.ts` (8-step audit-trail walkthrough) | ✅ |
| Skill `mikoshi-tracker-food` (4-tier pipeline + WhatsApp confirmation) | ✅ in `mikoshi` repo |

## Gaps closed in this commit

### G-FIX-1 — Dashboard empty-state hid food entirely *(fixed inline)*

**Symptom.** A user with zero active habits but who logs food sees only
"Create your first habit" on the dashboard. No mention of food, no link, no
totals — even when the user has food events today.

**Root cause.** `apps/web/components/dashboard/dashboard-shell.tsx:107-146`
returned early on `emptyState === "no-habits"` and
`emptyState === "archived-only"`, never rendering `FoodTodayPanel`.

**Fix (this commit).** The early-return branches now render `FoodTodayPanel`
underneath the habits-empty-state panel. Habits and food are siblings; if
habits are absent the food side still surfaces.

**Not fixed yet.** The `emptyState` calculation in
`apps/web/app/(app)/dashboard/page.tsx:39` still keys only off habit count.
A user with food but no habits is still bucketed as "no-habits" with the
habits-centric empty-state. The proper redesign is task **59**.

## Gaps to close in Phase 13

Each gap maps to one ralph-loop task. The numbering continues from Phase 12.

### G-DASH-1 — Dashboard empty-state is habit-centric (task 59)

The empty-state taxonomy considers only habits. A "tracker" with food but no
habits should not look empty.

**Design.**
- `dashboard/page.tsx` computes a richer state: `"no-entries"` only when the
  user has zero entries of any type AND zero events today; `"habits-empty"`
  when habits are absent but food has events; `"archived-only"` unchanged.
- `DashboardShell` renames the prop to `emptyState: "no-entries" | "habits-empty" | "archived-only" | null` and renders the corresponding panel,
  always keeping `FoodTodayPanel` on screen.
- Empty-state copy gains a `dashboard.emptyStates.noEntries` block in i18n
  with EN/ZH/ES, encouraging "create a habit *or* log a meal".

### G-DASH-2 — No quick-add for food from the dashboard (task 60)

`FoodTodayPanel` is read-only. The user must click "View food" → navigate →
click "Add food" → fill dialog. Three navigation steps to log a meal that
took ten seconds to eat.

**Design.**
- `FoodTodayPanel` accepts `onQuickAdd?: () => void` (when provided, renders
  an inline `+` button next to the title).
- A new client wrapper `DashboardFoodSection` owns the `ProposalDialog`
  state and renders the panel + dialog together, so opening the dialog from
  the dashboard does not navigate. After save, the dashboard refreshes
  `initialFoodTodayAggregations` via a server action revalidation.

### G-FOOD-1 — Photos cannot be attached to food events from the web (task 61)

The current `Attachment.mutationId` is non-nullable and references
`CheckInMutation`. Photo attachments on `EventMutation` rows exist in the
schema (column `eventMutationId` is nullable) but the `POST /api/attachments`
+ `POST /api/attachments/base64` endpoints still require a `CheckInMutation`
id. Web V1 of `ProposalDialog` omits photo upload because of this.

**Design.**
- New endpoint `POST /api/attachments/event` accepts `{ eventId, fileBase64 |
  multipart }`, stores into `Attachment` with `eventMutationId` set to the
  most recent `EventMutation` for the event (the `CREATE` mutation when
  attaching at create time), `mutationId` null.
- Contracts: add `attachmentTargetSchema` discriminated union (`{ kind:
  "habit-checkin", mutationId }` | `{ kind: "event", eventId }`).
- `ProposalDialog` gains an optional photo file input that uploads via the
  new endpoint after `createFoodEvent` resolves.
- `food-detail-page.tsx` already renders attachments — once they exist on
  the event's `CREATE` mutation, the gallery lights up automatically.

### G-NAV-1 — Habits / Food / Entries are three siblings instead of one (task 62)

`getPrimaryAppNavigation` lists `dashboard`, `habits` (→ `/entries?…`),
`circles`, `food`. Adding any new `EntryType` either needs another top-level
nav item or hides under "Entries". The information architecture doesn't
scale.

**Design.**
- New top-level nav order: **Dashboard · Today · Entries · Food · Circles**.
- Remove "Habits" as a distinct nav target; the `/entries?entryTypeSlug=
  habit_boolean,habit_quantity` redirect remains for old URLs but the link
  becomes "Entries" pointing at the generic surface with a default filter
  selector ("All / Habits / Food / …").
- `EntriesPage` gains an `EntryTypeFilter` chip row sourced from
  `GET /api/entry-types`, with the active set persisted in `?entryTypeSlug=`.
- Food keeps its dedicated top-level link because its UX (timeline, photos,
  totals) is meaningfully different from a generic entries list.

### G-FOOD-2 — `ProposalDialog` is the only web entrypoint and it is manual-only (task 63)

Voice / photo / web-lookup / similar-event tiers live in the Mikoshi skill,
reachable only through WhatsApp. A web user with a photo of a meal has no
way to use it inside MikoshiTracker.

**Design.**
- New endpoint `POST /api/skills/run` accepts `{ skillSlug, input }` where
  `input` matches the skill's stdin contract. The tracker spawns the skill
  via the existing Mikoshi worker (`@mikoshi/skill-runner`), waits for
  stdout, returns the proposal (`{ action: "auto_posted" | "pending_confirmation", … }`).
- `ProposalDialog` grows tabs: **Manual** (current) · **Photo** · **Text**.
  Photo/Text submit to `/api/skills/run`. When `pending_confirmation` is
  returned, the dialog renders an editable preview the user can accept,
  edit, or cancel — confirmation is in-browser, not WhatsApp.
- Manual stays unchanged and remains the default tab. Photo/Text are gated
  behind a feature flag `web.skill_run` (default off) so failures don't
  block manual entry.

### G-FOOD-3 — No "log similar to yesterday" affordance (task 64)

The skill's Tier 2 (similar event from last 30 days) is invisible to web
users.

**Design.**
- `food-page.tsx` adds a "Repeats" section under the day totals: top 5
  meals by frequency in the last 30 days. Each row has a "Log again" button
  that POSTs a new event copying the historical payload (with today's
  `occurredAt`), source `similar_to_event`, confidence 1.0.
- Backed by a new `GET /api/aggregations?entryTypeSlug=food_meal&groupBy=
  none&groupByPayload=name&fields=kcal&include=count&limit=5&from=<-30d>`.
  The aggregations engine needs to support `groupByPayload` (group by a
  payload JSON field) — small extension, documented in this task.

### G-ENG-1 — `groupByPayload` aggregation primitive (task 65)

Two upcoming features (G-FOOD-3 above; repeated-meals on insights page)
need to group `EntryEvent` rows by a payload field. The engine currently
groups only by date bucket.

**Design.**
- `AggregationFilters` adds `groupByPayload?: string` (validated against the
  regex `^[a-zA-Z][a-zA-Z0-9_]*$`).
- Repository uses `json_extract(payload, '$.<field>')` as a `GROUP BY` key;
  the existing `kcal_cached` covering index does not apply here so the query
  is bounded by an explicit `LIMIT` parameter.
- `AggregationBucket.key` becomes a discriminated union: `{ kind: "date",
  value: "2026-05-23" }` | `{ kind: "payload", field: "name", value: "oatmeal" }`. Existing callers stay on `kind: "date"` by default.

### G-FOOD-4 — Edit history shows raw JSON, not a diff (task 66)

`food-detail-page.tsx` audit trail prints each `EventMutation.nextPayload`
as JSON. A user editing kcal from 480 to 500 sees the whole payload, not
"kcal: 480 → 500".

**Design.**
- New helper `diffPayload(previous, next)` returns `{ field, before, after }[]`
  for primitives, deep-equal-skip for unchanged keys.
- `food-detail-page.tsx` replaces the raw JSON block with a diff list per
  mutation row. `CREATE` shows fields with `before: undefined`; `DELETE`
  shows `after: undefined`; `UNDO` shows the reverse of the mutation it
  cancels.
- i18n strings under `food.detail.audit.diff.*`.

### G-FOOD-5 — Insights page has no totals/macros chart (task 67)

`food-insights-page.tsx` shows kcal heatmap + repeated meals + missing
days. Macro distribution (protein / carbs / fat as % of total kcal) and
trend lines (kcal/day over the range) are absent — both are derivable from
`/api/aggregations` already.

**Design.**
- `MacroPie` component: SVG donut with protein/carb/fat slices, totals
  computed client-side from the existing range data.
- `KcalTrend` component: simple inline SVG line chart, one point per day,
  using the same range data. No new dependency.
- Both render below the existing summary facts. Empty state is a single
  line: "Log a meal to see your distribution".

### G-DASH-3 — Today panel doesn't reach across food + habits (task 68)

The dashboard has two separate sections ("Today" for habits,
"Hoy en comida" for food). A user who wants to know "what's left for me
today" reads them in different mental modes.

**Design.**
- New `TodayUnifiedStrip` above both: one row per still-open habit ("Walk —
  pending"), one row showing food kcal vs. target if the user has set one
  ("kcal: 1820 / 2200"). Each row has a single primary action: check off
  habit, log meal.
- The target for food is a new field on the user's `food_meal` Entry
  config: `dailyKcalTarget?: number`. Migration via additive payload schema
  update.
- Existing `TodayDashboard` and `FoodTodayPanel` stay; the strip is a new
  summary layer.

### G-SKILL-1 — No visibility into skill state from the tracker (task 69)

The user has no way to know whether the Mikoshi skill is connected,
healthy, or what its last run did.

**Design.**
- New page `/settings/skills` lists `EntryType`s that have `skillSlug` set
  and, for each, queries the Mikoshi skill runner (`GET /skills/:slug/health`)
  for: enrolment status, last successful run timestamp, last error.
- The page is read-only; configuration of skill secrets stays in Mikoshi.
- Settings entry under user menu (existing API-access page is the sibling).

### G-MCP-1 — MCP tools lack a "food-log-from-text" convenience (task 70)

The existing generic tools require composing `entries.list` + `events.create`
manually. Agents calling the tracker (Claude, OpenClaw) need a one-shot tool
that mirrors the skill's `food_log_from_input` so they can call the tracker
end-to-end without bouncing through Mikoshi.

**Design.**
- `packages/mcp/src/tools/food.ts` adds `food_log_text({ text })` and
  `food_log_image({ imageBase64 })` that internally POST to
  `/api/skills/run` (depends on G-FOOD-2 / task 63).
- Both register in `catalog.ts` under the existing inventory pattern.
- `verify:openclaw` must continue passing with no plugin changes.

### G-DOC-1 — Recipe for adding a new EntryType isn't documented (task 71)

The whole engine was built so adding a new type is a one-row insert. But
the *workflow* (where to insert, how to seed, what to wire up in the web)
is implicit. Future contributors (including me) re-derive it each time.

**Design.**
- New doc `docs/architecture/adding-an-entry-type.md` walks through adding
  a hypothetical `weight_log` type end-to-end: migration seed, payload
  schema, aggregations spec, optional skill, optional dedicated web page,
  default generic-entries rendering.
- Cross-link from `generic-entries.md` and `GOAL.md` §G9.1.

### G-ACCEPT-1 — Phase 13 verification + halt (task 72)

Final task: full matrix pass + new screenshots + Phase-13 halt marker.
Mirrors task 58.

## Out of scope (deferred to a future phase)

- **Barcode scanning.** Requires a barcode library + product database
  integration. Distinct feature; revisit after Phase 13 lands.
- **Per-meal photo cropping / OCR fine-tune.** Lives in the Mikoshi skill;
  improvements there don't require tracker changes.
- **Sharing food in circles.** `CircleEntryShare` exists in the schema but
  no UI; food-in-circles is a separate phase.
- **Weight / measurements / mood / workout entry types.** Engine supports
  them, but each is its own product surface.

## Invariants preserved by Phase 13

All §G9.1 invariants continue to hold:

- No new tables or services per type — the only new endpoint
  (`/api/attachments/event`, `/api/skills/run`) is type-agnostic.
- `payloadSchema` for `food_meal` gains optional fields only.
- Skills remain unloaded by the tracker; `/api/skills/run` delegates to the
  Mikoshi worker via the existing IPC surface.
- All stats keep deriving from `EntryEvent.payload` via the aggregations
  engine; `groupByPayload` is a parameter extension, not a new code path.
- Every write still goes through `events.service.persistEvent(...)`.
