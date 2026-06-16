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
  weight: "/weight",
  apiAccess: "/api-access",
  settings: "/settings",
  settingsSkills: "/settings/skills",
  admin: "/admin",
  newHabit: "/habits/new",
  habitDetail: (habitId: string) => `/habits/${habitId}`,
  entryDetail: (entryId: string) => `/entries/${entryId}`,
  circleDetail: (circleId: string) => `/circles/${circleId}`,
} as const;

export function getPrimaryAppNavigation(labels: {
  dashboard: string;
  habits: string;
  circles: string;
  food: string;
  settings: string;
}) {
  // Five-item, question-first primary nav: Today (what's now/done), Habits (is
  // my system healthy), Diet (am I on track), Circles (what are others doing),
  // Settings (configure everything). The generic entries list moves to a tab
  // under Habits; /habits currently redirects to the entries view until the
  // dedicated overview page lands.
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
      href: routes.food,
      label: labels.food,
    },
    {
      href: routes.circles,
      label: labels.circles,
    },
    {
      href: routes.settings,
      label: labels.settings,
    },
  ] as const;
}

export function getUtilityAppNavigation(
  labels: { apiAccess: string; admin: string },
  options: { isAdmin?: boolean } = {},
) {
  // API access stays a quick utility link until the Settings tabs absorb it;
  // Admin is appended only for operators (route itself is isAdmin-gated).
  return [
    {
      href: routes.apiAccess,
      label: labels.apiAccess,
    },
    ...(options.isAdmin ? [{ href: routes.admin, label: labels.admin }] : []),
  ];
}
