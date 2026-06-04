import { useState } from "react";

import { api, type AdminUser } from "../lib/api";
import { useAsync, errorMessage } from "../lib/useAsync";
import { navigate } from "../lib/router";
import { DataTable, Pager, SearchBox, type Column } from "../components/DataTable";
import { Field, Modal, Pill, fmtDate, useToast } from "../components/ui";
import { cacheUsers } from "../lib/userCache";

const LIMIT = 50;

export function Users() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const list = useAsync(
    () => api.admin.listUsers({ q: q || undefined, limit: LIMIT, offset }).then((r) => (cacheUsers(r.items), r)),
    [q, offset],
  );

  const columns: Column<AdminUser>[] = [
    {
      header: "Name",
      cell: (u) => <span className="strong">{u.name || "—"}</span>,
    },
    { header: "Email", cell: (u) => <span className="dim">{u.email || "—"}</span> },
    {
      header: "External ID",
      cell: (u) => (u.externalId ? <span className="tag">{u.externalId}</span> : <span className="dim">—</span>),
    },
    { header: "Role", cell: (u) => (u.isAdmin ? <Pill kind="info">admin</Pill> : <span className="dim">user</span>) },
    { header: "Timezone", cell: (u) => <span className="dim">{u.timezone}</span> },
    { header: "Joined", cell: (u) => <span className="dim">{fmtDate(u.createdAt)}</span> },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Users</h2>
          <div className="sub">Every account. Open one to manage their habits, history and circles.</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setCreating(true)}>
            + Provision user
          </button>
        </div>
      </div>

      <div className="filters">
        <SearchBox
          value={q}
          onChange={(v) => {
            setOffset(0);
            setQ(v);
          }}
          placeholder="Search by name, email or external id…"
        />
      </div>

      <DataTable
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(u) => u.id}
        loading={list.loading}
        error={list.error}
        onRowClick={(u) => navigate(`users/${encodeURIComponent(u.id)}`)}
        empty={{ icon: "◎", title: "No users found", hint: q ? "Try a different search." : undefined }}
        footer={
          list.data && list.data.total > LIMIT ? (
            <Pager total={list.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          ) : undefined
        }
      />

      {creating && (
        <ProvisionUserModal
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function ProvisionUserModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [externalId, setExternalId] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.admin.provisionUser({
        externalId: externalId.trim(),
        name: name.trim() || undefined,
        timezone: timezone.trim() || undefined,
      });
      toast.ok(res.alreadyExists ? "User already existed" : "User provisioned");
      if (res.personalToken) toast.info(`Personal token (shown once): ${res.personalToken}`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Provision user"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy || externalId.trim().length === 0}>
            {busy ? "Creating…" : "Provision"}
          </button>
        </>
      }
    >
      <Field label="External ID" hint="Opaque Mikoshi identity (required, unique).">
        <input value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="mikoshi-identity-…" />
      </Field>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional display name" />
      </Field>
      <Field label="Timezone">
        <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. Europe/Madrid" />
      </Field>
    </Modal>
  );
}
