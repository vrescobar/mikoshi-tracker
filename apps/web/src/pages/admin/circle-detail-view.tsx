import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { api, type AdminCircle, type CircleContestConfig, type CircleMember } from "../../../lib/admin-client";
import { useAsync, errorMessage } from "../../admin/lib/use-async";
import { DataTable, type DataTableColumn as Column } from "../../../components/ui";
import {
  ConfirmDialog,
  ErrorBanner,
  Field,
  JsonView,
  Loading,
  Pill,
  fmtDate,
  useToast,
} from "../../admin/ui";

type Tab = "overview" | "members" | "contest" | "snapshots";

export function CircleDetail() {
  const { circleId = "" } = useParams<{ circleId: string }>();
  const navigate = useNavigate();
  const circle = useAsync(() => api.admin.getCircle(circleId).then((r) => r.circle), [circleId]);
  const [tab, setTab] = useState<Tab>("overview");

  if (circle.error) return <ErrorBanner message={circle.error} />;
  if (circle.loading || !circle.data) return <Loading />;

  const c = circle.data;

  return (
    <>
      <div className="page-head">
        <button className="btn link" onClick={() => navigate("/admin/circles")}>
          ← Circles
        </button>
      </div>

      <div className="card profile-head">
        <div className="avatar">◍</div>
        <div className="meta">
          <div className="name">{c.name}</div>
          <div className="row">
            <Pill kind={c.status}>{c.status}</Pill>
            {c.season && <span className="tag">{c.season}</span>}
            <span>{c.memberCount} members</span>
            <span className="dim">owner {c.ownerId.slice(0, 12)}</span>
          </div>
        </div>
      </div>

      <div className="tabs">
        {(["overview", "members", "contest", "snapshots"] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && <Lifecycle circle={c} onSaved={circle.reload} />}
      {tab === "members" && <Members circleId={circleId} ownerId={c.ownerId} onChanged={circle.reload} />}
      {tab === "contest" && <Contest circleId={circleId} ownerId={c.ownerId} />}
      {tab === "snapshots" && <Snapshots circleId={circleId} defaultSeason={c.season} />}
    </>
  );
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

function Lifecycle({ circle, onSaved }: { circle: AdminCircle; onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState(circle.status);
  const [season, setSeason] = useState(circle.season ?? "");
  const [mode, setMode] = useState(circle.leaderboardMode);
  const [start, setStart] = useState(circle.contestStartAt?.slice(0, 10) ?? "");
  const [end, setEnd] = useState(circle.contestEndAt?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.admin.updateCircle(circle.id, {
        status,
        season: season.trim() || null,
        leaderboardMode: mode,
        contestStartAt: start ? new Date(start).toISOString() : null,
        contestEndAt: end ? new Date(end).toISOString() : null,
      });
      toast.ok("Circle updated");
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card pad" style={{ maxWidth: 560 }}>
      <h3 style={{ marginBottom: 16 }}>Lifecycle</h3>
      <Field label="Status" hint="Disabled hides the circle from all members and blocks every check-in (reversible).">
        <select value={status} onChange={(e) => setStatus(e.target.value as AdminCircle["status"])}>
          <option value="active">active</option>
          <option value="closed">closed</option>
          <option value="archived">archived</option>
          <option value="disabled">disabled (hidden + off)</option>
        </select>
      </Field>
      <Field label="Season">
        <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="e.g. bikini-2026" />
      </Field>
      <Field label="Leaderboard mode">
        <select value={mode} onChange={(e) => setMode(e.target.value as AdminCircle["leaderboardMode"])}>
          <option value="rolling">rolling (live)</option>
          <option value="snapshot">snapshot (frozen)</option>
        </select>
      </Field>
      <div className="field-row">
        <Field label="Contest start">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Contest end">
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <button className="btn" onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

// ── Members ──────────────────────────────────────────────────────────────────

function Members({ circleId, ownerId, onChanged }: { circleId: string; ownerId: string; onChanged: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const detail = useAsync(() => api.asUser(ownerId).getCircle(circleId), [circleId, ownerId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [enrollExt, setEnrollExt] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<CircleMember | null>(null);

  const enroll = async () => {
    setBusy("enroll");
    try {
      await api.admin.enrollMember(circleId, enrollExt.trim());
      toast.ok("Member enrolled");
      setEnrollExt("");
      detail.reload();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    setBusy("add");
    try {
      await api.asUser(ownerId).addMember(circleId, addEmail.trim());
      toast.ok("Member added");
      setAddEmail("");
      detail.reload();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (m: CircleMember) => {
    setBusy(m.membershipId);
    try {
      await api.asUser(ownerId).removeMember(circleId, m.membershipId);
      toast.ok("Member removed");
      setConfirmRemove(null);
      detail.reload();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const cols: Column<CircleMember>[] = [
    { header: "Name", cell: (m) => <span className="strong">{m.displayName}</span> },
    { header: "Role", cell: (m) => <Pill kind={m.role === "owner" ? "info" : undefined}>{m.role}</Pill> },
    {
      header: "External ID",
      cell: (m) => (m.externalId ? <span className="tag">{m.externalId}</span> : <span className="dim">—</span>),
    },
    { header: "Joined", cell: (m) => <span className="dim">{fmtDate(m.joinedAt)}</span> },
    {
      header: "",
      align: "right",
      cell: (m) => (
        <div className="row-actions">
          <button className="btn ghost sm" onClick={() => navigate(`/admin/users/${encodeURIComponent(m.userId)}`)}>
            Profile
          </button>
          {m.role !== "owner" && (
            <button className="btn danger sm" disabled={busy === m.membershipId} onClick={() => setConfirmRemove(m)}>
              Remove
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="card pad" style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 12 }}>Add members</h3>
        <div className="field-row">
          <Field label="By external ID (provisioned)">
            <div className="inline-actions">
              <input value={enrollExt} onChange={(e) => setEnrollExt(e.target.value)} placeholder="mikoshi-identity-…" />
              <button className="btn ghost" disabled={busy !== null || !enrollExt.trim()} onClick={() => void enroll()}>
                Enroll
              </button>
            </div>
          </Field>
          <Field label="By email (existing user)">
            <div className="inline-actions">
              <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="user@example.com" />
              <button className="btn ghost" disabled={busy !== null || !addEmail.trim()} onClick={() => void add()}>
                Add
              </button>
            </div>
          </Field>
        </div>
      </div>

      <DataTable
        columns={cols}
        rows={detail.data?.members ?? []}
        rowKey={(m) => m.membershipId}
        loading={detail.loading}
        error={detail.error}
        empty={{ icon: "◎", title: "No members" }}
      />

      {confirmRemove && (
        <ConfirmDialog
          title="Remove member"
          message={`Remove ${confirmRemove.displayName} from this circle?`}
          confirmLabel="Remove"
          danger
          busy={busy === confirmRemove.membershipId}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => void remove(confirmRemove)}
        />
      )}
    </>
  );
}

// ── Contest ──────────────────────────────────────────────────────────────────

function Contest({ circleId, ownerId }: { circleId: string; ownerId: string }) {
  const toast = useToast();
  const [kind, setKind] = useState<"habit" | "metric">("habit");
  const [entryTypeSlug, setEntryTypeSlug] = useState("food_meal");
  const [field, setField] = useState("kcal");
  const [metricMode, setMetricMode] = useState<"cumulative" | "adherence" | "delta">("cumulative");
  const [goal, setGoal] = useState<"higher" | "lower">("higher");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const config: CircleContestConfig =
        kind === "habit"
          ? { contestKind: "habit" }
          : {
              contestKind: "metric",
              metricEntryTypeSlug: entryTypeSlug.trim(),
              metricField: field.trim(),
              metricMode,
              metricGoal: goal,
              ...(metricMode === "adherence" && target ? { metricTarget: Number(target) } : {}),
            };
      await api.asUser(ownerId).configureContest(circleId, config);
      toast.ok("Contest configured");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card pad" style={{ maxWidth: 560 }}>
      <h3 style={{ marginBottom: 6 }}>Contest scoring</h3>
      <p className="dim" style={{ marginTop: 0 }}>
        Habit contests rank by shared-habit completion. Metric contests aggregate one payload field.
      </p>
      <Field label="Contest kind">
        <select value={kind} onChange={(e) => setKind(e.target.value as "habit" | "metric")}>
          <option value="habit">habit completion</option>
          <option value="metric">metric (kcal / weight / steps)</option>
        </select>
      </Field>

      {kind === "metric" && (
        <>
          <div className="field-row">
            <Field label="Entry type slug">
              <input value={entryTypeSlug} onChange={(e) => setEntryTypeSlug(e.target.value)} placeholder="food_meal" />
            </Field>
            <Field label="Field">
              <input value={field} onChange={(e) => setField(e.target.value)} placeholder="kcal" />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Mode">
              <select value={metricMode} onChange={(e) => setMetricMode(e.target.value as typeof metricMode)}>
                <option value="cumulative">cumulative (sum)</option>
                <option value="adherence">adherence (days ≥ target)</option>
                <option value="delta">delta (last − first)</option>
              </select>
            </Field>
            <Field label="Goal">
              <select value={goal} onChange={(e) => setGoal(e.target.value as "higher" | "lower")}>
                <option value="higher">higher is better</option>
                <option value="lower">lower is better</option>
              </select>
            </Field>
          </div>
          {metricMode === "adherence" && (
            <Field label="Target" hint="Daily threshold for an adherent day.">
              <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 10000" />
            </Field>
          )}
        </>
      )}

      <button className="btn" onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : "Apply contest config"}
      </button>
    </div>
  );
}

// ── Snapshots ────────────────────────────────────────────────────────────────

function Snapshots({ circleId, defaultSeason }: { circleId: string; defaultSeason: string | null }) {
  const toast = useToast();
  const snaps = useAsync(() => api.admin.listSnapshots(circleId), [circleId]);
  const [busy, setBusy] = useState(false);
  const [season, setSeason] = useState(defaultSeason ?? "");
  const [seasonA, setSeasonA] = useState("");
  const [seasonB, setSeasonB] = useState("");
  const compare = useAsync(
    () =>
      seasonA && seasonB
        ? api.admin.compareSnapshots(circleId, seasonA, seasonB)
        : Promise.resolve(null),
    [circleId, seasonA, seasonB],
  );

  const freeze = async () => {
    setBusy(true);
    try {
      const res = await api.admin.createSnapshot(circleId, season.trim() || undefined);
      toast.ok(`Frozen season "${res.season}" (${res.count} members)`);
      snaps.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const seasons = [...new Set((snaps.data?.items ?? []).map((s) => s.season))];

  return (
    <>
      <div className="card pad" style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 12 }}>Freeze standings</h3>
        <Field label="Season label" hint="Defaults to the circle's current season.">
          <div className="inline-actions">
            <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="bikini-2026" />
            <button className="btn" disabled={busy} onClick={() => void freeze()}>
              {busy ? "Freezing…" : "Create snapshot"}
            </button>
          </div>
        </Field>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Frozen snapshots</h3>
          <span className="count">{snaps.data?.total ?? 0}</span>
        </div>
        <DataTable
          columns={[
            { header: "Season", cell: (s) => <span className="tag">{s.season}</span> },
            { header: "Rank", cell: (s) => s.rank },
            { header: "User", cell: (s) => <span className="mono">{s.userId.slice(0, 12)}</span> },
            { header: "Score", cell: (s) => <span className="strong">{s.score}</span> },
            { header: "Frozen", cell: (s) => <span className="dim">{fmtDate(s.createdAt)}</span> },
          ]}
          rows={snaps.data?.items ?? []}
          rowKey={(s) => s.id}
          loading={snaps.loading}
          error={snaps.error}
          empty={{ icon: "❄", title: "No snapshots frozen yet" }}
        />
      </div>

      {seasons.length >= 2 && (
        <div className="section">
          <div className="section-head">
            <h3>Compare seasons</h3>
          </div>
          <div className="filters">
            <select value={seasonA} onChange={(e) => setSeasonA(e.target.value)}>
              <option value="">Season A…</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className="dim">vs</span>
            <select value={seasonB} onChange={(e) => setSeasonB(e.target.value)}>
              <option value="">Season B…</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {compare.data && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Rank A→B</th>
                    <th>Δ rank</th>
                    <th>Score A→B</th>
                    <th>Δ score</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.data.rows.map((r) => (
                    <tr key={r.userId}>
                      <td className="mono">{r.userId.slice(0, 12)}</td>
                      <td>
                        {r.rankA ?? "—"} → {r.rankB ?? "—"}
                      </td>
                      <td className={r.rankDelta != null ? (r.rankDelta < 0 ? "delta-up" : r.rankDelta > 0 ? "delta-down" : "") : ""}>
                        {r.rankDelta != null ? (r.rankDelta < 0 ? `▲ ${-r.rankDelta}` : r.rankDelta > 0 ? `▼ ${r.rankDelta}` : "0") : "—"}
                      </td>
                      <td>
                        {r.scoreA ?? "—"} → {r.scoreB ?? "—"}
                      </td>
                      <td className={r.scoreDelta != null ? (r.scoreDelta > 0 ? "delta-up" : r.scoreDelta < 0 ? "delta-down" : "") : ""}>
                        {r.scoreDelta ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {snaps.data && snaps.data.items.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h3>Raw snapshot data</h3>
          </div>
          <JsonView value={snaps.data.items.slice(0, 20)} />
        </div>
      )}
    </>
  );
}
