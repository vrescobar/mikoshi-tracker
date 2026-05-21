# PLAN — Generic Entries Architecture + food_meal as first non-habit type

> **Status: target, not current state.** This plan refactors MikoshiTracker
> from "habit tracker" to "generic typed-entries tracker" and adds `food_meal`
> as the first non-habit `EntryType`. Phase 11 (external provisioning for
> bot-operated circles) is **complete**; its self-contained spec is preserved
> in `GOAL.md` §C17 and its task history lives in `.ralphloop/progress.md`.
>
> The full architecture spec for this plan is `GOAL.md` → "Generic Entries
> Architecture" (§G1–§G9 added by this refactor). The phased checklist that
> implements it is `.ralphloop/tasks.md` → tasks **32–58**.

## Context

MikoshiTracker today models a single domain: `Habit` + `HabitDayState` +
`CheckInMutation`. The semantics are nailed to "one unit per day with a
boolean or numeric target". That covers habits but not rich event logs like
meals, weights, expenses, sleep or workouts.

This plan **separates the storage + audit engine from the concrete domain**.
Any new domain (food, weight, money, mood, workout) becomes an `EntryType`
declared with a slug, a JSON-Schema-validated payload, a cadence
(`recurring` vs `event_log`), an aggregations descriptor, and optionally a
pointer to a Mikoshi skill that owns natural-language ingestion. `food_meal`
is the first non-habit type and the case that proves the abstraction works.

Crucially: **all AI/vision/web-search/confidence/confirmation logic lives in
the skill, not in MikoshiTracker.** MikoshiTracker only validates payloads
against the registered schema and persists. The skill (in the separate
`mikoshi` repo at `/home/victor/projects/mikoshi/skills/mikoshi-tracker-food/`)
runs the tier pipeline and only POSTs to MikoshiTracker once it has complete,
validated data.

## Non-negotiable invariants

1. **Immutable audit trail.** Editing or deleting an event creates an
   `EventMutation`; never delete history rows. Undo replays history.
2. **User timezone** rules every `dateKey` and aggregation grouping.
3. **Existing auth boundaries** (session, personal token, circle token, admin
   key) remain intact; the §C14 denial matrix continues to pass.
4. **`/api/habits/*` and `/api/today/*` keep working** as thin aliases on the
   new engine for at least one release. `@mikoshi-tracker/mcp` and the
   OpenClaw plugin must not regress.
5. **No domain logic in the app.** New types are added by inserting an
   `EntryType` row + (optionally) shipping a skill. No new tables per type,
   no per-type business rules in services.

## What gets built

### G1 — Schema (`prisma/schema.prisma`)

Five new tables (`EntryType`, `Entry`, `EntryWeekday`, `EntryEvent`,
`EventMutation`) plus rename of `CircleHabitShare` → `CircleEntryShare`. See
`GOAL.md` §G1 for the exact Prisma definitions.

### G2 — Seed of three built-in `EntryType`s

`habit_boolean`, `habit_quantity`, `food_meal`. Inserted by a seed script
that runs inside the same migration that creates the tables. See `GOAL.md`
§G2 for the full payload/config schemas and aggregations specs.

### G3 — Schema cache (`apps/api/src/modules/entry-types/schema-cache.ts`)

A minimal JSON-Schema → Zod compiler with an in-memory cache keyed by
`entryTypeId`. Supports `type`, `enum`, `required`, `properties`, `minimum`,
`maximum`, `minLength`, `nullable`, and strict mode (extra fields rejected).
No external library; the surface stays controlled. See `GOAL.md` §G3.

### G4 — Generic API surface

- `GET /api/entry-types`, `GET /api/entry-types/:slug` — read-only catalog.
- `GET/POST /api/entries`, `GET/PATCH /api/entries/:id`,
  `POST /api/entries/:id/archive|restore` — entry CRUD; `config` validated
  against `EntryType.configSchema`.
- `POST /api/entries/:id/events`, `GET /api/events`,
  `GET/PATCH/DELETE /api/events/:eventId`, `POST /api/events/:eventId/undo`
  — event CRUD; `payload` validated against `EntryType.payloadSchema`. Every
  write creates an `EventMutation`.
- `GET /api/aggregations` — declarative aggregation engine parameterised by
  the EntryType's `aggregations` spec (sum/avg/count/completion_rate/streak/
  missing_days over day/week/month windows). See `GOAL.md` §G4.

### G5 — `food_meal` end-to-end

