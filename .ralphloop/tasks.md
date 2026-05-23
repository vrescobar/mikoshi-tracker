# tasks

Ordered checklist. Ralphloop picks the first `[ ]` task each iteration. Mark
done with `[x]`; blocked tasks the loop gives up on are marked `[!]`.

Feature: **Habit Circles** — the collaboration / social layer. The full,
self-contained spec is `GOAL.md` → "Collaboration — Habit Circles"; each task
cites the `§C…` subsection it implements. Do not duplicate check-in mutation
logic; reuse `apps/api/src/modules/checkins/checkin.service.ts`. Do not regress
the single-user flow or `@mikoshi-tracker/mcp`.

## Phase 12 — Generic entries architecture + food_meal as first non-habit type

Refactor MikoshiTracker from "habit tracker" to "generic typed-entries
tracker": Habit becomes a special case of a typed `Entry` whose
`EntryType.payloadSchema` is `{ completed }` or `{ value, completed }`.
`food_meal` is the first non-habit `EntryType`. **All AI/vision/OCR/
web-search/confidence/confirmation logic lives in the skill
`mikoshi-tracker-food` in repo `mikoshi` — never in MikoshiTracker.** The
API only validates payloads against the registered JSON Schema and persists.
Full spec: `GOAL.md` → "Generic Entries Architecture" (§G0–§G9.1). High-level
plan: `PLAN.md`. Do not regress Circles (§C14), Phase 11 admin endpoints,
`@mikoshi-tracker/mcp`, or the single-user flow. The whole tracker halts on
`TRACKER_COMPLETE` (written by task 58 only, not on phase boundaries).

- [x] **32** Finish attachments WIP — close the in-progress attachments
      feature (commit 68eefeb). Wire the gallery component in
      `apps/web/app/(app)/habits/[habitId]/` to render attachments returned
      by `GET /api/attachments?mutationId=...`. Document the attachment
      routes (`POST /api/attachments`, `POST /api/attachments/base64`,
      `GET /api/attachments`, `GET /api/attachments/:id/file`,
      `DELETE /api/attachments/:id`) in `apps/api/src/plugins/openapi.ts`.
      Add one Playwright spec `tests/attachments-flow.spec.ts` that uploads a
      base64 image via the API and sees it on the habit detail page.
      Prerequisite for Phase 12 because food events carry photos via the
      same machinery.

- [x] **33** Generic Prisma schema — add `EntryType`, `Entry`, `EntryWeekday`,
      `EntryEvent`, `EventMutation`, `CircleEntryShare` to
      `prisma/schema.prisma` exactly as `GOAL.md` §G1. Keep `Habit`,
      `HabitWeekday`, `HabitDayState`, `CheckInMutation`, `CircleHabitShare`
      intact in this task (legacy data is backfilled in task 40, dropped in
      task 43). Run `pnpm prisma migrate dev --name add_generic_entries`.
      Regenerate the Prisma client. `apps/api` must build with zero errors.

- [x] **34** EntryType seed — create `apps/api/src/modules/entry-types/seed.ts`
      with the three built-in types (`habit_boolean`, `habit_quantity`,
      `food_meal`) defined in `GOAL.md` §G2. Run the seed inside the same
      `add_generic_entries` migration (raw SQL in `migration.sql`) or via
      `prisma db seed` invoked by the `migrate` container. Test
      `apps/api/test/entry-types/seed.test.ts` asserts the three slugs exist
      and their `payloadSchema` parses as valid JSON Schema.

- [x] **35** JSON Schema → Zod compiler — create
      `apps/api/src/modules/entry-types/json-schema-to-zod.ts` supporting
      the subset listed in `GOAL.md` §G3 (`type`, `enum`, `required`,
      `properties`, `items`, `minimum`, `maximum`, `minLength`, `nullable`,
      strict object mode). Create `apps/api/src/modules/entry-types/
      schema-cache.ts` with `getCompiledSchema(db, entryTypeId)` returning
      `{ payload, config, aggregations, cadence, skillSlug }` and
      `invalidateSchemaCache(entryTypeId?)`. Tests: valid payload passes,
      missing required field fails, wrong type fails, out-of-range fails,
      extra field fails (strict mode), invalidate works.

- [x] **36** Shared contracts — create `packages/contracts/src/entries.ts`,
      `events.ts`, `entry-types.ts`, `aggregations.ts` with the Zod shapes
      and TypeScript types for every endpoint in `GOAL.md` §G4. Wire them
      into `packages/contracts/package.json` exports. Static Zod here covers
      the envelope shape only; per-type payload validation is dynamic (done
      in the API via the schema cache from task 35).

