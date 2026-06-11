import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, type AdminEvent } from "../../../lib/admin-client";

/** Recharts types the tooltip item payload as `any`; narrow it once here. */
function tooltipCounts(item: unknown): string {
  const payload = (item as { payload?: { completed?: number; scheduled?: number } }).payload;
  return `${payload?.completed ?? 0}/${payload?.scheduled ?? 0}`;
}
import {
  CHART,
  WEEKDAYS,
  WEEKDAY_SHORT,
  daysAgoKey,
  frequencyLabel,
  isDeterministic,
  isHabit,
  rangeKeys,
  scheduledOn,
  todayKey,
  toHabit,
  weekdayOfKey,
  type Habit,
} from "./health";
import { useAsync } from "../../admin/lib/use-async";
import { ErrorBanner, Loading, Pill, fmtDate } from "../../admin/ui";

const ADHERENCE_WINDOW = 30; // days

export function PlanTab({ userId }: { userId: string }) {
  const entries = useAsync(() => api.asUser(userId).listEntries(), [userId]);
  const from = daysAgoKey(ADHERENCE_WINDOW - 1);
  const events = useAsync(() => api.admin.listEvents({ userId, from, to: todayKey(), limit: 1000 }), [userId]);
  const [q, setQ] = useState("");

  if (entries.error) return <ErrorBanner message={entries.error} />;
  if (entries.loading) return <Loading />;

  const all = (entries.data?.items ?? []).filter(isHabit).map(toHabit);
  const needle = q.trim().toLowerCase();
  const habits = needle ? all.filter((h) => h.name.toLowerCase().includes(needle)) : all;

  const active = habits.filter((h) => h.isActive);
  const archived = habits.filter((h) => !h.isActive);
  const evByEntry = groupEvents(events.data?.items ?? []);

  return (
    <>
      <div className="section">
        <div className="section-head">
          <h3>Planned habits</h3>
          <span className="count">{all.length}</span>
          <div className="actions">
            <input
              className="search-input"
              placeholder="Search habits…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="metrics">
          <Metric value={all.length} label="Total habits" />
          <Metric value={active.length} label="Active" />
          <Metric value={archived.length} label="Archived" />
          <Metric value={active.filter((h) => h.freq === "DAILY").length} label="Daily" />
          <Metric
            value={active.filter((h) => isDeterministic(h) && scheduledOn(h, weekdayOfKey(todayKey()))).length}
            label="Due today"
          />
        </div>
      </div>

      <WeeklyGrid habits={active} />

      {events.error ? (
        <ErrorBanner message={events.error} />
      ) : events.loading ? (
        <div className="section">
          <Loading label="Loading adherence…" />
        </div>
      ) : (
        <>
          <DailyCompletionChart habits={active} events={evByEntry} from={from} />
          <AdherenceRanking habits={active} events={evByEntry} from={from} />
        </>
      )}

      <HabitList title="Active habits" habits={active} events={evByEntry} />
      {archived.length > 0 && <HabitList title="Archived habits" habits={archived} events={evByEntry} muted />}
    </>
  );
}

// ── Weekly schedule grid ───────────────────────────────────────────────────────

