export const routes = {
  auth: "/",
  dashboard: "/dashboard",
  habits: "/habits",
  circles: "/circles",
  apiAccess: "/api-access",
  newHabit: "/habits/new",
  habitDetail: (habitId: string) => `/habits/${habitId}`,
  circleDetail: (circleId: string) => `/circles/${circleId}`,
} as const;

export function getPrimaryAppNavigation(labels: { dashboard: string; habits: string; circles: string }) {
  return [
    {
      href: routes.dashboard,
      label: labels.dashboard,
    },
    {
      href: routes.habits,
      label: labels.habits,
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
