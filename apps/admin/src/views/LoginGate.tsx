import { useState } from "react";

import { api, ApiError } from "../lib/api";
import { clearAdminKey, setAdminKey } from "../lib/auth";

export function LoginGate({ onAuthed }: { onAuthed: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setAdminKey(key.trim());
    try {
      await api.admin.dashboard(); // validates the key against a god-mode endpoint
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
        <div className="brandmark">
          <span className="dot" />
          <span>MikoshiTracker</span>
        </div>
        <h1>Admin God Mode</h1>
        <p className="dim" style={{ margin: "8px 0 0" }}>
          Paste the operator admin API key. It is stored in this browser until you Lock.
        </p>
        <input
          type="password"
          placeholder="MIKOSHI_TRACKER_ADMIN_API_KEY"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        <button className="btn" onClick={() => void submit()} disabled={busy || key.trim().length === 0}>
          {busy ? "Verifying…" : "Unlock"}
        </button>
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}