The payload (`name`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g?`,
`sugar_g?`, `portion_g?`, `mealSlot?`, `source`, `confidence`,
`similarToEventId?`, `sources?`, `notes?`) and the canonical aggregations
(daily/weekly sums, count, missing days) are defined in `GOAL.md` §G5. The
**app does not interpret `confidence` or `source`** — they are persisted
metadata only.

### G6 — Skill `mikoshi-tracker-food` (in repo `mikoshi`)

Lives entirely outside this repo. Implements the four-tier pipeline (label
OCR → similar-to-recent-event → web lookup via Brave → vision-only) plus the
WhatsApp confirmation flow when `confidence < 0.85`. The skill is the **only
caller** that decides what payload to POST; MikoshiTracker just validates.
See `GOAL.md` §G6.

### G7 — Web

`apps/web/app/(app)/food/` (timeline, event detail with editable payload and
audit trail, insights page with range picker + heatmap + missing days +
repeated meals). `apps/web/app/(app)/habits/` becomes a redirect to
`/entries?entryTypeSlug=habit_*` with a renderer-by-slug dispatch in a new
`EventCard`. Dashboard adds a "Hoy en comida" panel. Full EN/ZH/ES i18n. See
`GOAL.md` §G7.

### G8 — MCP and OpenClaw

New tools `entries_*`, `events_*`, `aggregations_*`, `entry_types_*` in
`packages/mcp/src/tools/` and auto-registered in OpenClaw via the existing
catalogue. Legacy `habits_*` / `today_*` tools stay as aliases over the new
engine. See `GOAL.md` §G8.

### G9 — Migration of legacy `Habit` data

A two-step migration: first add the new tables and backfill from `Habit`,
`HabitWeekday`, `HabitDayState`, `CheckInMutation`, `CircleHabitShare` into
their generic counterparts (legacy tables renamed `_legacy_*`, not dropped),
then in a follow-up migration drop the legacy tables once stability is
confirmed. See `GOAL.md` §G9.

## What does NOT change

- Phase 11 work (external provisioning via `/api/admin/*`): unchanged.
- Circles auth + denial matrix §C14: unchanged in behaviour (only renamed
  from `habitId` to `entryId` internally, with a body-shape alias).
- Personal-token flow and session auth: unchanged.
- `@mikoshi-tracker/mcp` package: unchanged behaviour; new tools added but
  legacy tool surface preserved exactly.

## Files

`prisma/schema.prisma`, `prisma/migrations/<ts>_add_generic_entries/`,
`apps/api/src/modules/entry-types/` (new), `apps/api/src/modules/entries/`
(new, replaces `habits/` once aliases settle),
`apps/api/src/modules/events/` (new),
`apps/api/src/modules/aggregations/` (new),
`apps/api/src/modules/admin/` (unchanged),
`apps/api/src/modules/circles/` (rename habitId→entryId in service/repo),
`packages/contracts/src/{entries,events,entry-types,aggregations}.ts`,
`packages/mcp/src/tools/{entries,events,aggregations,entry-types}.ts`,
`apps/web/app/(app)/{entries,food}/`, `apps/web/components/{events,food}/`,
`apps/web/messages/{en,zh,es}.json`.

External: `/home/victor/projects/mikoshi/skills/mikoshi-tracker-food/`
(SKILL.md + run.ts + lib/).

## Verification

- `pnpm prisma migrate dev` clean; `pnpm -r build` + workspace typecheck +
  `pnpm -r lint` green after Prisma regen.
- `pnpm --filter @mikoshi-tracker/api test` green, including the new
  entries/events/aggregations suites AND the unchanged §C14 circle-token
  denial matrix AND the new legacy-alias tests.
- `pnpm test:e2e` green, including `tests/food-flow.spec.ts` (upload photo
  → create event → edit → insights → delete → audit trail) and
  `tests/regressions/habit-flow.spec.ts`.
- `pnpm verify:openclaw` green — plugin behaviour unchanged.
- End-to-end manual on Mikoshi: photo of a nutrition label registers without
  confirmation (tier `label`); photo of a repeated meal detects
  `similar_to_event`; photo of a novel dish triggers tier `web_lookup` with
  confirmation; pure text triggers `web_lookup` or `vision_only` with
  confirmation. Edit and delete from the web preserve audit trail.

## Stop marker

The whole tracker roadmap halts on `TRACKER_COMPLETE` (configured in
`.ralphloop/config.yaml`), written **only** by the final task (task 58) once
the verification matrix above is fully green. No per-phase early stops.
