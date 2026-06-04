import type { ReactNode } from "react";

import { navigate, type Route } from "../lib/router";

const NAV: { group: string; items: { key: Route["name"]; label: string; icon: string; path: string }[] }[] = [
  {
    group: "Overview",
    items: [{ key: "dashboard", label: "Dashboard", icon: "▦", path: "dashboard" }],
  },
  {
    group: "People & circles",
    items: [
      { key: "users", label: "Users", icon: "◎", path: "users" },
      { key: "circles", label: "Circles", icon: "◍", path: "circles" },
    ],
  },
  {
    group: "Data",
    items: [
      { key: "entries", label: "Entries", icon: "≣", path: "entries" },
      { key: "events", label: "Events", icon: "⤳", path: "events" },
    ],
  },
  {
    group: "System",
    items: [
      { key: "audit", label: "Audit log", icon: "❑", path: "audit" },
      { key: "tokens", label: "Admin tokens", icon: "⚿", path: "tokens" },
    ],
  },
];

export function AppShell({
  route,
  operatorLabel,
  crumbs,
  onLock,
  children,
}: {
  route: Route;
  operatorLabel: string | null;
  crumbs: ReactNode;
  onLock: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand brandmark">
          <span className="dot" />
          <span>Mikoshi · God Mode</span>
        </div>
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="nav-group-label">{g.group}</div>
            {g.items.map((item) => {
              const active =
                route.name === item.key ||
                (item.key === "users" && route.name === "user") ||
                (item.key === "circles" && route.name === "circle");
              return (
                <button
                  key={item.key}
                  className={`nav-item ${active ? "active" : ""}`}
                  onClick={() => navigate(item.path)}
                >
                  <span className="ico">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
        <div className="spacer" />
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">{crumbs}</div>
          <div className="right">
            <div className="operator">
              <span>operator</span>
              <span className="badge">{operatorLabel ?? "admin"}</span>
            </div>
            <button className="btn ghost sm" onClick={onLock}>
              Lock
            </button>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