- [x] **37** `entries/` module — create `apps/api/src/modules/entries/`
      following the existing CRSA pattern (`entry.schema.ts`,
      `entry.repository.ts`, `entry.service.ts`, `entry.controller.ts`,
      `entry.routes.ts`). Implement `GET/POST /api/entries`,
      `GET/PATCH /api/entries/:id`, `POST /api/entries/:id/archive`,
      `POST /api/entries/:id/restore`. Validate `config` against
      `EntryType.configSchema` via the schema cache. Tests:
      `apps/api/test/entries/entry-crud.test.ts` covers CRUD against all
      three built-in types.

- [x] **38** `events/` module — create `apps/api/src/modules/events/` with
      the same pattern. Implement `POST /api/entries/:id/events`,
      `GET /api/events`, `GET/PATCH/DELETE /api/events/:eventId`,
      `POST /api/events/:eventId/undo`. Validate `payload` against
      `EntryType.payloadSchema`. For `cadence: "recurring"`, upsert on
      `(entryId, dateKey)` so a habit_boolean POSTed twice the same day
      creates ONE event and TWO mutations. Every write creates an
      `EventMutation` through a single `events.service.persistEvent(...)`
      function — no bypass. Tests:
      `apps/api/test/events/{event-crud,recurring-uniqueness,event-log-multi,
      payload-validation}.test.ts`.

- [x] **39** Declarative aggregations engine — create
      `apps/api/src/modules/aggregations/` with a generic
      `runAggregation(spec, filter)` that emits SQL using `json_extract` on
      SQLite. Support the six aggregation kinds from `GOAL.md` §G4
      (`sum`, `avg`, `count`, `completion_rate`, `streak`, `missing_days`).
      Implement `GET /api/aggregations` with full filter surface
      (`entryTypeSlug`, `entryId`, `from`, `to`, `groupBy`, `fields`,
      `include`). Test
      `apps/api/test/aggregations/food-aggregations.test.ts` builds 14 days
      of varied food events and verifies daily sums, weekly count, weekly
      average, and missing_days for empty days.

- [x] **40** Backfill migration — second Prisma migration
      `backfill_habit_to_entry` that copies legacy data into the new
      tables (mapping per `GOAL.md` §G9 step 1). Rename `Habit` →
      `_legacy_Habit_<ts>`, `HabitWeekday` → `_legacy_HabitWeekday_<ts>`,
      `HabitDayState` → `_legacy_HabitDayState_<ts>`, `CheckInMutation` →
      `_legacy_CheckInMutation_<ts>`, `CircleHabitShare` →
      `_legacy_CircleHabitShare_<ts>`. **Do not drop**. Include a
      `verify_entry_backfill` step (idempotent asserts on row counts) that
      aborts on divergence. Test
      `apps/api/test/migration/backfill.test.ts` seeds the legacy schema
      with fixtures, runs the migration, asserts row counts and a sample of
      preserved IDs.

- [x] **41** Legacy aliases — rewrite `apps/api/src/modules/habits/` and
      `apps/api/src/modules/today/` as thin adapters over the new
      `entries/` + `events/` services. `GET /api/habits` →
      `GET /api/entries?entryTypeSlug=habit_boolean,habit_quantity`.
      `POST /api/habits` infers `entryTypeSlug` from body presence of
      `targetValue`. `POST /api/today/complete { habitId }` →
      `POST /api/entries/:habitId/events { payload: { completed: true } }`.
      `POST /api/today/set-total { habitId, total }` →
      `POST /api/entries/:habitId/events { payload: { value: total,
      completed: total >= target } }`. `POST /api/today/undo` →
      `POST /api/events/:eventId/undo` resolving the day's event. Tests:
      `apps/api/test/legacy/{habits-alias,today-alias}.test.ts` verify the
      external payload shape is identical to pre-refactor. `@mikoshi-tracker/mcp`
      and `@mikoshi-tracker/openclaw-plugin` tests must pass with zero changes
      to their code.

- [x] **42** Circles habitId → entryId — rename `CircleHabitShare` references
      in `apps/api/src/modules/circles/circle.service.ts`,
      `circle.repository.ts`, `circle.controller.ts`, and
      `circle.routes.ts` to use `entryId` internally. Accept `{ habitId }`
      bodies as backward-compat alias (map to `entryId` in the controller).
      Re-run the §C14 denial matrix
      (`apps/api/test/circles/circle-denial-matrix.test.ts`) — all 9 cases
      must pass unchanged in semantics.

