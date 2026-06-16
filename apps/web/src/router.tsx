import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";

import { routes } from "../lib/navigation";
import { AdminGuard } from "./admin/admin-guard";
import { ProtectedLayout } from "./auth/protected-layout";

const AuthPage = lazy(() => import("./pages/auth-page"));
const DashboardPage = lazy(() => import("./pages/dashboard-page"));
const EntriesPageRoute = lazy(() => import("./pages/entries-page-route"));
const FoodPageRoute = lazy(() => import("./pages/food-page-route"));
const FoodInsightsRoute = lazy(() => import("./pages/food-insights-route"));
const FoodDetailRoute = lazy(() => import("./pages/food-detail-route"));
const WeightPageRoute = lazy(() => import("./pages/weight-page-route"));
const CirclesRoute = lazy(() => import("./pages/circles-route"));
const CircleDetailRoute = lazy(() => import("./pages/circle-detail-route"));
const HabitsOverviewRoute = lazy(() => import("./pages/habits-overview-route"));
const SettingsRoute = lazy(() => import("./pages/settings-route"));
const SettingsSkillsRoute = lazy(() => import("./pages/settings-skills-route"));
const ApiAccessRoute = lazy(() => import("./pages/api-access-route"));
const NotFoundPage = lazy(() => import("./pages/not-found"));

// Admin views are named exports (ported verbatim from the retired admin SPA).
const DashboardView = lazy(() => import("./pages/admin/dashboard-view").then((m) => ({ default: m.Dashboard })));
const UsersView = lazy(() => import("./pages/admin/users-view").then((m) => ({ default: m.Users })));
const UserDetailView = lazy(() => import("./pages/admin/user-detail-view").then((m) => ({ default: m.UserDetail })));
const CirclesView = lazy(() => import("./pages/admin/circles-view").then((m) => ({ default: m.Circles })));
const CircleDetailView = lazy(() =>
  import("./pages/admin/circle-detail-view").then((m) => ({ default: m.CircleDetail })),
);
const EntriesView = lazy(() => import("./pages/admin/entries-view").then((m) => ({ default: m.Entries })));
const EventsView = lazy(() => import("./pages/admin/events-view").then((m) => ({ default: m.Events })));
const AuditView = lazy(() => import("./pages/admin/audit-view").then((m) => ({ default: m.Audit })));
const TokensView = lazy(() => import("./pages/admin/tokens-view").then((m) => ({ default: m.Tokens })));

function page(element: React.ReactNode) {
  return <Suspense fallback={null}>{element}</Suspense>;
}

/**
 * Route table mirroring the old Next.js app/ tree. The legacy /habits/*
 * routes redirect to the entries view exactly like their server pages did.
 */
export const routeConfig = [
  { path: routes.auth, element: page(<AuthPage />) },
  {
    element: <ProtectedLayout />,
    children: [
      { path: "/dashboard", element: page(<DashboardPage />) },
      { path: "/entries", element: page(<EntriesPageRoute />) },
      { path: "/food", element: page(<FoodPageRoute />) },
      { path: "/food/insights", element: page(<FoodInsightsRoute />) },
      { path: "/food/:eventId", element: page(<FoodDetailRoute />) },
      { path: "/weight", element: page(<WeightPageRoute />) },
      { path: "/circles", element: page(<CirclesRoute />) },
      { path: "/circles/:circleId", element: page(<CircleDetailRoute />) },
      { path: "/settings", element: page(<SettingsRoute />) },
      { path: "/settings/skills", element: page(<SettingsSkillsRoute />) },
      { path: "/api-access", element: page(<ApiAccessRoute />) },
      // Operator console — gated on the session's isAdmin flag.
      {
        path: "/admin",
        element: <AdminGuard />,
        children: [
          { index: true, element: page(<DashboardView />) },
          { path: "users", element: page(<UsersView />) },
          { path: "users/:userId", element: page(<UserDetailView />) },
          { path: "circles", element: page(<CirclesView />) },
          { path: "circles/:circleId", element: page(<CircleDetailView />) },
          { path: "entries", element: page(<EntriesView />) },
          { path: "events", element: page(<EventsView />) },
          { path: "audit", element: page(<AuditView />) },
          { path: "tokens", element: page(<TokensView />) },
        ],
      },
      // Habits overview: weekly compliance grid + frequency-aware streaks.
      { path: "/habits", element: page(<HabitsOverviewRoute />) },
      // Remaining legacy habit routes — preserved redirects from the Next pages.
      { path: "/habits/new", element: <Navigate to={routes.habitEntries} replace /> },
      { path: "/habits/:habitId", element: <Navigate to={routes.habitEntries} replace /> },
      { path: "*", element: page(<NotFoundPage />) },
    ],
  },
];

export const router = createBrowserRouter(routeConfig);
