import { useState } from "react";

import { api, type AuditEntry } from "../../../lib/admin-client";
import { useAsync } from "../../admin/lib/use-async";
import { DataTable, type DataTableColumn as Column } from "../../../components/ui";
import { Pager } from "./table-extras";
import { Drawer, JsonView, fmtDateTime } from "../../admin/ui";

const LIMIT = 50;

export function Audit() {
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const list = useAsync(() => api.admin.auditLog({ action: action || undefined, limit: LIMIT, offset }), [action, offset]);

  const cols: Column<AuditEntry>[] = [
    { header: "When", cell: (a) => <span className="dim">{fmtDateTime(a.createdAt)}</span> },
    { header: "Operator", cell: (a) => <span className="tag">{a.actorLabel ?? a.actorType}</span> },
    { header: "Action", cell: (a) => <span className="mono">{a.action}</span> },
    {
      header: "Target",
      cell: (a) => (a.targetType ? <span className="dim">{a.targetType}:{a.targetId?.slice(0, 12)}</span> : <span className="dim">—</span>),
    },
    { header: "", align: "right", cell: () => <span className="dim">Details ›</span> },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Audit log</h2>
          <div className="sub">Every admin action and impersonated mutation, newest first.</div>
        </div>
      </div>

      <div className="filters">
        <input
          placeholder="Filter by action (e.g. impersonate.events.eventsCreate)"
          value={action}
          onChange={(e) => {
            setOffset(0);
            setAction(e.target.value);
          }}
          style={{ minWidth: 360 }}
        />
      </div>

      <DataTable
        columns={cols}
        rows={list.data?.items ?? []}
        rowKey={(a) => a.id}
        loading={list.loading}
        error={list.error}
        onRowClick={(a) => setOpen(a)}
        empty={{ icon: "❑", title: "No audit entries" }}
        footer={
          list.data && list.data.total > LIMIT ? (
            <Pager total={list.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          ) : undefined
        }
      />

      {open && (
        <Drawer title="Audit entry" onClose={() => setOpen(null)}>
          <dl className="kv" style={{ marginBottom: 16 }}>
            <dt>When</dt>
            <dd>{fmtDateTime(open.createdAt)}</dd>
            <dt>Operator</dt>
            <dd>
              {open.actorLabel ?? "—"} <span className="dim">({open.actorType})</span>
            </dd>
            <dt>Action</dt>
            <dd className="mono">{open.action}</dd>
            <dt>Target</dt>
            <dd>{open.targetType ? `${open.targetType}:${open.targetId}` : "—"}</dd>
          </dl>
          <h3 style={{ marginBottom: 8 }}>Metadata</h3>
          <JsonView value={open.metadata} />
        </Drawer>
      )}
    </>
  );
}
