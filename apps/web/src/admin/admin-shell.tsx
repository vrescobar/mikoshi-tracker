import { NavLink, Outlet } from "react-router";

import { PageFrame, PageHeader, Surface, cn } from "../../components/ui";
import { useSession } from "../auth/session";
import { ToastProvider } from "./ui";
import styles from "./admin-shell.module.css";
import "./admin.css";

/**
 * Operator surface: section navigation + outlet for the admin views. The
 * admin area is intentionally English-only, like the standalone admin SPA it
 * replaces — it is an operator tool, not part of the localized product UI.
 */
const SECTIONS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/circles", label: "Circles" },
  { to: "/admin/entries", label: "Entries" },
  { to: "/admin/events", label: "Events" },
  { to: "/admin/audit", label: "Audit" },
  { to: "/admin/tokens", label: "Tokens" },
];

export function AdminShell() {
  const { user } = useSession();

  return (
    <div className={styles.stack}>
      <Surface variant="hero">
        <PageFrame>
          <PageHeader
            eyebrow="Admin"
            title="God mode"
            description={`Operating as ${user.name || user.email}. Admin actions are recorded in the audit log.`}
          />
          <nav aria-label="Admin sections" className={styles.nav} data-testid="admin-nav">
            {SECTIONS.map((section) => (
              <NavLink
                key={section.to}
                to={section.to}
                end={section.end}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                {section.label}
              </NavLink>
            ))}
          </nav>
        </PageFrame>
      </Surface>

      <ToastProvider>
        <div className="admin-scope">
          <Outlet />
        </div>
      </ToastProvider>
    </div>
  );
}
