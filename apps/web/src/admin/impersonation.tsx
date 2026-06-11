import { useSyncExternalStore } from "react";
import { useNavigate } from "react-router";

import { clearActAs, getActAs, subscribeActAs, type ActAsTarget } from "../../lib/impersonation";
import "./admin.css";

/** Live view of the god-mode target (null when not impersonating). */
export function useActAs(): ActAsTarget | null {
  return useSyncExternalStore(subscribeActAs, getActAs, () => null);
}

/**
 * Persistent banner shown while an admin views the app as another user.
 * English on purpose: it is part of the operator surface, and it must be
 * unmistakable regardless of the impersonated user's locale.
 */
export function ImpersonationBanner({ target }: { target: ActAsTarget }) {
  const navigate = useNavigate();

  return (
    <div className="admin-impersonation-banner" role="alert" data-testid="impersonation-banner">
      <span>
        Viewing as <strong>{target.name || target.userId}</strong> — actions are executed as them
        and audited under your name.
      </span>
      <button
        type="button"
        className="exit"
        data-testid="impersonation-exit"
        onClick={() => {
          clearActAs();
          void navigate("/admin/users");
        }}
      >
        Exit god mode
      </button>
    </div>
  );
}