- [x] **43** Drop legacy tables — third Prisma migration
      `drop_legacy_habit_tables` that removes `_legacy_Habit_*`,
      `_legacy_HabitWeekday_*`, `_legacy_HabitDayState_*`,
      `_legacy_CheckInMutation_*`, `_legacy_CircleHabitShare_*`. Also remove
      the models from `prisma/schema.prisma`. The API must start cleanly
      without them. Test verifies `pnpm prisma migrate deploy` + API boot
      succeed and no code references the removed models.

- [x] **44** Generic MCP tools — create
      `packages/mcp/src/tools/{entries,events,aggregations,entry-types}.ts`
      following the inventory pattern in `tools/catalog.ts`. Register them
      in `catalog.ts`. Keep `tools/habits.ts` and `tools/today.ts` as
      aliases delegating to the new engine endpoints. `@mikoshi-tracker/mcp`
      test suite must pass.

- [x] **45** OpenClaw plugin verification — confirm
      `packages/openclaw-plugin/src/register-tools.ts` picks up the new
      tools via the existing catalogue. Run `pnpm verify:openclaw` —
      must pass with no code changes to the plugin.

- [x] **46** Web — refactor habits to entries — rename
      `apps/web/app/(app)/habits/` page logic into
      `apps/web/app/(app)/entries/` with a per-`EntryType` renderer
      dispatch in a new `apps/web/components/events/EventCard.tsx` (chooses
      sub-component by `entryType.slug`). Keep `/habits/*` as a redirect to
      `/entries?entryTypeSlug=habit_boolean,habit_quantity`. Create
      `apps/web/components/entry-types/EntryTypeBadge.tsx`. Component tests
      cover dispatch + redirect.

- [x] **47** Web — `(app)/food/` section — create `apps/web/app/(app)/food/
      page.tsx` (chronological timeline of today),
      `apps/web/app/(app)/food/[eventId]/page.tsx` (rich detail: photo,
      inline-editable payload validated client-side against payloadSchema,
      audit trail of mutations, delete with confirmation),
      `apps/web/app/(app)/food/insights/page.tsx` (range picker, calendar
      heatmap of kcal/day, repeated meals grouped by normalised name, list
      of missing days). Components: `FoodEventCard`, `DayTotalsStrip`,
      `RangeHeatmap`. CSS Modules following the design system in
      `CLAUDE.md`.

- [x] **48** Web — dashboard "Hoy en comida" panel — add a panel to
      `apps/web/app/(app)/dashboard/page.tsx` consuming
      `GET /api/aggregations?entryTypeSlug=food_meal&from=<today>&to=<today>
      &groupBy=day&fields=kcal,protein_g,carbs_g,fat_g&include=count`.
      Place alongside the existing habits summary. Empty state when no food
      events today.

- [x] **49** Web — `ProposalDialog` manual entry — create
      `apps/web/components/ai/ProposalDialog.tsx` for the web's
      "+ Añadir comida" flow. V1 is **manual only**: user fills payload
      (name, kcal, macros), optionally uploads a photo via
      `POST /api/attachments/base64`, then POSTs to
      `/api/entries/:id/events` with `source: "manual"`. AI assistance from
      the web remains out of scope for V1; WhatsApp is the AI-driven path.

- [x] **50** i18n — add EN/ZH/ES translations for every new string
      introduced by tasks 36–49 to `apps/web/messages/{en,zh,es}.json`.
      Verify locale switching covers all new screens. The trilingual
      contract from §C13 extends here unchanged: no untranslated strings
      in any of the three locales.

- [x] **51** OpenAPI — update `apps/api/src/plugins/openapi.ts` to document
      `/api/entry-types`, `/api/entries`, `/api/events`, `/api/aggregations`.
      For `POST /api/entries/:id/events`, document the body as a `oneOf` of
      the registered `payloadSchema`s (resolved at startup from the seeded
      `EntryType` rows). Group operations into "Entries", "Events",
      "Aggregations", "EntryTypes" sections in `/api/docs`.

- [x] **52** E2E food flow — Playwright `tests/food-flow.spec.ts`:
      (1) sign up, (2) upload a base64 image via `/api/attachments/base64`,
      (3) POST a complete `food_meal` event referencing the attachment,
      (4) visit `/food` and see the timeline card, (5) edit kcal in
      `/food/[id]`, (6) visit `/food/insights?from=...&to=...` and see the
      heatmap, (7) delete the event, (8) confirm the audit trail shows
      `CREATE → UPDATE → DELETE`.

