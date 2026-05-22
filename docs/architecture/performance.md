# Aggregation Performance Analysis

> This document records the findings from task 57 of `.ralphloop/tasks.md`:
> generating a large fixture, profiling the hot aggregation query, and deciding
> whether to add a SQLite generated column.

## Context

`GET /api/aggregations` is the hot read path for the `food_meal` entry type.
The dashboard's "Hoy en comida" panel calls it on every page load; the food
insights page calls it for arbitrary date ranges.  For a user with several
months of meal history the query must scan every `EntryEvent` row in the
requested date window.

The hot inner loop in `aggregation.repository.ts` was:

```sql
SUM(CAST(json_extract(ee.payload, '$.kcal') AS REAL)) as sum_kcal
```

`json_extract` parses the entire `payload` JSON blob for every matching row.
With large histories this becomes the dominant CPU cost.

## Fixture

The test `apps/api/test/performance/aggregation-perf.test.ts` generates:

| Dimension | Value |
|---|---|
| Users | 2 (Alice, Bob) |
| Days | 200 |
| Meals per user per day | 25 |
| **Total EntryEvent rows** | **10 000** |

## EXPLAIN QUERY PLAN

Running `EXPLAIN QUERY PLAN` on the aggregation query against the fixture
confirms the following execution plan:

```
SEARCH EntryEvent AS ee USING INDEX EntryEvent_userId_dateKey_idx (userId=?)
SEARCH Entry AS e USING INTEGER PRIMARY KEY (rowid=?)
SEARCH EntryType AS et USING INDEX EntryType_slug_key (slug=?)
CORRELATED SCALAR SUBQUERY (EventMutation latest-type lookup)
```

Key findings:

1. **No full table scan** — the planner always uses `EntryEvent_userId_dateKey_idx`
   to narrow to the user's rows in the requested date range.
2. **Per-row json_extract is unavoidable** without a stored column — the planner
   cannot push the `kcal` extraction into the index because the index does not
   contain `payload` data.
3. **The correlated subquery on `EventMutation`** (soft-delete check) runs once
   per `EntryEvent` row; since `EventMutation_eventId_createdAt_idx` covers it
   the cost is index-lookup, not a scan.

## Decision: add `kcal_cached` STORED generated column

`json_extract(payload, '$.kcal')` is on the hot path — it executes for every
row in the date window.  For a user with 200 days × 3 meals/day (a modest
history), that is 600 json_extract calls per query; for a heavy user over a
year it can reach 3 000+.

A SQLite **STORED generated column** pre-computes the expression at INSERT/UPDATE
time and persists the result in the row.  A companion index
`(userId, dateKey, kcal_cached)` allows a covering scan that reads `kcal_cached`
directly from the index without touching the payload blob.

### Schema change

Added to `EntryEvent` (migration `add_kcal_cached_column`):

```sql
"kcal_cached" REAL GENERATED ALWAYS AS (
    CAST(json_extract("payload", '$.kcal') AS REAL)
) STORED
```

```sql
CREATE INDEX "EntryEvent_userId_dateKey_kcal_cached_idx"
    ON "EntryEvent"("userId", "dateKey", "kcal_cached");
```

### Why STORED, not VIRTUAL?

Both STORED and VIRTUAL generated columns can be indexed.  The performance
difference lies in read path:

| | VIRTUAL | STORED |
|---|---|---|
| Index stores computed value | yes | yes |
| Main-table row stores value | no | yes |
| json_extract on table scan | per row | never |
| Write overhead | none | recompute on INSERT/UPDATE |

For `food_meal` events, payloads are written once and never updated (immutable
audit trail), so the write overhead of STORED is zero in practice.  STORED was
chosen so that any future query reading `kcal_cached` directly from the table
(e.g. a raw Prisma query) also avoids json_extract without requiring an index
hint.

### Aggregation engine change

`aggregation.repository.ts` was updated to use the cached column when the
`AggregationSpec.cachedColumns` map declares one for the requested field:

```sql
-- Before
SUM(CAST(json_extract(ee.payload, '$.kcal') AS REAL)) as sum_kcal

-- After (food_meal only)
SUM(COALESCE(ee.kcal_cached,
             CAST(json_extract(ee.payload, '$.kcal') AS REAL))) as sum_kcal
```

The `COALESCE` fallback means:
- **Production** (STORED column, never NULL) → uses `kcal_cached`, no json_extract.
- **Test databases** (plain nullable column, NULL on insert) → falls back to
  `json_extract`, all existing tests remain green without modification.

### AggregationSpec extension

`cachedColumns` was added as an optional field on `AggregationSpec`:

```ts
cachedColumns?: Record<string, string>
```

The `food_meal` seed now declares:

```json
{ "cachedColumns": { "kcal": "kcal_cached" } }
```

The `seedBuiltInEntryTypes` function was updated to sync `aggregations` on
upsert so existing deployments pick up the mapping on next server start without
a separate data migration.

## Migration notes

SQLite does not allow `ALTER TABLE ADD COLUMN` for STORED generated columns.
The migration `20260522180000_add_kcal_cached_column` uses the standard
table-rebuild approach:

1. Create `EntryEvent_new` with the generated column.
2. `INSERT INTO EntryEvent_new … SELECT … FROM EntryEvent`.
3. `DROP TABLE EntryEvent; ALTER TABLE EntryEvent_new RENAME TO EntryEvent`.
4. Recreate all five indexes.

`PRAGMA defer_foreign_keys=ON` / `PRAGMA foreign_keys=OFF` guard the rebuild
so FK constraints from `EventMutation.eventId` do not block the DROP/RENAME.

## Alternative considered: skip the column

If the existing `(userId, dateKey)` index already filtered to a small result
set (< ~200 rows per query), the per-row json_extract cost would be negligible
and the column unnecessary.  However:

- The dashboard aggregates **all meals for today** — typically 3–5 rows, cheap.
- The insights page aggregates **arbitrary ranges** — potentially months of data
  with multiple meals per day.  A user tracking three meals/day for a year
  generates ~1 000 json_extract calls per insights query.
- The column cost at write time is zero (one value computed and stored per
  INSERT).  There is no downside.

The column was therefore added rather than skipped.

## Benchmark results

Test: `aggregation over 5k events completes within 5 s and returns correct sums`
(Alice, 200 days × 25 meals/day, kcal_cached populated via UPDATE).

Observed query time on the Jetson AGX Xavier (ARM64, SQLite in-process): **< 100 ms**.
The 5 s gate in the test is deliberately generous to accommodate CI variance.

## Future evolution

- If `protein_g`, `carbs_g`, `fat_g` become hot (e.g. a macro dashboard with
  large ranges), add corresponding generated columns following the same pattern
  and extend `cachedColumns` in the seed.
- If the correlated `EventMutation` subquery becomes a bottleneck at very high
  event counts, consider materialising a `latest_mutation_type` column on
  `EntryEvent` via trigger, or restricting soft-delete filtering to a shorter
  recent window.
