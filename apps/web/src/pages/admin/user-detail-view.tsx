import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { setActAs } from "../../../lib/impersonation";

import { api, type AdminEntry, type AdminEvent, type AdminUser, type TodayItem } from "../../../lib/admin-client";
import { useAsync, errorMessage } from "../../admin/lib/use-async";
import { resolveUser } from "../../admin/lib/user-cache";
import { DataTable, type DataTableColumn as Column } from "../../../components/ui";
import { PlanTab } from "./plan-tab";
import { DietTab } from "./diet-tab";
import {
  ConfirmDialog,
  Drawer,
  ErrorBanner,
  Field,
  JsonView,
  Loading,
  Modal,
  Pill,
  fmtDate,
  fmtDateTime,
  initials,
  useToast,
} from "../../admin/ui";

type Tab = "habits" | "plan" | "diet" | "history" | "circles" | "account";

const TAB_LABELS: Record<Tab, string> = {
  habits: "Habits",
  plan: "Plan",
  diet: "Diet",
  history: "History",
  circles: "Circles",
  account: "Account",
};

export function UserDetail() {
  const { userId = "" } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const user = useAsync(() => resolveUser(userId), [userId]);
  const [tab, setTab] = useState<Tab>("habits");

  if (user.error) return <ErrorBanner message={user.error} />;
  if (user.loading) return <Loading />;

  const u = user.data;
  const name = u?.name || userId;

  return (
    <>
      <div className="page-head">
        <button className="btn link" onClick={() => navigate("/admin/users")}>
          ← Users
        </button>
      </div>

      <div className="card profile-head">
        <div className="avatar">{initials(name)}</div>
        <div className="meta">
          <div className="name">{name}</div>
          <div className="row">
            <span>{u?.email || "no email"}</span>
            {u?.externalId && <span className="tag">{u.externalId}</span>}
            {u?.isAdmin && <Pill kind="info">admin</Pill>}
            <span>{u?.timezone}</span>
          </div>
        </div>
        <div className="actions">
          <button
            className="btn"
            data-testid="view-as-user"
            onClick={() => {
              if (
                window.confirm(
                  `View the app as ${name}? Actions you take run as them and are audited under your name.`,
                )
              ) {
                setActAs({ userId, name });
                void navigate("/dashboard");
              }
            }}
          >
            View as user
          </button>
          <button className="btn ghost" onClick={() => void loginAs(userId)}>
            Login as ↗
          </button>
        </div>
      </div>

      <div className="tabs">
        {(["habits", "plan", "diet", "history", "circles", "account"] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "habits" && <HabitsTab userId={userId} />}
      {tab === "plan" && <PlanTab userId={userId} />}
      {tab === "diet" && <DietTab userId={userId} />}
      {tab === "history" && <HistoryTab userId={userId} />}
      {tab === "circles" && <CirclesTab userId={userId} />}
      {tab === "account" && <AccountTab user={u} userId={userId} onChanged={user.reload} />}
    </>
  );
}

async function loginAs(userId: string) {
  try {
    const { url } = await api.admin.loginAs(userId);
    window.open(url, "_blank", "noopener");
  } catch {
    /* surfaced by toast elsewhere; window stays */
  }
}

// ── Habits tab ───────────────────────────────────────────────────────────────

function HabitsTab({ userId }: { userId: string }) {
  const toast = useToast();
  const today = useAsync(() => api.asUser(userId).today(), [userId]);
  const entries = useAsync(() => api.admin.listEntries({ userId, limit: 200 }), [userId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const act = api.asUser(userId);

  const mark = async (item: TodayItem, kind: "complete" | "undo") => {
    setBusy(item.habitId);
    try {
      if (kind === "complete") {
        if (item.kind === "quantity") {
          const target = item.progress?.targetValue ?? 1;
          await act.setTotal(item.habitId, target);
        } else {
          await act.complete(item.habitId);
        }
        toast.ok("Marked complete");
      } else {
        await act.undoCheckin(item.habitId);
        toast.ok("Check-in undone");
      }
      today.reload();
      entries.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const archiveToggle = async (e: AdminEntry) => {
    setBusy(e.id);
    try {
      if (e.isActive) await act.archiveEntry(e.id);
      else await act.restoreEntry(e.id);
      toast.ok(e.isActive ? "Archived" : "Restored");
      entries.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const todayItems = today.data ? [...today.data.summary.pendingItems, ...today.data.summary.completedItems] : [];

  const cols: Column<AdminEntry>[] = [
    { header: "Name", cell: (e) => <span className="strong">{e.name}</span> },
    { header: "Type", cell: (e) => <span className="tag">{e.entryTypeSlug}</span> },
    {
      header: "Status",
      cell: (e) => (e.isActive ? <Pill kind="active">active</Pill> : <Pill kind="archived">archived</Pill>),
    },
    { header: "Created", cell: (e) => <span className="dim">{fmtDate(e.createdAt)}</span> },
    {
      header: "",
      align: "right",
      cell: (e) => (
        <div className="row-actions">
          <button className="btn ghost sm" disabled={busy === e.id} onClick={() => setEditing(e)}>
            Edit
          </button>
          <button className="btn ghost sm" disabled={busy === e.id} onClick={() => void archiveToggle(e)}>
            {e.isActive ? "Archive" : "Restore"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="section">
        <div className="section-head">
          <h3>Today</h3>
          <span className="count">
            {today.data ? `${today.data.summary.completedCount}/${today.data.summary.totalCount} done` : ""}
          </span>
        </div>
        {today.error ? (
          <ErrorBanner message={today.error} />
        ) : !today.data ? (
          <Loading />
        ) : todayItems.length === 0 ? (
          <div className="card pad dim">No habits scheduled for today.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Habit</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }} />
                </tr>
              </thead>
              <tbody>
                {todayItems.map((it) => (
                  <tr key={it.habitId}>
                    <td className="strong">{it.name}</td>
                    <td className="dim">{it.kind}</td>
                    <td>
                      <Pill kind={it.status}>{it.status}</Pill>
                    </td>
                    <td className="actions">
                      <div className="row-actions">
                        {it.status === "completed" ? (
                          <button className="btn ghost sm" disabled={busy === it.habitId || !it.canUndo} onClick={() => void mark(it, "undo")}>
                            Undo
                          </button>
                        ) : (
                          <button className="btn sm" disabled={busy === it.habitId} onClick={() => void mark(it, "complete")}>
                            Mark done
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h3>All habits & entries</h3>
          <span className="count">{entries.data?.total ?? 0}</span>
          <div className="actions">
            <button className="btn" onClick={() => setCreating(true)}>
              + New entry
            </button>
          </div>
        </div>
        <DataTable
          columns={cols}
          rows={entries.data?.items ?? []}
          rowKey={(e) => e.id}
          loading={entries.loading}
          error={entries.error}
          empty={{ icon: "≣", title: "No entries yet" }}
        />
      </div>

      {editing && (
        <EditEntryModal
          userId={userId}
          entry={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            entries.reload();
          }}
        />
      )}
      {creating && (
        <CreateEntryModal
          userId={userId}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            entries.reload();
            today.reload();
          }}
        />
      )}
    </>
  );
}

function EditEntryModal({
  userId,
  entry,
  onClose,
  onDone,
}: {
  userId: string;
  entry: AdminEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const detail = useAsync(() => api.asUser(userId).getEntry(entry.id), [userId, entry.id]);
  const [name, setName] = useState(entry.name);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (detail.data && !loaded) {
    setDescription(detail.data.description ?? "");
    setCategory(detail.data.category ?? "");
    setLoaded(true);
  }

  const submit = async () => {
    setBusy(true);
    try {
      await api.asUser(userId).updateEntry({
        entryId: entry.id,
        name: name.trim() || undefined,
        description: description.trim() || null,
        category: category.trim() || null,
      });
      toast.ok("Entry updated");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Edit entry"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Category">
        <input value={category} onChange={(e) => setCategory(e.target.value)} />
      </Field>
    </Modal>
  );
}

function CreateEntryModal({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const types = useAsync(() => api.asUser(userId).listEntryTypes(), [userId]);
  const [name, setName] = useState("");
  const [entryTypeSlug, setEntryTypeSlug] = useState("");
  const [kind, setKind] = useState<"boolean" | "quantity">("boolean");
  const [busy, setBusy] = useState(false);

  const isHabit = entryTypeSlug.startsWith("habit");

  const submit = async () => {
    setBusy(true);
    try {
      await api.asUser(userId).createEntry({
        name: name.trim(),
        entryTypeSlug,
        ...(isHabit ? { config: { kind } } : {}),
      });
      toast.ok("Entry created");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New entry"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => void submit()}
            disabled={busy || name.trim().length === 0 || !entryTypeSlug}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </>
      }
    >
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning run" />
      </Field>
      <Field label="Entry type">
        <select value={entryTypeSlug} onChange={(e) => setEntryTypeSlug(e.target.value)}>
          <option value="">Select…</option>
          {(types.data?.items ?? []).map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.displayName} ({t.slug})
            </option>
          ))}
        </select>
      </Field>
      {isHabit && (
        <Field label="Habit kind">
          <select value={kind} onChange={(e) => setKind(e.target.value as "boolean" | "quantity")}>
            <option value="boolean">boolean (yes/no)</option>
            <option value="quantity">quantity (numeric)</option>
          </select>
        </Field>
      )}
    </Modal>
  );
}

// ── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ userId }: { userId: string }) {
  const events = useAsync(() => api.admin.listEvents({ userId, limit: 200 }), [userId]);
  const [open, setOpen] = useState<string | null>(null);

  const cols: Column<AdminEvent>[] = [
    { header: "Date", cell: (e) => <span className="strong">{e.dateKey}</span> },
    { header: "Occurred", cell: (e) => <span className="dim">{fmtDateTime(e.occurredAt)}</span> },
    { header: "Entry", cell: (e) => <span className="mono">{e.entryId.slice(0, 12)}</span> },
    {
      header: "Completed",
      cell: (e) =>
        e.completed === null ? <span className="dim">—</span> : e.completed ? <Pill kind="ok">yes</Pill> : <Pill>no</Pill>,
    },
    { header: "", align: "right", cell: () => <span className="dim">Open ›</span> },
  ];

  return (
    <div className="section">
      <div className="section-head">
        <h3>Event history</h3>
        <span className="count">{events.data?.total ?? 0}</span>
      </div>
      <DataTable
        columns={cols}
        rows={events.data?.items ?? []}
        rowKey={(e) => e.id}
        loading={events.loading}
        error={events.error}
        onRowClick={(e) => setOpen(e.id)}
        empty={{ icon: "⤳", title: "No events logged" }}
      />
      {open && <EventDrawer userId={userId} eventId={open} onClose={() => setOpen(null)} onChanged={events.reload} />}
    </div>
  );
}

export function EventDrawer({
  userId,
  eventId,
  onClose,
  onChanged,
}: {
  userId: string;
  eventId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const detail = useAsync(() => api.asUser(userId).getEvent(eventId), [userId, eventId]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = api.asUser(userId);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.ok(ok);
      detail.reload();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const ev = detail.data;

  return (
    <Drawer
      title="Event detail"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" disabled={busy} onClick={() => void run(() => act.undoEvent(eventId), "Undone")}>
            Undo last
          </button>
          <button className="btn danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </>
      }
    >
      {detail.error ? (
        <ErrorBanner message={detail.error} />
      ) : !ev ? (
        <Loading />
      ) : (
        <>
          <dl className="kv" style={{ marginBottom: 18 }}>
            <dt>Date</dt>
            <dd>{ev.dateKey}</dd>
            <dt>Occurred</dt>
            <dd>{fmtDateTime(ev.occurredAt)}</dd>
            <dt>Value</dt>
            <dd>{ev.value ?? "—"}</dd>
            <dt>Completed</dt>
            <dd>{ev.completed === null ? "—" : String(ev.completed)}</dd>
          </dl>

          <div className="section">
            <div className="section-head">
              <h3>Payload</h3>
            </div>
            <JsonView value={ev.payload} />
          </div>

          <div className="section">
            <div className="section-head">
              <h3>Mutation history</h3>
              <span className="count">{ev.mutations?.length ?? 0}</span>
            </div>
            <div className="timeline">
              {(ev.mutations ?? []).map((m, i, arr) => (
                <div className="item" key={m.id}>
                  <div className="rail">
                    <div className="dot" />
                    {i < arr.length - 1 && <div className="line" />}
                  </div>
                  <div className="body">
                    <div className="head">
                      <Pill>{m.type}</Pill>
                      <span className="tag">{m.source}</span>
                      <span className="when">{fmtDateTime(m.createdAt)}</span>
                    </div>
                    {m.note && <div className="dim" style={{ marginTop: 4 }}>{m.note}</div>}
                  </div>
                </div>
              ))}
              {(ev.mutations ?? []).length === 0 && <span className="dim">No mutations.</span>}
            </div>
          </div>
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete event"
          message="This soft-deletes the event (history is preserved). Continue?"
          confirmLabel="Delete"
          danger
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            void run(() => act.deleteEvent(eventId), "Event deleted").then(() => {
              setConfirmDelete(false);
              onClose();
            })
          }
        />
      )}
    </Drawer>
  );
}

// ── Circles tab ──────────────────────────────────────────────────────────────

function CirclesTab({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const circles = useAsync(() => api.asUser(userId).listCircles(), [userId]);

  const cols: Column<{ id: string; name: string; ownerId: string; createdAt: string }>[] = [
    { header: "Name", cell: (c) => <span className="strong">{c.name}</span> },
    {
      header: "Role",
      cell: (c) => (c.ownerId === userId ? <Pill kind="info">owner</Pill> : <span className="dim">member</span>),
    },
    { header: "Created", cell: (c) => <span className="dim">{fmtDate(c.createdAt)}</span> },
    { header: "", align: "right", cell: () => <span className="dim">Open ›</span> },
  ];

  return (
    <div className="section">
      <div className="section-head">
        <h3>Circles</h3>
        <span className="count">{circles.data?.total ?? 0}</span>
      </div>
      <DataTable
        columns={cols}
        rows={circles.data?.items ?? []}
        rowKey={(c) => c.id}
        loading={circles.loading}
        error={circles.error}
        onRowClick={(c) => navigate(`/admin/circles/${encodeURIComponent(c.id)}`)}
        empty={{ icon: "◍", title: "Not in any circle" }}
      />
    </div>
  );
}

// ── Account tab ──────────────────────────────────────────────────────────────

function AccountTab({
  user,
  userId,
  onChanged,
}: {
  user: AdminUser | null;
  userId: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const token = useAsync(() => api.admin.userTokenMeta(userId), [userId]);
  const [busy, setBusy] = useState(false);
  const [extId, setExtId] = useState("");
  const [mergeSource, setMergeSource] = useState("");

  const ensureToken = async () => {
    setBusy(true);
    try {
      const res = await api.admin.ensureUserToken(userId);
      if (res.token) toast.info(`Token (shown once): ${res.token}`);
      else toast.ok("User already has a token");
      token.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    setBusy(true);
    try {
      await api.admin.attachExternalId(userId, extId.trim(), true);
      toast.ok("External ID attached");
      setExtId("");
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const merge = async () => {
    setBusy(true);
    try {
      await api.admin.mergeUsers(mergeSource.trim(), userId);
      toast.ok("Users merged into this account");
      setMergeSource("");
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid-2">
      <div className="card pad">
        <h3 style={{ marginBottom: 12 }}>Identity</h3>
        <dl className="kv">
          <dt>User ID</dt>
          <dd className="mono">{userId}</dd>
          <dt>External ID</dt>
          <dd>{user?.externalId ?? "—"}</dd>
          <dt>Email</dt>
          <dd>{user?.email || "—"}</dd>
          <dt>Admin</dt>
          <dd>{user?.isAdmin ? "yes" : "no"}</dd>
        </dl>
        <Field label="Attach / change external ID" hint="Force-overwrites any existing value.">
          <div className="inline-actions">
            <input value={extId} onChange={(e) => setExtId(e.target.value)} placeholder="mikoshi-identity-…" />
            <button className="btn ghost" disabled={busy || !extId.trim()} onClick={() => void attach()}>
              Attach
            </button>
          </div>
        </Field>
      </div>

      <div className="card pad">
        <h3 style={{ marginBottom: 12 }}>Personal token</h3>
        <dl className="kv" style={{ marginBottom: 12 }}>
          <dt>Has token</dt>
          <dd>{token.data ? (token.data.hasToken ? "yes" : "no") : "…"}</dd>
          <dt>Updated</dt>
          <dd>{token.data?.updatedAt ? fmtDate(token.data.updatedAt) : "—"}</dd>
        </dl>
        <button className="btn ghost" disabled={busy} onClick={() => void ensureToken()}>
          Ensure token
        </button>

        <h3 style={{ margin: "22px 0 12px" }}>Merge duplicate</h3>
        <Field label="Source user ID" hint="The source account is merged into this one, then deleted.">
          <div className="inline-actions">
            <input value={mergeSource} onChange={(e) => setMergeSource(e.target.value)} placeholder="user_…" />
            <button className="btn danger" disabled={busy || !mergeSource.trim()} onClick={() => void merge()}>
              Merge in
            </button>
          </div>
        </Field>
      </div>
    </div>
  );
}