- [x] **53** E2E habit regression — Playwright
      `tests/regressions/habit-flow.spec.ts` covering the historical flow
      (sign up, create habit, today check-in, undo, view stats overview).
      Must pass against the post-refactor engine via the legacy aliases
      from task 41 — proves the rewrite did not regress the original
      product.

- [x] **54** Skill `mikoshi-tracker-food` in Mikoshi — this task edits the
      repo `/home/victor/projects/mikoshi`, **not** this one. Create
      `skills/mikoshi-tracker-food/` with `SKILL.md` (frontmatter per
      `GOAL.md` §G6, listing tools `food_log_from_input`,
      `food_query_range`, `food_edit_event`, `food_delete_event`),
      `run.ts` (stdin-JSON / stdout-JSON CLI), and `lib/` with `tiers.ts`,
      `api-client.ts`, `history.ts`, `vision.ts`, `ocr.ts`,
      `web-search.ts`, `confirm.ts`. Implement Tiers 0–4 + manual path,
      confirmation gate at `confidence < 0.85` with WhatsApp quick replies,
      payload validation client-side against the schema fetched from
      `GET /api/entry-types/food_meal`. Secrets:
      `mikoshi_tracker_personal_token`, `anthropic_api_key`,
      `brave_search_api_key` (optional).

- [x] **55** Skill tests — in repo `mikoshi`, add
      `skills/mikoshi-tracker-food/test/{tiers,payload-validation,
      confirm-flow}.test.ts` with mocks for Claude vision, Brave Search,
      and the MikoshiTracker API. Cover all six paths (tiers 0–4 +
      manual) and the confirmation gate.

- [x] **56** Documentation — update `README.md` to mention "generic
      typed-entries tracker with food_meal as first non-habit type".
      Create `docs/architecture/generic-entries.md` with diagrams of the
      engine, the schema cache, and the aggregation pipeline. Cross-link
      `GOAL.md` §G and `PLAN.md`.

- [x] **57** Performance hardening — generate a fixture of ~10k
      `EntryEvent` rows across two users and 200 days; run
      `EXPLAIN QUERY PLAN` on the hot aggregation queries; if
      `json_extract(payload, '$.kcal')` is on the hot path, add a SQLite
      generated column `EntryEvent.kcal_cached AS json_extract(payload,
      '$.kcal') STORED` + index, and update the aggregation engine to use
      it for `food_meal`. Document the decision in
      `docs/architecture/performance.md`. If queries are already fast
      enough, document that finding and skip the column.

- [x] **58** Tracker acceptance + halt — run the full verification matrix:
      `pnpm prisma migrate deploy && pnpm -r build && pnpm -r lint &&
      pnpm --filter @mikoshi-tracker/api test && pnpm --filter
      @mikoshi-tracker/contracts test && pnpm --filter @mikoshi-tracker/mcp
      test && pnpm --filter @mikoshi-tracker/openclaw-plugin test &&
      pnpm test:e2e && pnpm verify:openclaw`. Manual end-to-end per
      `PLAN.md` "Verification" section: label photo → tier label, repeated
      photo → tier similar_to_event, novel dish → tier web_lookup with
      confirmation, pure text → tier web_lookup/vision_only with
      confirmation, edit + delete from web preserve audit trail, legacy
      `/api/habits/*` + `/api/today/*` still work. When **all** of the
      above is green, write the literal token `TRACKER_COMPLETE` **on a
      line by itself** at the bottom of `.ralphloop/progress.md`. Do not
      write the marker for any other reason.

## Phase 13 — Food tracking completion (UX, surfacing, skill bridge)

Phase 12 shipped the generic entries engine and the `food_meal` foundation
(schema, REST, web pages, dashboard panel, skill in Mikoshi). User feedback
on landing the dashboard: "I don't see food anywhere — where do I log it?".
Phase 13 closes the polish + surfacing + skill-bridge gaps so food is a
first-class part of the daily loop, not a back room. Full design spec:
`docs/architecture/food-tracking-gaps.md`. Do not regress Phase 11 (admin),
Phase 12 (engine), Circles (§C14), `@mikoshi-tracker/mcp`, or the legacy
`/api/habits/*` + `/api/today/*` aliases. The §G9.1 invariants hold: no new
tables or services per `EntryType`; no domain logic in the API; the single
write path remains `events.service.persistEvent(...)`. Phase 13's
acceptance task is **72**; only that task writes `TRACKER_COMPLETE`.

