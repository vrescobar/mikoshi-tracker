import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";

import { AppShell } from "../../components/app-shell/app-shell";
import { getSession, type SessionPayload } from "../../lib/auth-client";
import { routes } from "../../lib/navigation";
import { SessionProvider } from "./session";

type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; session: SessionPayload };

/**
 * Replaces app/(app)/layout.tsx: resolve the session before rendering any
 * protected content (nothing protected flashes while loading), redirect to
 * the auth page when there is none, and provide the session to all pages.
 */
export function ProtectedLayout() {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getSession().then(
      (session) => {
        if (cancelled) return;
        setState(session ? { status: "ready", session } : { status: "anonymous" });
      },
      () => {
        if (!cancelled) setState({ status: "anonymous" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  if (state.status === "loading") {
    return null;
  }

  if (state.status === "anonymous") {
    return <Navigate to={routes.auth} replace />;
  }

  const { session } = state;
  return (
    <SessionProvider
      value={{
        user: session.user,
        timezone: session.timezone,
        impersonating: session.impersonating,
        refresh,
      }}
    >
      <AppShell userEmail={session.user.email}>
        <Outlet />
      </AppShell>
    </SessionProvider>
  );
}
