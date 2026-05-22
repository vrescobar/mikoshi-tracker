# Generic Entries Architecture

> This document describes the **generic typed-entries engine** introduced in
> Phase 12 of MikoshiTracker's development. For the authoritative specification
> see [`GOAL.md` §G0–§G9.1](../../GOAL.md). For the phased implementation plan
> see [`PLAN.md`](../../PLAN.md). The task checklist is
> [`.ralphloop/tasks.md`](../../.ralphloop/tasks.md) tasks 32–58.

## Overview

MikoshiTracker evolved from a habit tracker to a **generic typed-entries
tracker**. Habits are no longer the only domain; any data the user wants to
record over time is modelled as an `EntryType` with:

- a **slug** (`habit_boolean`, `habit_quantity`, `food_meal`, …)
- a **cadence** — `recurring` (one event per day, e.g. a habit) or
  `event_log` (many events per day, e.g. meals)
- a **payload JSON Schema** — validated at every write; defines what the event
  stores
- a **config JSON Schema** — validated at entry creation; defines per-entry
  settings (frequency type, target value, etc.)
- an **aggregations spec** — declarative descriptor of what sums/streaks/rates
  the engine should compute
- an optional **`skillSlug`** — pointer to the Mikoshi skill responsible for
  AI-driven ingestion

`food_meal` is the first non-habit entry type and the case that proves the
abstraction. Adding a new type requires only inserting an `EntryType` row and
(optionally) shipping a Mikoshi skill — no new tables, services, or endpoints.

## Data model

```
EntryType           Entry               EntryEvent          EventMutation
──────────          ──────              ──────────          ─────────────
slug                entryTypeId ──────▶ entryId ──────────▶ entryId
cadence             userId              userId              eventId (nullable)
payloadSchema       name                occurredAt          userId
configSchema        config (JSON)       dateKey             dateKey
aggregations        isActive            payload (JSON)      type (CREATE/UPDATE/DELETE/UNDO)
skillSlug           startDate           value               source (WEB/AI/SYSTEM/CIRCLE)
isBuiltIn                               completed           previousPayload
                    EntryWeekday        createdAt           nextPayload
                    ────────────                            note
                    entryId                                 attachments ──▶ Attachment
                    day
```

- `EntryEvent.payload` is the raw JSON blob; structure is enforced by the
  schema cache at write time but stored as a string.
- `value` and `completed` are numeric/boolean projections kept for efficient
  SQL queries on recurring types; `null` on `event_log` events.
- `EventMutation` is **immutable** — undo works by replaying history, never by
  deleting rows. See [`GOAL.md` §G9.1](../../GOAL.md) invariant rules.

Full Prisma definitions: [`GOAL.md` §G1](../../GOAL.md).

## Engine layers

```
HTTP request
     │
     ▼
┌────────────────────────────────────────────────────┐
│  Controller (entry.controller.ts / event.controller.ts)
│  • Parse path + query params via contracts schemas  │
│  • Call service; map errors to HTTP status codes   │
└─────────────────────────┬──────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────┐
│  Service (entry.service.ts / event.service.ts)     │
│  • Ownership + authorization checks               │
│  • Calls schema cache to get compiled Zod schemas  │
│  • Validates config (entry create/update)          │
│  • Validates payload (event append/edit)           │
│  • Calls persistEvent() for every write            │
└──────────┬──────────────────────┬──────────────────┘
           │                      │
           ▼                      ▼
┌─────────────────┐    ┌──────────────────────────────┐
│  Schema cache   │    │  Repository (entry.repository │
│  (schema-cache) │    │  / event.repository)          │
│  • In-memory    │    │  • Prisma queries             │
│    Map<id,      │    │  • persistEvent() upserts     │
│    CompiledSchema>    │    EntryEvent and inserts     │
│  • Cache miss:  │    │    EventMutation atomically   │
│    fetch from DB│    └──────────────────────────────┘
│  • Compile JSON │
│    Schema → Zod │
│  • Invalidated  │
│    on type edit │
└─────────────────┘
```

## Schema cache

Source: `apps/api/src/modules/entry-types/schema-cache.ts`
Compiler: `apps/api/src/modules/entry-types/json-schema-to-zod.ts`

```
getCompiledSchema(db, entryTypeId)
         │
         ├── cache hit? ──yes──▶ return cached CompiledSchema
         │
         └── cache miss
                  │
                  ▼
         db.entryType.findUniqueOrThrow(entryTypeId)
                  │
                  ▼
         jsonSchemaToZod(payloadSchema)  ──▶ payload: ZodType
         jsonSchemaToZod(configSchema)   ──▶ config:  ZodType
         parseAggregationSpec(aggregations) ──▶ AggregationSpec
                  │
                  ▼
         cache.set(entryTypeId, { payload, config, aggregations, cadence, skillSlug })
                  │
                  ▼
         return CompiledSchema
```

Supported JSON Schema subset (deliberately small and auditable):

