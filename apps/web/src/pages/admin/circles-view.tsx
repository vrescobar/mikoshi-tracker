import { useState } from "react";
import { useNavigate } from "react-router";

import { api, type AdminCircle } from "../../../lib/admin-client";
import { useAsync, errorMessage } from "../../admin/lib/use-async";
import { DataTable, type DataTableColumn as Column } from "../../../components/ui";
import { Pager, SearchBox } from "./table-extras";
import { Field, Modal, Pill, useToast } from "../../admin/ui";

const LIMIT = 50;

export function Circles() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const list = useAsync(() => api.admin.listCircles({ q: q || undefined, limit: LIMIT, offset }), [q, offset]);

  const cols: Column<AdminCircle>[] = [
    { header: "Name", cell: (c) => <span className="strong">{c.name}</span> },
    { header: "Status", cell: (c) => <Pill kind={c.status}>{c.status}</Pill> },
    { header: "Season", cell: (c) => (c.season ? <span className="tag">{c.season}</span> : <span className="dim">—</span>) },
    { header: "Members", cell: (c) => c.memberCount },
    { header: "Mode", cell: (c) => <span className="dim">{c.leaderboardMode}</span> },
    {
      header: "Contest window",
      cell: (c) =>
        c.contestStartAt ? (
          <span className="dim">
            {c.contestStartAt.slice(0, 10)} → {c.contestEndAt?.slice(0, 10) ?? "…"}
          </span>
        ) : (
          <span className="dim">—</span>
        ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Circles</h2>
          <div className="sub">Every contest circle. Open one for members, contest config and snapshots.</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setCreating(true)}>
            + New circle
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
          placeholder="Search circles…"
        />
      </div>

      <DataTable
        columns={cols}
        rows={list.data?.items ?? []}
        rowKey={(c) => c.id}
        loading={list.loading}
        error={list.error}
        onRowClick={(c) => navigate(`/admin/circles/${encodeURIComponent(c.id)}`)}
        empty={{ icon: "◍", title: "No circles yet" }}
        footer={
          list.data && list.data.total > LIMIT ? (
            <Pager total={list.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          ) : undefined
        }
      />

      {creating && (
        <CreateCircleModal
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            if (id) navigate(`/admin/circles/${encodeURIComponent(id)}`);
            else list.reload();
          }}
        />
      )}
    </>
  );
}

function CreateCircleModal({ onClose, onDone }: { onClose: () => void; onDone: (id?: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [ownerExternalId, setOwnerExternalId] = useState("");
  const [season, setSeason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.admin.createCircle({
        name: name.trim(),
        ownerExternalId: ownerExternalId.trim(),
        season: season.trim() || undefined,
      });
      toast.ok("Circle created");
      if (res.circleToken) toast.info(`Circle token (shown once): ${res.circleToken}`);
      onDone(res.circle.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New circle"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => void submit()}
            disabled={busy || !name.trim() || !ownerExternalId.trim()}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </>
      }
    >
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bikini 2026" />
      </Field>
      <Field label="Owner external ID" hint="A provisioned user who owns the circle.">
        <input value={ownerExternalId} onChange={(e) => setOwnerExternalId(e.target.value)} placeholder="mikoshi-identity-…" />
      </Field>
      <Field label="Season">
        <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Optional, e.g. bikini-2026" />
      </Field>
    </Modal>
  );
}
