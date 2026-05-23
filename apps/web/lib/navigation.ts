export const routes = {
  auth: "/",
  dashboard: "/dashboard",
  habits: "/habits",
  entries: "/entries",
  habitEntries: "/entries?entryTypeSlug=habit_boolean,habit_quantity",
  circles: "/circles",
  food: "/food",
  foodInsights: "/food/insights",
  foodDetail: (eventId: string) => `/food/${eventId}`,
  apiAccess: "/api-access",
  newHabit: "/habits/new",
  habitDetail: (habitId: string) => `/habits/${habitId}`,
  entryDetail: (entryId: string) => `/entries/${entryId}`,
  circleDetail: (circleId: string) => `/circles/${circleId}`,
} as const;

export function getPrimaryAppNavigation(labels: {
  dashboard: string;
  entries: string;
  circles: string;
  food: string;
}) {
  return [
    {
      href: routes.dashboard,
      label: labels.dashboard,
    },
    // Phase 13 G-NAV-1: surface the generic entries list directly instead of
    // the legacy "Habits" item. /habits keeps a server-side redirect to
    // /entries?... for old URLs.
    {
      href: routes.entries,
      label: labels.entries,
    },
    {
      href: routes.food,
      label: labels.food,
    },
    {
      href: routes.circles,
      label: labels.circles,
    },
  ] as const;
}

export function getUtilityAppNavigation(labels: { apiAccess: string }) {
  return [
    {
      href: routes.apiAccess,
      label: labels.apiAccess,
    },
  ] as const;
}