function WeeklyGrid({ habits }: { habits: Habit[] }) {
  const deterministic = habits.filter(isDeterministic);
  const flexible = habits.filter((h) => !isDeterministic(h));
  const today = weekdayOfKey(todayKey());

  return (
    <div className="section">
      <div className="section-head">
        <h3>Weekly plan</h3>
        <span className="dim">when each habit is scheduled</span>
      </div>
      <div className="week-grid">
        {WEEKDAYS.map((day) => {
          const due = deterministic.filter((h) => scheduledOn(h, day));
          return (
            <div key={day} className={`week-col ${day === today ? "is-today" : ""}`}>
              <div className="week-col-head">
                {WEEKDAY_SHORT[day]}
                <span className="week-col-count">{due.length}</span>
              </div>
              <div className="week-col-body">
                {due.length === 0 ? (
                  <span className="dim sm">—</span>
                ) : (
                  due.map((h) => (
                    <div key={h.id} className="week-chip" title={h.name}>
                      {h.name}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {flexible.length > 0 && (
        <div className="card pad flex-note">
          <span className="strong">Flexible cadence</span>
          <div className="flex-chips">
            {flexible.map((h) => (
              <span key={h.id} className="tag">
                {h.name} · {frequencyLabel(h)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Adherence computation ──────────────────────────────────────────────────────

type EventsByEntry = Map<string, Map<string, boolean>>; // entryId -> dateKey -> completed

function groupEvents(events: AdminEvent[]): EventsByEntry {
  const map: EventsByEntry = new Map();
  for (const e of events) {
    let inner = map.get(e.entryId);
    if (!inner) {
      inner = new Map();
      map.set(e.entryId, inner);
    }
    // A day counts as completed if any event for it is completed.
    const prev = inner.get(e.dateKey) ?? false;
    inner.set(e.dateKey, prev || e.completed === true);
  }
  return map;
}

type Adherence = { scheduled: number; completed: number; rate: number };

function habitAdherence(h: Habit, events: EventsByEntry, from: string, to: string): Adherence {
  const inner = events.get(h.id) ?? new Map<string, boolean>();
  const start = h.startDate && h.startDate > from ? h.startDate : from;
  let scheduled = 0;
  let completed = 0;
  for (const key of rangeKeys(start, to)) {
    if (!scheduledOn(h, weekdayOfKey(key))) continue;
    scheduled += 1;
    if (inner.get(key)) completed += 1;
  }
  return { scheduled, completed, rate: scheduled ? completed / scheduled : 0 };
}

// ── Daily completion chart ─────────────────────────────────────────────────────

function DailyCompletionChart({
  habits,
  events,
  from,
}: {
  habits: Habit[];
  events: EventsByEntry;
  from: string;
}) {
  const to = todayKey();
  const deterministic = habits.filter(isDeterministic);

  const data = useMemo(() => {
    return rangeKeys(from, to).map((key) => {
      const wd = weekdayOfKey(key);
      let scheduled = 0;
      let completed = 0;
      for (const h of deterministic) {
        if (h.startDate && key < h.startDate) continue;
        if (!scheduledOn(h, wd)) continue;
        scheduled += 1;
        if (events.get(h.id)?.get(key)) completed += 1;
      }
      return {
        date: key.slice(5),
        rate: scheduled ? Math.round((completed / scheduled) * 100) : null,
        completed,
        scheduled,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deterministic`/`to` derive from habits + the current day
  }, [habits, events, from]);

  if (deterministic.length === 0) {
    return null;
  }

  return (
    <div className="section">
      <div className="section-head">
        <h3>Daily completion</h3>
        <span className="dim">last {ADHERENCE_WINDOW} days · scheduled habits only</span>
      </div>
      <div className="card pad chart-card">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="adherence" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CHART.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7685" }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#6b7685" }} unit="%" width={44} />
            <Tooltip
              formatter={(v, _n, p) => [
                v === null || v === undefined ? "no habits" : `${v}% (${tooltipCounts(p)})`,
                "Completion",
              ]}
              contentStyle={tooltipStyle}
            />
            <Area type="monotone" dataKey="rate" stroke={CHART.accent} strokeWidth={2} fill="url(#adherence)" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Per-habit adherence ranking ────────────────────────────────────────────────

function AdherenceRanking({
  habits,
  events,
  from,
}: {
  habits: Habit[];
  events: EventsByEntry;
  from: string;
}) {
  const to = todayKey();
  const rows = habits
    .filter(isDeterministic)
    .map((h) => {
      const a = habitAdherence(h, events, from, to);
      return { name: h.name, pct: Math.round(a.rate * 100), ...a };
    })
    .filter((r) => r.scheduled > 0)
    .sort((a, b) => b.pct - a.pct);

  if (rows.length === 0) return null;

  return (
    <div className="section">
      <div className="section-head">
        <h3>Adherence by habit</h3>
        <span className="dim">last {ADHERENCE_WINDOW} days</span>
      </div>
      <div className="card pad chart-card">
        <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 38 + 24)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={CHART.grid} horizontal={false} />
            <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "#6b7685" }} />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tick={{ fontSize: 12, fill: "#3c4858" }}
              tickFormatter={(s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s)}
            />
            <Tooltip
              cursor={{ fill: "rgba(22,70,60,0.05)" }}
              formatter={(v, _n, p) => [`${v}% (${tooltipCounts(p)})`, "Adherence"]}
              contentStyle={tooltipStyle}
            />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={16}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.pct >= 80 ? CHART.accent : r.pct >= 50 ? CHART.carbs : CHART.fat} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Habit list with mini adherence strip ───────────────────────────────────────

const STRIP_DAYS = 14;

function HabitList({
  title,
  habits,
  events,
  muted,
}: {
  title: string;
  habits: Habit[];
  events: EventsByEntry;
  muted?: boolean;
}) {
  if (habits.length === 0) {
    return (
      <div className="section">
        <div className="section-head">
          <h3>{title}</h3>
        </div>
        <div className="card pad dim">No habits.</div>
      </div>
    );
  }

  const to = todayKey();
  const stripFrom = daysAgoKey(STRIP_DAYS - 1);
  const stripKeys = rangeKeys(stripFrom, to);

  return (
    <div className="section">
      <div className="section-head">
        <h3>{title}</h3>
        <span className="count">{habits.length}</span>
      </div>
      <div className="habit-list">
        {habits.map((h) => {
          const inner = events.get(h.id) ?? new Map<string, boolean>();
          const a = isDeterministic(h) ? habitAdherence(h, events, daysAgoKey(ADHERENCE_WINDOW - 1), to) : null;
          return (
            <div key={h.id} className={`card pad habit-row ${muted ? "is-muted" : ""}`}>
              <div className="habit-main">
                <div className="habit-title">
                  <span className="strong">{h.name}</span>
                  <Pill kind={h.kind === "quantity" ? "info" : undefined}>{h.kind}</Pill>
                  {!h.isActive && <Pill kind="archived">archived</Pill>}
                </div>
                <div className="habit-sub dim">
                  {frequencyLabel(h)}
                  {h.kind === "quantity" && h.targetValue ? ` · target ${h.targetValue}${h.unit ? ` ${h.unit}` : ""}` : ""}
                  {h.startDate ? ` · since ${fmtDate(h.startDate)}` : ""}
                </div>
              </div>
              <div className="habit-aside">
                <div className="strip" title={`Last ${STRIP_DAYS} days`}>
                  {stripKeys.map((key) => {
                    const scheduled = isDeterministic(h) ? scheduledOn(h, weekdayOfKey(key)) : inner.has(key);
                    const done = inner.get(key) === true;
                    const cls = !scheduled ? "off" : done ? "done" : "miss";
                    return <span key={key} className={`cell ${cls}`} title={key} />;
                  })}
                </div>
                {a && (
                  <div className={`adh ${a.rate >= 0.8 ? "good" : a.rate >= 0.5 ? "mid" : "low"}`}>
                    {Math.round(a.rate * 100)}%
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── small shared bits ──────────────────────────────────────────────────────────

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="metric">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

export const tooltipStyle = {
  border: "1px solid #e6e9ef",
  borderRadius: 9,
  boxShadow: "0 6px 20px rgba(20,30,45,0.08)",
  fontSize: 12,
} as const;
