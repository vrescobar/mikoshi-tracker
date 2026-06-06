import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, type AggregationGroupBy, type EntryRecord, type EventDetail } from "../lib/api";
import { CHART, FOOD_MEAL_SLUG, daysAgoKey, fmtNum, todayKey } from "../lib/health";
import { useAsync } from "../lib/useAsync";
import { DataTable, type Column } from "../components/DataTable";
import { ErrorBanner, Loading, fmtDate } from "../components/ui";
import { tooltipStyle } from "./PlanTab";

type RangePreset = { label: string; days: number };
const RANGES: RangePreset[] = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

type MealPayload = {
  name?: string;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  mealSlot?: string;
  source?: string;
};

export function DietTab({ userId }: { userId: string }) {
  const foodEntries = useAsync(() => api.asUser(userId).listEntries({ entryTypeSlug: FOOD_MEAL_SLUG }), [userId]);
  const today = useAsync(() => api.asUser(userId).today(), [userId]);
  const [days, setDays] = useState(14);
  const [groupBy, setGroupBy] = useState<AggregationGroupBy>("day");

  if (foodEntries.error) return <ErrorBanner message={foodEntries.error} />;
  if (foodEntries.loading) return <Loading />;

  const entries = foodEntries.data?.items ?? [];
  if (entries.length === 0) {
    return (
      <div className="section">
        <div className="card pad dim">This user does not log food (no food_meal entry).</div>
      </div>
    );
  }

  const from = daysAgoKey(days - 1);
  const to = todayKey();
  const nutrition = today.data?.summary.nutrition ?? null;

  return (
    <>
      <TodayCard nutrition={nutrition} loading={today.loading} />

      <div className="section">
        <div className="section-head">
          <h3>Trend</h3>
          <div className="actions">
            <div className="segmented">
              {RANGES.map((r) => (
                <button key={r.label} className={days === r.days ? "active" : ""} onClick={() => setDays(r.days)}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="segmented">
              {(["day", "week"] as const).map((g) => (
                <button key={g} className={groupBy === g ? "active" : ""} onClick={() => setGroupBy(g)}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
        <TrendCharts userId={userId} from={from} to={to} groupBy={groupBy} kcalTarget={nutrition?.kcalTarget ?? null} />
      </div>

      <MealLog userId={userId} entries={entries} from={from} to={to} />
    </>
  );
}

// ── Today card ─────────────────────────────────────────────────────────────────

function TodayCard({
  nutrition,
  loading,
}: {
  nutrition: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; mealCount: number; kcalTarget: number | null } | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="section">
        <Loading label="Loading today…" />
      </div>
    );
  }
  if (!nutrition) {
    return (
      <div className="section">
        <div className="section-head">
          <h3>Today</h3>
        </div>
        <div className="card pad dim">No meals logged today.</div>
      </div>
    );
  }

  const target = nutrition.kcalTarget;
  const pct = target ? Math.min(100, Math.round((nutrition.kcal / target) * 100)) : null;
  const over = target ? nutrition.kcal > target : false;

  return (
    <div className="section">
      <div className="section-head">
        <h3>Today</h3>
        <span className="dim">{nutrition.mealCount} meals logged</span>
      </div>
      <div className="card pad">
        <div className="kcal-head">
          <div>
            <span className="metric-value">{fmtNum(nutrition.kcal)}</span>
            <span className="metric-label">kcal{target ? ` of ${fmtNum(target)} target` : " (no target set)"}</span>
          </div>
          {pct !== null && <div className={`kcal-pct ${over ? "over" : ""}`}>{pct}%</div>}
        </div>
        {pct !== null && (
          <div className="kcal-bar">
            <div className={`fill ${over ? "over" : ""}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="macros">
          <Macro label="Protein" value={nutrition.protein_g} color={CHART.protein} />
          <Macro label="Carbs" value={nutrition.carbs_g} color={CHART.carbs} />
          <Macro label="Fat" value={nutrition.fat_g} color={CHART.fat} />
        </div>
      </div>
    </div>
  );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="macro">
      <span className="macro-dot" style={{ background: color }} />
      <span className="macro-val">{fmtNum(value, 1)}g</span>
      <span className="macro-label">{label}</span>
    </div>
  );
}

// ── Trend charts ───────────────────────────────────────────────────────────────

function TrendCharts({
  userId,
  from,
  to,
  groupBy,
  kcalTarget,
}: {
  userId: string;
  from: string;
  to: string;
  groupBy: AggregationGroupBy;
  kcalTarget: number | null;
}) {
  const agg = useAsync(
    () =>
      api.asUser(userId).aggregations({
        entryTypeSlug: FOOD_MEAL_SLUG,
        from,
        to,
        groupBy,
        fields: "kcal,protein_g,carbs_g,fat_g",
        include: "missing_days",
      }),
    [userId, from, to, groupBy],
  );

  const data = useMemo(() => {
    return (agg.data?.buckets ?? []).map((b) => ({
      label: b.key.kind === "date" ? b.key.value.slice(5) : b.key.value,
      kcal: Math.round(b.sum.kcal ?? 0),
      protein_g: Math.round(b.sum.protein_g ?? 0),
      carbs_g: Math.round(b.sum.carbs_g ?? 0),
      fat_g: Math.round(b.sum.fat_g ?? 0),
    }));
  }, [agg.data]);

  if (agg.error) return <ErrorBanner message={agg.error} />;
  if (agg.loading) return <Loading label="Loading trend…" />;

  const total = agg.data?.total.sum ?? {};
  const dayCount = data.length || 1;
  const avgKcal = Math.round((total.kcal ?? 0) / dayCount);

  return (
    <>
      <div className="metrics">
        <div className="metric">
          <span className="metric-value">{fmtNum(total.kcal ?? 0)}</span>
          <span className="metric-label">Total kcal</span>
        </div>
        <div className="metric">
          <span className="metric-value">{fmtNum(avgKcal)}</span>
          <span className="metric-label">Avg kcal / {groupBy === "week" ? "week" : "day"}</span>
        </div>
        <div className="metric">
          <span className="metric-value">{fmtNum(total.protein_g ?? 0, 0)}g</span>
          <span className="metric-label">Total protein</span>
        </div>
      </div>

      <div className="card pad chart-card">
        <div className="chart-title">Calories per {groupBy}</div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7685" }} interval="preserveStartEnd" minTickGap={20} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7685" }} width={48} />
            <Tooltip formatter={(v) => [`${fmtNum(Number(v))} kcal`, "Calories"]} contentStyle={tooltipStyle} />
            {kcalTarget && groupBy === "day" && (
              <ReferenceLine y={kcalTarget} stroke={CHART.target} strokeDasharray="4 4" />
            )}
            <Bar dataKey="kcal" fill={CHART.kcal} radius={[4, 4, 0, 0]} maxBarSize={42} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="card pad chart-card" style={{ marginTop: 16 }}>
        <div className="chart-title">Macros per {groupBy} (grams)</div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7685" }} interval="preserveStartEnd" minTickGap={20} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7685" }} width={40} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${fmtNum(Number(v))}g`, macroName(String(n))]} />
            <Legend formatter={(v: string) => macroName(v)} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="protein_g" stackId="m" fill={CHART.protein} maxBarSize={42} />
            <Bar dataKey="carbs_g" stackId="m" fill={CHART.carbs} maxBarSize={42} />
            <Bar dataKey="fat_g" stackId="m" fill={CHART.fat} radius={[4, 4, 0, 0]} maxBarSize={42} />
            <Line type="monotone" dataKey="protein_g" stroke="transparent" dot={false} legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function macroName(key: string): string {
  return key === "protein_g" ? "Protein" : key === "carbs_g" ? "Carbs" : key === "fat_g" ? "Fat" : key;
}

// ── Meal log ───────────────────────────────────────────────────────────────────

type MealRow = {
  id: string;
  dateKey: string;
  occurredAt: string;
  name: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  mealSlot: string | null;
};

function MealLog({
  userId,
  entries,
  from,
  to,
}: {
  userId: string;
  entries: EntryRecord[];
  from: string;
  to: string;
}) {
  const meals = useAsync(async () => {
    const lists = await Promise.all(
      entries.map((e) => api.asUser(userId).listEvents({ entryId: e.id, from, to, limit: 500 })),
    );
    const rows: MealRow[] = [];
    for (const list of lists) {
      for (const ev of list.items as EventDetail[]) {
        const p = (ev.payload ?? {}) as MealPayload;
        rows.push({
          id: ev.id,
          dateKey: ev.dateKey,
          occurredAt: ev.occurredAt,
          name: p.name ?? "—",
          kcal: p.kcal ?? null,
          protein_g: p.protein_g ?? null,
          carbs_g: p.carbs_g ?? null,
          fat_g: p.fat_g ?? null,
          mealSlot: p.mealSlot ?? null,
        });
      }
    }
    rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return rows;
  }, [userId, from, to, entries.map((e) => e.id).join(",")]);

  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = (meals.data ?? []).filter((r) => !needle || r.name.toLowerCase().includes(needle));

  const cols: Column<MealRow>[] = [
    { header: "Date", cell: (r) => <span className="strong">{r.dateKey}</span> },
    {
      header: "Meal",
      cell: (r) => (
        <>
          <span>{r.name}</span>
          {r.mealSlot && <span className="tag" style={{ marginLeft: 6 }}>{r.mealSlot}</span>}
        </>
      ),
    },
    { header: "kcal", align: "right", cell: (r) => <span className="mono">{fmtNum(r.kcal)}</span> },
    { header: "P", align: "right", cell: (r) => <span className="dim">{fmtNum(r.protein_g, 1)}</span> },
    { header: "C", align: "right", cell: (r) => <span className="dim">{fmtNum(r.carbs_g, 1)}</span> },
    { header: "F", align: "right", cell: (r) => <span className="dim">{fmtNum(r.fat_g, 1)}</span> },
  ];

  return (
    <div className="section">
      <div className="section-head">
        <h3>Meal log</h3>
        <span className="count">{rows.length}</span>
        <div className="actions">
          <input className="search-input" placeholder="Search meals…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        loading={meals.loading}
        error={meals.error}
        empty={{ icon: "🍽", title: "No meals in this range" }}
      />
      <div className="dim sm" style={{ marginTop: 8 }}>
        Showing {fmtDate(from)} – {fmtDate(to)}
      </div>
    </div>
  );
}