| Keyword | Notes |
|---|---|
| `type` | `string`, `number`, `integer`, `boolean`, `object`, `array` |
| `enum` | Maps to `z.enum()` |
| `required` | Object properties not in `required` become `.optional()` |
| `properties` | Recursively compiled |
| `items` | Array item schema |
| `minimum` / `maximum` | Numeric constraints |
| `minLength` | String constraint |
| `nullable: true` | Wraps compiled type with `.nullable()` |
| `additionalProperties: false` | Enables `.strict()` — extra fields rejected |

No external library. The supported subset is small so the schemas the app
accepts are predictable and auditable. See [`GOAL.md` §G3](../../GOAL.md).

## Aggregation pipeline

Source: `apps/api/src/modules/aggregations/`

```
GET /api/aggregations
  ?entryTypeSlug=food_meal
  &from=2026-05-01
  &to=2026-05-22
  &groupBy=day
  &fields=kcal,protein_g
  &include=missing_days,count

         │
         ▼
aggregation.service.ts
  1. Resolve EntryType by slug → 404 if not found
  2. getCompiledSchema() → AggregationSpec
  3. Filter requested fields against spec.sumFields
  4. generateExpectedBuckets(from, to, groupBy) → full date range
         │
         ▼
aggregation.repository.ts
  queryAggregationRows(entryId?, from, to, groupBy, fields)
  ──▶ $queryRawUnsafe (parameterised)

  SELECT
    strftime('%Y-%m-%d', occurredAt) AS bucket,   -- or %Y-W%W / %Y-%m
    SUM(json_extract(payload, '$.kcal'))  AS kcal,
    SUM(json_extract(payload, '$.protein_g')) AS protein_g,
    COUNT(*) AS count
  FROM EntryEvent
  WHERE entryId = ? AND dateKey BETWEEN ? AND ?
    AND NOT EXISTS (
      SELECT 1 FROM EventMutation
      WHERE eventId = EntryEvent.id
        AND type = 'DELETE'
        AND createdAt = (SELECT MAX(createdAt) FROM EventMutation WHERE eventId = EntryEvent.id)
    )
  GROUP BY bucket
         │
         ▼
aggregation.service.ts
  merge(expectedBuckets, queryRows)
  → missing buckets emitted as { count: 0, missing: true } when include=missing_days
  → weeklyAverage = total / numWeeks (when groupBy != "none" and range ≥ 7d)
         │
         ▼
AggregationResponse { buckets[], total, weeklyAverage }
```

Field names from `AggregationSpec.sumFields` are validated against
`/^[a-zA-Z][a-zA-Z0-9_]*$/` before SQL interpolation — no injection vector.

## Built-in entry types

See [`GOAL.md` §G2](../../GOAL.md) for the full seed schemas.

| Slug | Cadence | Purpose | Payload highlights |
|---|---|---|---|
| `habit_boolean` | `recurring` | Boolean daily habit | `{ completed: boolean }` |
| `habit_quantity` | `recurring` | Numeric daily habit | `{ value: number, completed: boolean }` |
| `food_meal` | `event_log` | Meal nutrition log | `{ name, kcal, protein_g, carbs_g, fat_g, source, confidence, … }` |

`isBuiltIn` rows cannot be deleted. Their `payloadSchema` is append-only
(adding optional fields is allowed; removing or retyping requires a versioned
migration that rewrites payloads).

## food_meal and the skill boundary

`food_meal` is the first non-habit type. The app:
- persists `source`, `confidence`, `similarToEventId`, `sources` as metadata
- **does not branch on them** — no tier logic, no OCR, no web search

All intelligence lives in the `mikoshi-tracker-food` skill in the Mikoshi repo
(`/home/victor/projects/mikoshi/skills/mikoshi-tracker-food/`). The skill runs
a four-tier pipeline (label OCR → similar-to-recent-event → web lookup → vision
estimation) and POSTs to `/api/entries/:id/events` only once it has a complete,
validated payload. See [`GOAL.md` §G6](../../GOAL.md) for the full pipeline spec.

The only coupling between the app and the skill is the `EntryType.skillSlug`
string — the app never loads or executes a skill.

## Legacy aliases

`/api/habits/*` and `/api/today/*` remain functional as thin adapters over the
new engine, preserving backward compatibility for MCP clients and external
integrations. See [`GOAL.md` §G8](../../GOAL.md) and [`PLAN.md`](../../PLAN.md).

## Invariants

1. **No domain logic in the API.** A new type is added by inserting an
   `EntryType` row + (if desired) shipping a skill. Never by adding a new
   table, service, or endpoint per type.
2. **`payloadSchema` is append-only on built-in types.** Removing or retyping
   requires a versioned migration.
3. **Skills are not loaded or executed by MikoshiTracker.** The only coupling is
   `EntryType.skillSlug` and the convention that the skill POSTs payloads
   matching `payloadSchema`.
4. **Stats always derive from `EntryEvent.payload`** via the declarative
   aggregation engine.
5. **The single write path is `events.service.persistEvent(…)`.** Every
   controller routes through it so the `EventMutation` audit trail can never
   be bypassed.

Full invariants: [`GOAL.md` §G9.1](../../GOAL.md).
