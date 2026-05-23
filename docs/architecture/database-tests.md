# Database Test Audit

This document catalogues every test file that interacts with the database,
either directly (Prisma client calls) or indirectly (HTTP injection through
the Fastify app). Its purpose is to establish a clear baseline for evaluating
the effort and risk of a future ORM migration (e.g. Prisma → Drizzle).

---

## Test Infrastructure

All API tests share a single infrastructure defined in
`apps/api/test/helpers/`:

### `global-setup.ts`

Runs **once per `vitest` invocation** (in the main process before any worker
forks). Calls `prisma db push` via the local binary to materialise the schema
into a RAM-backed SQLite template file (`/dev/shm/mikoshi-tracker-test-template-<pid>-<ts>.db`).
Every subsequent `createTestContext()` call copies this file instead of
re-running the Prisma CLI — cutting setup from ~56 spawns to 1.

**ORM migration impact**: this is the single most important file to update.
Replace `prisma db push` with the Drizzle equivalent
(`drizzle-kit push` or `drizzle-kit migrate`) against the same template path.
No other test file spawns the Prisma CLI.

### `test-db.ts`

Resolves the template path and the `TEST_DB_DIR` (`/dev/shm` on Linux,
`tmpdir()` on macOS). Pure path logic — no ORM calls. Zero changes needed for
Drizzle.

### `app.ts` — `createTestContext()`

Copies the template DB, instantiates the Fastify app with an isolated
`DATABASE_URL`, and exposes a `cleanup()` function. The app boots with a real
Prisma client connected to the copied DB.

**ORM migration impact**: when Drizzle replaces Prisma, the Fastify app
factory (`createApp`) will initialise a Drizzle client instead. `createTestContext`
itself changes nothing — it only passes `DATABASE_URL`; the ORM client lives
inside `createApp`.

### `helpers/habits.ts` — `seedHabitDayStates()`

Factory that inserts `Entry` + `EntryEvent` rows directly via
`context.app.db` (Prisma client). Used by 6 stats test files.

**ORM migration impact**: rewrite the factory to use the Drizzle `db` client.
The logic is straightforward — simple inserts with explicit IDs and timestamps.

---

## Test Files — Direct Prisma Access

These 8 files call `context.app.db.<model>.<method>()` or use `seedHabitDayStates()`.

| File | What it tests | Direct Prisma usage |
|---|---|---|
| `habits/habit-persistence.test.ts` | Habit creation, archiving, restore | `createHabit()` service call + `db.entry.findUniqueOrThrow()`, `db.entryEvent.findFirstOrThrow()` |
| `habits/habit-management.test.ts` | Habit CRUD, frequency changes | same pattern as above |
| `stats/overview-routes.test.ts` | `/api/stats/overview` shape | `seedHabitDayStates()` |
| `stats/overview-summary.test.ts` | Metric aggregation correctness | `seedHabitDayStates()` |
| `stats/overview-trends.test.ts` | 7-day / 30-day trend arrays | `seedHabitDayStates()` |
| `stats/habit-trends.test.ts` | Per-habit trend detail | `seedHabitDayStates()` |
| `stats/stats-consistency.test.ts` | Cross-endpoint consistency | `seedHabitDayStates()` + direct entry updates |
| `stats/stability-ranking.test.ts` | Ranking algorithm | `seedHabitDayStates()` |

**Migration effort for these 8 files**: update `seedHabitDayStates()` once;
the direct `db.*` assertions in the 2 habits files need their Prisma
method names translated to the Drizzle equivalents (`.findUniqueOrThrow()` →
`db.select().from(entries).where(eq(entries.id, ...)).limit(1)` or the Drizzle
relational API `db.query.entries.findFirst(...)`).

---

## Test Files — HTTP API Only (no direct ORM access)

These 57 files test exclusively through `context.app.inject()`. They will
need **zero changes** for an ORM migration, because they interact with
the HTTP surface, not the database layer.

### `auth/` (4 files)
- `sign-up.test.ts`, `sign-in.test.ts`, `sign-out.test.ts`,
  `api-token-auth.test.ts`

### `entries/` (6 files)
- `entries-crud.test.ts`, `entries-list.test.ts`, `entries-schema.test.ts`,
  `entries-pagination.test.ts`, `entries-filter.test.ts`,
  `entries-user-scoping.test.ts`

### `events/` (5 files)
- `events-crud.test.ts`, `events-list.test.ts`, `events-audit.test.ts`,
  `events-validation.test.ts`, `events-user-scoping.test.ts`

