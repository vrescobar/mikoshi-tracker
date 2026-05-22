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

export function getPrimaryAppNavigation(labels: { dashboard: string; habits: string; circles: string; food: string }) {
  return [
    {
      href: routes.dashboard,
      label: labels.dashboard,
    },
    {
      // Point straight at the entries destination rather than /habits (which
      // server-redirects here). A direct client navigation keeps focus and
      // active-state stable on the primary nav.
      href: routes.habitEntries,
      label: labels.habits,
    },
    {
      href: routes.circles,
      label: labels.circles,
    },
    {
      href: routes.food,
      label: labels.food,
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
