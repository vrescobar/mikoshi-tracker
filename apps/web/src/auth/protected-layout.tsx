import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";

import { AppShell } from "../../components/app-shell/app-shell";
import { useLocale } from "../../components/locale";
import { Button, PageFrame, StatePanel } from "../../components/ui";
import { getSession, type SessionPayload } from "../../lib/auth-client";
import { routes } from "../../lib/navigation";
import { SessionProvider } from "./session";

type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "error" }
  | { status: "ready"; session: SessionPayload };

/**
 * Replaces app/(app)/layout.tsx: resolve the session before rendering any
 * protected content (nothing protected flashes while loading), redirect to
 * the auth page when there is none, and provide the session to all pages.
 *
 * A getSession() REJECTION (network error, API restarting during a deploy,
 * 5xx) is NOT "anonymous": redirecting a valid session to the login form on a
 * transient failure looks like a logout. It renders a retryable error panel.
 */
export function ProtectedLayout() {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const { copy } = useLocale();

  useEffect(() => {
    let cancelled = false;
    getSession().then(
      (session) => {
        if (cancelled) return;
        setState(session ? { status: "ready", session } : { status: "anonymous" });
      },
      () => {
        if (!cancelled) setState({ status: "error" });
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

  if (state.status === "error") {
    return (
      <PageFrame>
        <StatePanel
          tone="danger"
          eyebrow={copy.shared.pageLoadError.eyebrow}
          title={copy.shared.pageLoadError.title}
          description={copy.shared.pageLoadError.description}
          testId="session-load-error"
          actions={
            <Button type="button" onClick={refresh}>
              {copy.shared.pageLoadError.retry}
            </Button>
          }
        />
      </PageFrame>
    );
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
