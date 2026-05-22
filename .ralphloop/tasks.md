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

- [!] **40** Backfill migration — second Prisma migration
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

- [!] **41** Legacy aliases — rewrite `apps/api/src/modules/habits/` and
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

- [!] **42** Circles habitId → entryId — rename `CircleHabitShare` references
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

- [ ] **56** Documentation — update `README.md` to mention "generic
      typed-entries tracker with food_meal as first non-habit type".
      Create `docs/architecture/generic-entries.md` with diagrams of the
      engine, the schema cache, and the aggregation pipeline. Cross-link
      `GOAL.md` §G and `PLAN.md`.

- [ ] **57** Performance hardening — generate a fixture of ~10k
      `EntryEvent` rows across two users and 200 days; run
      `EXPLAIN QUERY PLAN` on the hot aggregation queries; if
      `json_extract(payload, '$.kcal')` is on the hot path, add a SQLite
      generated column `EntryEvent.kcal_cached AS json_extract(payload,
      '$.kcal') STORED` + index, and update the aggregation engine to use
      it for `food_meal`. Document the decision in
      `docs/architecture/performance.md`. If queries are already fast
      enough, document that finding and skip the column.

- [ ] **58** Tracker acceptance + halt — run the full verification matrix:
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