- [x] **59** Dashboard empty-state taxonomy includes food — extend
      `apps/web/app/(app)/dashboard/page.tsx:39` to compute
      `emptyState: "no-entries" | "habits-empty" | "archived-only" | null`.
      `"no-entries"` only when the user has zero entries of any type AND
      zero `EntryEvent`s today. `"habits-empty"` when active habits = 0
      but the user has food entries or events. `"archived-only"` keeps its
      meaning. Update `DashboardShell` (`apps/web/components/dashboard/
      dashboard-shell.tsx`) to render the matching panel for each state
      and always keep `FoodTodayPanel` visible. Add
      `copy.dashboard.emptyStates.noEntries` + `habitsEmpty` blocks to
      EN/ZH/ES `apps/web/lib/i18n/messages.ts`. Update
      `apps/web/tests/dashboard/dashboard-states.spec.ts` to cover the new
      states. Reference: `docs/architecture/food-tracking-gaps.md`
      §G-DASH-1.

- [x] **60** Dashboard quick-add for food — extend `FoodTodayPanel`
      (`apps/web/components/dashboard/food-today-panel.tsx`) to accept an
      `onQuickAdd?: () => void` prop; when set, render an inline `+` button
      next to the title. Create `apps/web/components/dashboard/
      dashboard-food-section.tsx` (client) that owns `ProposalDialog`
      state and renders panel + dialog together. Refactor `DashboardShell`
      to use it. After save, refresh the panel via Next.js router refresh
      (`router.refresh()`). Add `dashboard.foodToday.quickAdd` i18n keys
      (EN/ZH/ES). Update `food-today-panel.test.tsx`. Reference:
      §G-DASH-2.

- [x] **61** Photo attachments on food events — make `Attachment.mutationId`
      nullable in `prisma/schema.prisma` (migration
      `make_attachment_mutation_id_optional`) since `eventMutationId`
      already exists. Add `POST /api/attachments/event` accepting
      `{ eventId, fileBase64 | multipart }`; stores into `Attachment` with
      `eventMutationId` set to the event's latest `EventMutation`,
      `mutationId` null. Add `attachmentTargetSchema` discriminated union
      to `packages/contracts/src/attachments.ts`. Extend `ProposalDialog`
      with an optional file input that uploads after `createFoodEvent`
      resolves. Test in `apps/api/test/attachments/event-attachments.test.ts`
      (upload + list + delete) and assert `food-detail-page.tsx` renders
      the uploaded image in its gallery. Reference: §G-FOOD-1.

- [x] **62** Generic entries nav with type filter — change
      `apps/web/lib/navigation.ts:18` primary nav to:
      Dashboard · Entries · Food · Circles (remove the standalone
      "Habits" item; `/habits` keeps its redirect to `/entries?…`). Update
      labels in `messages.ts` (EN/ZH/ES) — `shell.navigation.habits` →
      `shell.navigation.entries`. Add `EntryTypeFilter` component to
      `apps/web/components/entries/entry-type-filter.tsx` (chip row sourced
      from `GET /api/entry-types`, active set persisted in
      `?entryTypeSlug=`). Wire it into `entries-page.tsx`. Update
      `EventCard.test.tsx` and add filter-component tests. Reference:
      §G-NAV-1.

- [x] **63** `POST /api/skills/run` bridge endpoint — add
      `apps/api/src/modules/skills/{skill.routes.ts,skill.controller.ts,
      skill.service.ts}` exposing `POST /api/skills/run { skillSlug, input }`.
      Spawns the Mikoshi skill via the existing skill-runner IPC
      (env-var `MIKOSHI_SKILL_RUNNER_URL` defaults to
      `http://localhost:7990`), forwards stdin, returns the skill's stdout
      JSON. Schema-validates `skillSlug` against `EntryType.skillSlug`
      values so only registered skills can be invoked. Per-user timeout
      30s. Add `skillRunInputSchema` / `skillRunResponseSchema` to
      `packages/contracts/src/skills.ts`. Document in `openapi.ts` under a
      new "Skills" section. Tests:
      `apps/api/test/skills/skill-run.test.ts` covering happy path
      (mocked runner), unknown slug (404), runner unreachable (503),
      timeout (504). Reference: §G-FOOD-2.

- [x] **64** Multi-tab `ProposalDialog` — extend
      `apps/web/components/ai/ProposalDialog.tsx` with three tabs:
      **Manual** (current), **Photo** (file input → base64 → POST to
      `/api/skills/run` with `skillSlug: "mikoshi-tracker-food"`),
      **Text** (textarea → same endpoint). Render skill response: when
      `action === "auto_posted"`, refresh and close; when
      `action === "pending_confirmation"`, render an editable preview the
      user accepts / edits / cancels (accept calls
      `POST /api/entries/:id/events` with the proposed payload). Gate the
      Photo / Text tabs behind `NEXT_PUBLIC_FEATURE_WEB_SKILL_RUN=1`
      (default off) so manual entry is never blocked. Add EN/ZH/ES strings
      under `food.dialog.tabs.*`. Update `ProposalDialog.test.tsx`.
      Reference: §G-FOOD-2.

