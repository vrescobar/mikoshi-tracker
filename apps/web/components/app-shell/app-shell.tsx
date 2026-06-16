import { Link, useLocation } from "react-router";
import type { ReactNode } from "react";

import { LocaleSwitch, useLocale } from "../locale";
import { SignOutButton } from "../auth/sign-out-button";
import { Icon, cn } from "../ui";
import { getPrimaryAppNavigation, getUtilityAppNavigation, routes } from "../../lib/navigation";
import styles from "./app-shell.module.css";

type AppShellProps = {
  userEmail: string;
  isAdmin?: boolean;
  children: ReactNode;
};

export function AppShell({ userEmail, isAdmin = false, children }: AppShellProps) {
  const { pathname } = useLocation();
  const { copy } = useLocale();
  const primaryNav = getPrimaryAppNavigation(copy.shell.navigation);
  const utilityNav = getUtilityAppNavigation(copy.shell.navigation, { isAdmin });
  const initial = userEmail.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={styles.shell} data-testid="app-shell">
      {/* ─ Desktop sidebar ─ */}
      <aside className={styles.sidebar} data-testid="app-shell-sidebar">
        <Link to={routes.dashboard} className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <Icon name="habits" size="1.15rem" strokeWidth={2.2} />
          </span>
          <span className={styles.brandName}>MikoshiTracker</span>
        </Link>

        <nav aria-label="Primary" className={styles.primaryNav} data-testid="app-shell-primary-nav">
          {primaryNav.map((item) => {
            const active = isRouteActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(styles.navLink, active && styles.navLinkActive)}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} className={styles.navIcon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <nav aria-label="Utility" className={styles.utilityNav} data-testid="app-shell-utility-nav">
            {utilityNav.map((item) => {
              const active = isRouteActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  data-accented={item.href === routes.apiAccess ? "true" : undefined}
                  className={cn(styles.utilityLink, active && styles.navLinkActive)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon name={item.icon} className={styles.navIcon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className={styles.account}>
            <span className={styles.avatar} aria-hidden="true">
              {initial}
            </span>
            <span className={styles.identity} title={userEmail}>
              {userEmail}
            </span>
          </div>
          <div className={styles.accountActions}>
            <LocaleSwitch />
            <SignOutButton label={copy.shell.signOut} />
          </div>
        </div>
      </aside>

      {/* ─ Main column ─ */}
      <div className={styles.main}>
        <header className={styles.mobileBar} data-testid="app-shell-mobile-bar">
          <Link to={routes.dashboard} className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <Icon name="habits" size="1.05rem" strokeWidth={2.2} />
            </span>
            <span className={styles.brandName}>Mikoshi</span>
          </Link>
          <div className={styles.accountActions}>
            <LocaleSwitch />
            <SignOutButton label={copy.shell.signOut} />
          </div>
        </header>

        <div className={styles.content} data-testid="app-shell-content">
          {children}
        </div>
      </div>

      {/* ─ Mobile bottom tab bar ─ */}
      <nav aria-label="Primary mobile" className={styles.mobileNav} data-testid="app-shell-mobile-nav">
        {primaryNav.map((item) => {
          const active = isRouteActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(styles.mobileNavLink, active && styles.mobileNavLinkActive)}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} className={styles.mobileNavIcon} />
              <span className={styles.mobileNavLabel}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function isRouteActive(pathname: string, href: string) {
  const target = href.split("?")[0];
  if (target === routes.dashboard) return pathname === routes.dashboard;
  return pathname === target || pathname.startsWith(`${target}/`);
}
