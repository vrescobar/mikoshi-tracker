import { useCallback, useEffect, useState } from "react";

import { api, ApiError, type AdminCircle, type DashboardMetrics } from "./lib/api";
import { clearAdminKey, getAdminKey, setAdminKey } from "./lib/auth";

type View = "dashboard" | "circles";

export function App() {
  const [authed, setAuthed] = useState<boolean>(Boolean(getAdminKey()));
  const [view, setView] = useState<View>("dashboard");

  if (!authed) {
    return <LoginGate onAuthed={() => setAuthed(true)} />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <strong>MikoshiTracker · God Mode</strong>
        <nav>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            Dashboard
          </button>
          <button className={view === "circles" ? "active" : ""} onClick={() => setView("circles")}>
            Circles
          </button>
        </nav>
        <button
          className="ghost"
          onClick={() => {
            clearAdminKey();
            setAuthed(false);
          }}
        >
          Lock
        </button>
      </header>
      <main>{view === "dashboard" ? <Dashboard /> : <CirclesView />}</main>
    </div>
  );
}

function LoginGate({ onAuthed }: { onAuthed: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setAdminKey(key.trim());
    try {
      await api.dashboard(); // validates the key against a god-mode endpoint
      onAuthed();
    } catch (e) {
      clearAdminKey();
      setError(e instanceof ApiError ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="card">
        <h1>Admin God Mode</h1>
        <p className="muted">Paste the operator admin API key. It stays in this tab only.</p>
        <input
          type="password"
          placeholder="MIKOSHI_TRACKER_ADMIN_API_KEY"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        <button onClick={() => void submit()} disabled={busy || key.trim().length === 0}>
          {busy ? "Verifying…" : "Unlock"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .dashboard()
      .then(setMetrics)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!metrics) return <p className="muted">Loading…</p>;

  const cards: [string, number][] = [
    ["Users", metrics.users],
    ["Circles", metrics.circles],
    ["Active circles", metrics.activeCircles],
    ["Entries", metrics.entries],
    ["Events", metrics.events],
    ["Snapshots", metrics.snapshots],
  ];

  return (
    <div className="metrics">
      {cards.map(([label, value]) => (
        <div className="metric" key={label}>
          <span className="metric-value">{value}</span>
          <span className="metric-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function CirclesView() {
  const [circles, setCircles] = useState<AdminCircle[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .listCircles()
      .then((r) => {
        setCircles(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"));
  }, []);

  useEffect(load, [load]);

  const snapshot = async (id: string) => {
    setBusyId(id);
    setFlash(null);
    try {
      const result = await api.createSnapshot(id);
      setFlash(`Snapshot frozen for season "${result.season}" (${result.count} members).`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Snapshot failed");
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <p className="error">{error}</p>;

  return (
    <div>
      <p className="muted">
        {total} circle{total === 1 ? "" : "s"}
      </p>
      {flash && <p className="flash">{flash}</p>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Season</th>
            <th>Members</th>
            <th>Contest window</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {circles.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>
                <span className={`pill ${c.status}`}>{c.status}</span>
              </td>
              <td>{c.season ?? "—"}</td>
              <td>{c.memberCount}</td>
              <td className="muted">
                {c.contestStartAt ? `${c.contestStartAt.slice(0, 10)} → ${c.contestEndAt?.slice(0, 10) ?? "…"}` : "—"}
              </td>
              <td>
                <button className="ghost" disabled={busyId === c.id} onClick={() => void snapshot(c.id)}>
                  {busyId === c.id ? "Freezing…" : "Snapshot"}
                </button>
              </td>
            </tr>
          ))}
          {circles.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No circles yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
