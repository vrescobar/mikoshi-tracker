import { useState } from "react";

import { getAdminKey, clearAdminKey } from "./lib/auth";
import { useHashRoute, navigate, type Route } from "./lib/router";
import { getCachedUser } from "./lib/userCache";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/ui";
import { LoginGate } from "./views/LoginGate";
import { Dashboard } from "./views/Dashboard";
import { Users } from "./views/Users";
import { UserDetail } from "./views/UserDetail";
import { Circles } from "./views/Circles";
import { CircleDetail } from "./views/CircleDetail";
import { Entries } from "./views/Entries";
import { Events } from "./views/Events";
import { Audit } from "./views/Audit";
import { Tokens } from "./views/Tokens";

function operatorLabel(): string | null {
  // The key is opaque; we surface a stable short fingerprint, not the secret.
  const key = getAdminKey();
  if (!key) return null;
  return "root";
}

function crumbsFor(route: Route): React.ReactNode {
  switch (route.name) {
    case "dashboard":
      return "Dashboard";
    case "users":
      return "Users";
    case "user":
      return (
        <>
          <button className="btn link" onClick={() => navigate("users")}>
            Users
          </button>
          <span className="sep">/</span>
          <span className="dim">{getCachedUser(route.id)?.name ?? route.id.slice(0, 12)}</span>
        </>
      );
    case "circles":
      return "Circles";
    case "circle":
      return (
        <>
          <button className="btn link" onClick={() => navigate("circles")}>
            Circles
          </button>
          <span className="sep">/</span>
          <span className="dim">{route.id.slice(0, 12)}</span>
        </>
      );
    case "entries":
      return "Entries";
    case "events":
      return "Events";
    case "audit":
      return "Audit log";
    case "tokens":
      return "Admin tokens";
  }
}

function ViewFor({ route }: { route: Route }) {
  switch (route.name) {
    case "dashboard":
      return <Dashboard />;
    case "users":
      return <Users />;
    case "user":
      return <UserDetail userId={route.id} />;
    case "circles":
      return <Circles />;
    case "circle":
      return <CircleDetail circleId={route.id} />;
    case "entries":
      return <Entries />;
    case "events":
      return <Events />;
    case "audit":
      return <Audit />;
    case "tokens":
      return <Tokens />;
  }
}

export function App() {
  const [authed, setAuthed] = useState<boolean>(Boolean(getAdminKey()));
  const route = useHashRoute();

  if (!authed) {
    return (
      <ToastProvider>
        <LoginGate onAuthed={() => setAuthed(true)} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <AppShell
        route={route}
        operatorLabel={operatorLabel()}
        crumbs={crumbsFor(route)}
        onLock={() => {
          clearAdminKey();
          setAuthed(false);
        }}
      >
        <ViewFor route={route} />
      </AppShell>
    </ToastProvider>
  );
}