- [x] **65** `groupByPayload` aggregation primitive — extend
      `packages/contracts/src/aggregations.ts` `AggregationFilters` with
      optional `groupByPayload?: string` (validated by
      `/^[a-zA-Z][a-zA-Z0-9_]*$/`). Update
      `apps/api/src/modules/aggregations/aggregation.repository.ts` to use
      `json_extract(payload, '$.<field>')` as the GROUP BY when set; bound
      the result with the existing `limit` filter. Change
      `AggregationBucket.key` to a discriminated union
      `{ kind: "date", value } | { kind: "payload", field, value }`;
      keep date-grouped responses backward compatible via the default
      `kind: "date"`. Document in OpenAPI. Tests:
      `apps/api/test/aggregations/groupby-payload.test.ts` covers food
      meals grouped by `name` with sums + counts + limit. Reference:
      §G-ENG-1.

- [x] **66** Audit-trail diff view — add
      `apps/web/lib/payload-diff.ts` with `diffPayload(previous, next)`
      returning `{ field, before, after }[]` (primitives only, deep-equal
      skip for unchanged). Replace the JSON block in
      `apps/web/components/food/food-detail-page.tsx` audit section with
      a diff list per mutation row. `CREATE` shows `before: undefined`;
      `DELETE` shows `after: undefined`; `UNDO` reverses its target's
      diff. Add EN/ZH/ES strings under `food.detail.audit.diff.*`. Unit
      tests in `apps/web/lib/__tests__/payload-diff.test.ts`. Reference:
      §G-FOOD-4.

- [x] **67** Insights macros + trend — add two new components to
      `apps/web/components/food/`: `MacroPie.tsx` (SVG donut showing
      protein/carb/fat as % of total kcal across the selected range) and
      `KcalTrend.tsx` (inline SVG line chart, one point per day). Both
      compute from the existing range aggregation response — no new API
      call. Render below the summary facts in `food-insights-page.tsx`.
      Empty state: one-line localised hint. Component tests for both. No
      new dependencies. Reference: §G-FOOD-5.

- [x] **68** Repeated meals "Log again" on food page — add a "Repeats"
      panel to `apps/web/components/food/food-page.tsx` under the
      `DayTotalsStrip`. Sourced from `GET /api/aggregations?
      entryTypeSlug=food_meal&groupByPayload=name&fields=kcal&
      include=count&limit=5&from=<-30d>&to=<today>` (depends on task 65).
      Each row has a "Log again" button that POSTs a new event copying
      the historical payload (latest by occurredAt for that name) with
      today's `occurredAt`, `source: "similar_to_event"`, confidence 1.0.
      Add EN/ZH/ES strings under `food.page.repeats.*`. Tests in
      `apps/web/components/food/__tests__/food-page-repeats.test.tsx`.
      Reference: §G-FOOD-3.

- [x] **69** Today unified strip + daily kcal target — extend the
      `food_meal` `EntryType.configSchema` to include optional
      `dailyKcalTarget: number?` (additive, no migration of existing
      `Entry.config`). Add `apps/web/components/dashboard/
      today-unified-strip.tsx` rendering one row per still-open habit
      ("Walk — pending") and a kcal row ("kcal: 1820 / 2200" with
      progress bar) when the user has set a target. Each row has a
      single primary action: check habit / open food quick-add. Render
      above `TodayDashboard` and `FoodTodayPanel`. Settings UI to set the
      target: small inline editor in `FoodTodayPanel` header gated by
      "Edit target" toggle. EN/ZH/ES strings. Tests for the new
      component. Reference: §G-DASH-3.

- [x] **70** Skills health page — create
      `apps/web/app/(app)/settings/page.tsx` and `settings/skills/page.tsx`
      (server pages). The skills page lists `EntryType`s with non-null
      `skillSlug` and, for each, queries
      `GET /api/skills/:slug/health` (proxy added to `skill.controller.ts`,
      depends on task 63 infrastructure). Shows enrolment status, last
      run timestamp, last error. Read-only; configuration of secrets
      remains in Mikoshi. Add settings entry to the user menu (sibling
      of `/api-access`). EN/ZH/ES strings. Tests: skill health endpoint
      contract test + page render test. Reference: §G-SKILL-1.

