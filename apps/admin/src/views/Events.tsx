import { useState } from "react";

import { api, type AdminEvent } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { DataTable, Pager, type Column } from "../components/DataTable";
import { Pill, fmtDateTime } from "../components/ui";
import { EventDrawer } from "./UserDetail";

const LIMIT = 50;

export function Events() {
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<AdminEvent | null>(null);
  const list = useAsync(
    () =>
      api.admin.listEvents({
        userId: userId || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: LIMIT,
        offset,
      }),
    [userId, from, to, offset],
  );

  const cols: Column<AdminEvent>[] = [
    { header: "Date", cell: (e) => <span className="strong">{e.dateKey}</span> },
    { header: "Occurred", cell: (e) => <span className="dim">{fmtDateTime(e.occurredAt)}</span> },
    { header: "User", cell: (e) => <span className="mono">{e.userId.slice(0, 12)}</span> },
    { header: "Entry", cell: (e) => <span className="mono">{e.entryId.slice(0, 12)}</span> },
    {
      header: "Completed",
      cell: (e) =>
        e.completed === null ? <span className="dim">—</span> : e.completed ? <Pill kind="ok">yes</Pill> : <Pill>no</Pill>,
    },
    { header: "", align: "right", cell: () => <span className="dim">Open ›</span> },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Events</h2>
          <div className="sub">The global check-in &amp; log feed. Open one to edit, undo or delete it.</div>
        </div>
      </div>

      <div className="filters">
        <input
          placeholder="Filter by user id…"
          value={userId}
          onChange={(e) => {
            setOffset(0);
            setUserId(e.target.value);
          }}
        />
        <label className="dim">
          from <input type="date" value={from} onChange={(e) => (setOffset(0), setFrom(e.target.value))} />
        </label>
        <label className="dim">
          to <input type="date" value={to} onChange={(e) => (setOffset(0), setTo(e.target.value))} />
        </label>
      </div>

      <DataTable
        columns={cols}
        rows={list.data?.items ?? []}
        rowKey={(e) => e.id}
        loading={list.loading}
        error={list.error}
        onRowClick={(e) => setOpen(e)}
        empty={{ icon: "⤳", title: "No events match" }}
        footer={
          list.data && list.data.total > LIMIT ? (
            <Pager total={list.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          ) : undefined
        }
      />

      {open && (
        <EventDrawer
          userId={open.userId}
          eventId={open.id}
          onClose={() => setOpen(null)}
          onChanged={list.reload}
        />
      )}
    </>
  );
}