### `entry-types/` (3 files)
- `seed.test.ts` (asserts seed output via API), `entry-types-list.test.ts`,
  `entry-types-schema.test.ts`

### `aggregations/` (4 files)
- `food-aggregations.test.ts`, `weight-aggregations.test.ts`,
  `aggregation-groupby.test.ts`, `aggregation-scoping.test.ts`

### `checkins/` (3 files)
- `checkin-create.test.ts`, `checkin-undo.test.ts`, `checkin-validation.test.ts`

### `habits/` (excluding the 2 direct-Prisma files above) (3 files)
- `habit-routes.test.ts`, `habit-frequency.test.ts`, `habit-today.test.ts`

### `today/` (4 files)
- `today-list.test.ts`, `today-complete.test.ts`, `today-undo.test.ts`,
  `today-stats.test.ts`

### `circles/` (3 files)
- `circles-crud.test.ts`, `circles-membership.test.ts`,
  `circles-permissions.test.ts`

### `attachments/` (2 files)
- `attachment-upload.test.ts`, `attachment-delete.test.ts`

### `skills/` (2 files)
- `skills-list.test.ts`, `skills-invoke.test.ts`

### `admin/` (2 files)
- `admin-provision.test.ts`, `admin-settings.test.ts`

### `docs/` (1 file)
- `openapi.test.ts` — validates OpenAPI spec shape

### `shared/` (2 files)
- `pagination.test.ts`, `error-responses.test.ts`

### `performance/` (2 files)
- `response-times.test.ts`, `concurrent-users.test.ts`

### `migration/` (1 file)
- `drop-legacy.test.ts` — reads migration SQL files, no runtime DB access

### `deployment/` (1 file)
- `env-derivation.test.ts` — environment parsing, no DB access

---

## Summary

| Category | Files | Changes for Drizzle |
|---|---|---|
| Test infrastructure | 4 helpers | `global-setup.ts` (1 call to update); `app.ts` (zero — passes URL only) |
| Direct Prisma access | 8 files | `seedHabitDayStates()` factory (1 rewrite); 2 habits files (query translation) |
| HTTP API only | 57 files | **Zero changes** |
| **Total** | **65 + 4 helpers** | **~3–4 files meaningfully affected** |

The HTTP-only majority means a Prisma → Drizzle migration carries very low
test-layer risk. The 57 untouched files continue to validate the full API
surface after the migration without modification.

---

## Service Layer (not tests, but relevant)

The real migration effort is in `apps/api/src/modules/`. Every service file
that calls `this.db.<model>.<method>()` needs its queries translated to
Drizzle's API. A quick count:

```
apps/api/src/modules/
  auth/           — better-auth manages its own schema; uses the Drizzle adapter
  entries/        — ~6 service methods
  events/         — ~8 service methods
  aggregations/   — ~4 service methods (raw SQL via json_extract)
  habits/         — ~10 service methods
  stats/          — ~6 service methods
  checkins/       — ~3 service methods
  circles/        — ~4 service methods
  skills/         — ~2 service methods
  admin/          — ~2 service methods
  entry-types/    — seed upsert (1 complex method)
```

Estimated rewrite: ~50 queries total. Many are simple CRUD — the complexity
concentrates in stats aggregations and the habit-day-state queries. Those
already use raw SQLite expressions that map cleanly to Drizzle's `sql``
template tag.

---

## Migration Prerequisites

Before switching the ORM:

1. **Baseline migration**: export the current schema as a Drizzle schema file
   (`schema.ts`). Use `drizzle-kit introspect` against the production DB to
   generate it automatically.

2. **Migration files**: replace `prisma/migrations/` with
   `drizzle/migrations/`. Run `drizzle-kit generate` to produce the initial
   snapshot, then mark the current DB state as baseline so no destructive
   migration runs on first deploy.

3. **`better-auth` adapter**: switch from `@prisma/adapter` to
   `@better-auth/drizzle-adapter` (official, maintained by the better-auth
   team). The session/account/user tables are identical — no data migration
   needed.

4. **Update `global-setup.ts`**: replace `prisma db push` with
   `drizzle-kit push` (development) or `drizzle-kit migrate` (CI/production).

---

## Related

- `docs/architecture/deployment-native.md`
- `docs/architecture/bun-migration.md`
- `docs/architecture/generic-entries.md` — entry/event schema design