- [x] **71** MCP convenience tools for food via skill bridge — add
      `packages/mcp/src/tools/food.ts` with `food_log_text({ text })` and
      `food_log_image({ imageBase64 })` that POST to `/api/skills/run`
      with `skillSlug: "mikoshi-tracker-food"`. Register both in
      `catalog.ts` and `runtime.ts`. Update README tool table.
      `verify:openclaw` and `@mikoshi-tracker/mcp` test suites must pass
      with zero plugin changes. Reference: §G-MCP-1.

## Phase 14 — weight_log: second non-habit EntryType (recurring numeric)

`weight_log` validates that the generic engine works for a second non-habit
type without touching any engine code. Full recipe documented in
`docs/architecture/adding-an-entry-type.md`. The §G9.1 invariants hold: no
new tables, no new endpoints (beyond the standard generic surface), no
per-type logic in the engine.

- [x] **73** Seed `weight_log` EntryType in
      `apps/api/src/modules/entry-types/seed.ts`. Payload: `weight_kg:
      number ≥ 0` (required) + `notes: string?`. Config: `targetWeightKg:
      number ≥ 1?`. Aggregations: `{ metrics: ["avg","missing_days"],
      sumFields: ["weight_kg"], cachedColumns: {} }`. Cadence:
      `"event_log"`. `isBuiltIn: true`, `skillSlug: null`. Tests in
      `apps/api/test/entry-types/seed.test.ts`: assert slug present,
      payloadSchema validates weight_kg, idempotency. Reference: §G2.

- [x] **74** Contracts + i18n — `apps/web/lib/i18n/messages.ts`:
      add `entryType.weight_log` label (EN "Weight log" / ZH "体重记录" /
      ES "Registro de peso"). Add `apps/web/lib/i18n/weight.ts` with full
      EN/ZH/ES copy for the `/weight` surface (page title, empty state,
      entry fields, action labels, insights labels). No changes to
      `packages/contracts/` — payload schemas are dynamic.

- [x] **75** Aggregation test for weight_log — new
      `apps/api/test/aggregations/weight-aggregations.test.ts`. Fixture:
      one user, one weight_log entry, 30-day events (pesos 77–82 kg, some
      days missing). Verify: (1) `GET /api/aggregations?
      entryTypeSlug=weight_log&from&to&fields=weight_kg&include=avg`
      returns correct daily average; (2) `missing_days` counts gaps;
      (3) `groupBy=week` groups 4 weeks with their average.

- [x] **76** Web page `/weight` — server page
      `apps/web/app/(app)/weight/page.tsx` fetches weight entries + last-30d
      aggregations. Client component
      `apps/web/components/weight/weight-page.tsx`: table of recent weights
      + inline "Log weight" form (creates entry lazily on first submit then
      POSTs event). `apps/web/components/weight/weight-trend.tsx`: SVG line
      chart reusing the `KcalTrend` pattern. CSS Modules following the
      design system.

- [x] **77** Navigation + dashboard — `apps/web/lib/navigation.ts`: add
      `weight: "/weight"`. Do NOT add to primary nav (user reaches via
      `/entries` chip or dashboard panel). Add minimal `WeightTodayPanel`
      component to `dashboard-shell.tsx` (latest weight + "Log weight" →
      `/weight` link), visible only when the user has weight_log events.
      Update `dashboard-states.spec.ts` so the three existing branches
      still pass.

- [x] **78** Web unit tests — `apps/web/components/weight/__tests__/
      weight-page.test.tsx` (render, form submit, error paths),
      `weight-trend.test.tsx` (30 datapoints, empty state).

- [x] **79** E2E Playwright — `apps/web/tests/weight-flow.spec.ts`: sign
      up, visit `/weight` → empty state, POST weight event via UI, refresh →
      row + trend, visit `/entries` with chip "Weight log" → entry listed,
      edit event → audit trail shows UPDATE, delete event → audit trail
      shows DELETE.

- [x] **80** Documentation — `docs/architecture/adding-an-entry-type.md`:
      append note "Reference implementation: weight_log shipped in Phase 14
      — see commits task(73)..task(80)". `README.md`: add weight_log to
      built-in EntryTypes list. `GOAL.md` §G2: mention fourth type.

- [x] **81** Phase 14 acceptance + halt — same matrix as task 72.
      Smoke: `/weight` empty → log weight → row appears; `/entries?
      entryTypeSlug=weight_log` → entry listed; `/dashboard` →
      WeightTodayPanel with latest weight; edit + delete + audit trail.
      Replace `TRACKER_COMPLETE` in `.ralphloop/progress.md` with a fresh
      one. Reference: §G2, §G9.1.

