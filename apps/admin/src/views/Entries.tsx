import { useState } from "react";

import { api, type AdminEntry } from "../lib/api";
import { useAsync, errorMessage } from "../lib/useAsync";
import { navigate } from "../lib/router";
import { DataTable, Pager, SearchBox, type Column } from "../components/DataTable";
import { Pill, fmtDate, useToast } from "../components/ui";
import { prefetchAllUsers, userLabel } from "../lib/userCache";

const LIMIT = 50;

export function Entries() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [slug, setSlug] = useState("");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const users = useAsync(() => prefetchAllUsers(), []);
  const list = useAsync(
    () => api.admin.listEntries({ q: q || undefined, entryTypeSlug: slug || undefined, limit: LIMIT, offset }),
    [q, slug, offset],
  );
  // `users.data` is referenced so the table re-renders once names resolve.
  void users.data;

  const archiveToggle = async (e: AdminEntry) => {
    setBusy(e.id);
    try {
      const act = api.asUser(e.userId);
      if (e.isActive) await act.archiveEntry(e.id);
      else await act.restoreEntry(e.id);
      toast.ok(e.isActive ? "Archived" : "Restored");
      list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const cols: Column<AdminEntry>[] = [
    { header: "Name", cell: (e) => <span className="strong">{e.name}</span> },
    { header: "Type", cell: (e) => <span className="tag">{e.entryTypeSlug}</span> },
    {
      header: "Owner",
      cell: (e) => (
        <button
          className="btn link"
          style={{ padding: 0 }}
          onClick={() => navigate(`users/${encodeURIComponent(e.userId)}`)}
        >
          {userLabel(e.userId)}
        </button>
      ),
    },
    { header: "Status", cell: (e) => (e.isActive ? <Pill kind="active">active</Pill> : <Pill kind="archived">archived</Pill>) },
    { header: "Created", cell: (e) => <span className="dim">{fmtDate(e.createdAt)}</span> },
    {
      header: "",
      align: "right",
      cell: (e) => (
        <div className="row-actions">
          <button className="btn ghost sm" disabled={busy === e.id} onClick={() => void archiveToggle(e)}>
            {e.isActive ? "Archive" : "Restore"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Entries</h2>
          <div className="sub">Every habit, journal and log across all users.</div>
        </div>
      </div>

      <div className="filters">
        <SearchBox
          value={q}
          onChange={(v) => {
            setOffset(0);
            setQ(v);
          }}
          placeholder="Search entry names…"
        />
        <input
          placeholder="Filter by type slug…"
          value={slug}
          onChange={(e) => {
            setOffset(0);
            setSlug(e.target.value);
          }}
        />
      </div>

      <DataTable
        columns={cols}
        rows={list.data?.items ?? []}
        rowKey={(e) => e.id}
        loading={list.loading}
        error={list.error}
        empty={{ icon: "≣", title: "No entries match" }}
        footer={
          list.data && list.data.total > LIMIT ? (
            <Pager total={list.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          ) : undefined
        }
      />
    </>
  );
}
