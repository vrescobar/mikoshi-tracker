import { api, type AuditEntry } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { navigate } from "../lib/router";
import { ErrorBanner, Loading, fmtDateTime } from "../components/ui";

export function Dashboard() {
  const metrics = useAsync(() => api.admin.dashboard(), []);
  const audit = useAsync(() => api.admin.auditLog({ limit: 12 }), []);

  if (metrics.error) return <ErrorBanner message={metrics.error} />;
  if (!metrics.data) return <Loading />;

  const m = metrics.data;
  const cards: [string, number][] = [
    ["Users", m.users],
    ["Circles", m.circles],
    ["Active circles", m.activeCircles],
    ["Entries", m.entries],
    ["Events", m.events],
    ["Snapshots", m.snapshots],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <div className="sub">System-wide totals across every user and circle.</div>
        </div>
      </div>

      <div className="metrics">
        {cards.map(([label, value]) => (
          <div className="metric" key={label}>
            <span className="metric-value">{value.toLocaleString()}</span>
            <span className="metric-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Recent admin activity</h3>
          <button className="btn link" onClick={() => navigate("audit")}>
            View all →
          </button>
        </div>
        {audit.error ? (
          <ErrorBanner message={audit.error} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Operator</th>
                  <th>Action</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {(audit.data?.items ?? []).map((a: AuditEntry) => (
                  <tr key={a.id}>
                    <td className="dim">{fmtDateTime(a.createdAt)}</td>
                    <td>
                      <span className="tag">{a.actorLabel ?? a.actorType}</span>
                    </td>
                    <td className="mono">{a.action}</td>
                    <td className="dim">
                      {a.targetType ? `${a.targetType}:${a.targetId?.slice(0, 10) ?? ""}` : "—"}
                    </td>
                  </tr>
                ))}
                {audit.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="dim" style={{ padding: 20 }}>
                      No admin actions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
