import { useState } from "react";

import { api, type AdminTokenMeta } from "../lib/api";
import { useAsync, errorMessage } from "../lib/useAsync";
import { DataTable, type Column } from "../components/DataTable";
import { ConfirmDialog, Field, Modal, Pill, fmtDateTime, useToast } from "../components/ui";

export function Tokens() {
  const toast = useToast();
  const list = useAsync(() => api.admin.listTokens(), []);
  const [minting, setMinting] = useState(false);
  const [revoke, setRevoke] = useState<AdminTokenMeta | null>(null);
  const [busy, setBusy] = useState(false);

  const doRevoke = async (t: AdminTokenMeta) => {
    setBusy(true);
    try {
      await api.admin.revokeToken(t.tokenId);
      toast.ok("Token revoked");
      setRevoke(null);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cols: Column<AdminTokenMeta>[] = [
    { header: "Label", cell: (t) => <span className="strong">{t.label}</span> },
    { header: "Status", cell: (t) => (t.revoked ? <Pill kind="revoked">revoked</Pill> : <Pill kind="active">active</Pill>) },
    { header: "Last used", cell: (t) => <span className="dim">{t.lastUsedAt ? fmtDateTime(t.lastUsedAt) : "never"}</span> },
    { header: "Created", cell: (t) => <span className="dim">{fmtDateTime(t.createdAt)}</span> },
    {
      header: "",
      align: "right",
      cell: (t) =>
        !t.revoked ? (
          <button className="btn danger sm" onClick={() => setRevoke(t)}>
            Revoke
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Admin tokens</h2>
          <div className="sub">Named operator credentials. Each action they take is attributed in the audit log.</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setMinting(true)}>
            + Mint token
          </button>
        </div>
      </div>

      <DataTable
        columns={cols}
        rows={list.data?.tokens ?? []}
        rowKey={(t) => t.tokenId}
        loading={list.loading}
        error={list.error}
        empty={{ icon: "⚿", title: "No named tokens" }}
      />

      {minting && (
        <MintModal
          onClose={() => setMinting(false)}
          onDone={() => {
            setMinting(false);
            list.reload();
          }}
        />
      )}
      {revoke && (
        <ConfirmDialog
          title="Revoke token"
          message={`Revoke "${revoke.label}"? Any caller using it will be denied immediately.`}
          confirmLabel="Revoke"
          danger
          busy={busy}
          onCancel={() => setRevoke(null)}
          onConfirm={() => void doRevoke(revoke)}
        />
      )}
    </>
  );
}

function MintModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.admin.mintToken(label.trim());
      setMinted(res.token);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (minted) {
    return (
      <Modal
        title="Token minted"
        onClose={() => {
          onDone();
        }}
        footer={
          <button className="btn" onClick={onDone}>
            Done
          </button>
        }
      >
        <p className="dim" style={{ marginTop: 0 }}>
          Copy this now — it is shown only once.
        </p>
        <pre className="json">{minted}</pre>
        <button
          className="btn ghost sm"
          onClick={() => {
            void navigator.clipboard?.writeText(minted);
            toast.ok("Copied");
          }}
        >
          Copy
        </button>
      </Modal>
    );
  }

  return (
    <Modal
      title="Mint admin token"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy || !label.trim()}>
            {busy ? "Minting…" : "Mint"}
          </button>
        </>
      }
    >
      <Field label="Label" hint="A human-readable operator name, e.g. mikoshi-bot.">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="operator label" />
      </Field>
    </Modal>
  );
}
