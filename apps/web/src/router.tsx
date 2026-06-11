import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";

import { routes } from "../lib/navigation";
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
const SettingsRoute = lazy(() => import("./pages/settings-route"));
const SettingsSkillsRoute = lazy(() => import("./pages/settings-skills-route"));
const ApiAccessRoute = lazy(() => import("./pages/api-access-route"));
const NotFoundPage = lazy(() => import("./pages/not-found"));

function page(element: React.ReactNode) {
  return <Suspense fallback={null}>{element}</Suspense>;
}

/**
 * Route table mirroring the old Next.js app/ tree. The legacy /habits/*
 * routes redirect to the entries view exactly like their server pages did.
 */
export const router = createBrowserRouter([
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
      // Legacy habit routes — preserved redirects from the Next pages.
      { path: "/habits", element: <Navigate to={routes.habitEntries} replace /> },
      { path: "/habits/new", element: <Navigate to={routes.habitEntries} replace /> },
      { path: "/habits/:habitId", element: <Navigate to={routes.habitEntries} replace /> },
      { path: "*", element: page(<NotFoundPage />) },
    ],
  },
]);