- [x] **72** Phase 13 acceptance + halt — `pnpm prisma migrate deploy &&
      pnpm -r build && pnpm -r lint && pnpm typecheck && pnpm --filter
      @mikoshi-tracker/api test && pnpm --filter @mikoshi-tracker/contracts
      test && pnpm --filter @mikoshi-tracker/mcp test && pnpm --filter
      @mikoshi-tracker/openclaw-plugin test && pnpm test:e2e &&
      pnpm verify:openclaw`. Manual smoke pass per
      `docs/architecture/food-tracking-gaps.md`: open dashboard with zero
      habits → see food empty-state + panel + quick-add; click `+` →
      dialog opens inline; submit → totals refresh; visit `/food` → see
      Repeats and Log Again works; visit `/food/insights` → see MacroPie
      and KcalTrend; visit `/settings/skills` → see Mikoshi food skill
      listed; toggle `NEXT_PUBLIC_FEATURE_WEB_SKILL_RUN=1` and submit a
      photo → see pending-confirmation preview. Add the
      `docs/architecture/adding-an-entry-type.md` walkthrough (§G-DOC-1)
      as a sub-deliverable of this task — a one-page recipe using a
      hypothetical `weight_log` type, cross-linked from
      `generic-entries.md` and `GOAL.md` §G9.1. When **all** of the above
      is green, replace the existing `TRACKER_COMPLETE` line at the
      bottom of `.ralphloop/progress.md` (or append one if absent) with
      a fresh `TRACKER_COMPLETE` on a line by itself. Do not write the
      marker for any other reason.

## Phase 15 — Native deployment + Bun migration

- [x] **82** Native web service — implement `docs/architecture/deployment-native.md`.
      Create `scripts/self-host/mikoshi-tracker-api.service` and
      `scripts/self-host/mikoshi-tracker-web.service` (systemd unit templates).
      Create `scripts/deploy.sh` (build + migrate + restart in one command).
      Create `scripts/install-services.sh` (symlink units, daemon-reload, enable,
      start). Update `docker/caddy/Caddyfile`: `api:3001` → `127.0.0.1:3001`,
      `web:3000` → `127.0.0.1:3000`. Remove `web` and `api` services from
      `docker-compose.yml` (keep `proxy` + `migrate` as optional helpers for
      third-party deployments; the compose file stays valid). Update
      `scripts/self-host/check.sh` to verify the systemd units instead of
      container health. Do the first live cutover: build, migrate, enable units,
      stop old containers, verify the site responds on :8080. Do NOT remove
      `Dockerfile.web` or `Dockerfile.api` — they are kept for users who
      self-host via Docker/Podman.

- [x] **83** Bun migration — implement `docs/architecture/bun-migration.md`.
      Delete `pnpm-lock.yaml` and `pnpm-workspace.yaml`. Update root `package.json`:
      `packageManager` → `bun@1.x`, add `workspaces` array, rewrite all scripts
      replacing `pnpm --filter X` with `bun --filter X run`. Run `bun install`
      and verify `bun.lockb` is generated. Add `pnpm-lock.yaml` to `.gitignore`.
      Smoke: `bun run typecheck`, `bun --filter @mikoshi-tracker/api run test`,
      `bun --filter @mikoshi-tracker/web run test:unit`, `bun run lint`. Update
      `Dockerfile.web` and `Dockerfile.api` to use `oven/bun:1` as build base
      (runner stage stays `node:22-bookworm-slim`). Update `scripts/self-host/`
      shell scripts. Run the full E2E matrix before marking done.

- [x] **84** Phase 15 acceptance + halt — run the full test matrix (`bun run
      prisma:generate && bun --filter @mikoshi-tracker/api run build &&
      bun --filter @mikoshi-tracker/web run build && bun run lint &&
      bun run typecheck && bun --filter @mikoshi-tracker/api run test &&
      bun --filter @mikoshi-tracker/contracts run test &&
      bun --filter @mikoshi-tracker/mcp run test &&
      bun --filter @mikoshi-tracker/openclaw-plugin run test &&
      bun run test:e2e && bun run verify:openclaw`). Smoke: `curl
      localhost:8080/health` → 200; `curl localhost:8080/api/openapi.json` → 200;
      log in, log a weight entry, verify dashboard. Update `.ralphloop/progress.md`
      with a final `TRACKER_COMPLETE`.
