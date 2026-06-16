import type { ReactNode, SVGProps } from "react";

/**
 * A small, dependency-free line-icon set (24×24, stroke = currentColor) for nav,
 * habit categories, and dashboard chrome. Stroke-based so icons stay crisp at
 * any size and inherit color from their container (e.g. a tinted category chip).
 */
export type IconName =
  | "today"
  | "habits"
  | "diet"
  | "circles"
  | "settings"
  | "key"
  | "shield"
  | "bell"
  | "flame"
  | "plus"
  | "check"
  | "chevronRight"
  | "droplet"
  | "dumbbell"
  | "sparkles"
  | "moon"
  | "book"
  | "trophy"
  | "trend"
  | "logout";

const PATHS: Record<IconName, ReactNode> = {
  today: <path d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5" />,
  habits: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  diet: (
    <>
      <path d="M12 8c0-2.5 2-4 4-4 0 2.5-1.5 4.5-4 4.5" />
      <path d="M12 8.5c-1.2-1.3-3-2-4.6-1.6C5 7.4 4 9.4 4.6 12c.7 3 2.6 7 4.4 7 .9 0 1.3-.5 3-.5s2.1.5 3 .5c1.8 0 3.7-4 4.4-7" />
    </>
  ),
  circles: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 7.5a3 3 0 0 1 0 6M20.5 19a5.5 5.5 0 0 0-4-5.3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 9-9M17 5l2 2M14 8l2 2" />
    </>
  ),
  shield: <path d="M12 3 5 6v5c0 4.5 3 8 7 9 4-1 7-4.5 7-9V6z" />,
  bell: <path d="M6 9a6 6 0 0 1 12 0c0 5 1.5 7 1.5 7H4.5S6 14 6 9M10 20a2 2 0 0 0 4 0" />,
  flame: (
    <path d="M12 3c.5 3-2.5 4-2.5 7A2.5 2.5 0 0 0 12 12.5 2.5 2.5 0 0 0 14.5 10c1.2 1 1.5 2.4 1.5 3.5a4 4 0 1 1-8 0c0-3.5 4-5.5 4-10.5" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  droplet: <path d="M12 3.5s6 6.5 6 10.5a6 6 0 0 1-12 0c0-4 6-10.5 6-10.5" />,
  dumbbell: <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />,
  sparkles: <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5" />,
  book: <path d="M5 4h9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H5zM5 4v13.5" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M10 14h4M9 20h6M12 14v6" />
    </>
  ),
  trend: <path d="M4 16l4.5-5 3 3L20 7M20 7h-4M20 7v4" />,
  logout: <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 12H3M6 8l-4 4 4 4" />,
};

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number | string;
};

export function Icon({ name, size = "1.25em", strokeWidth = 1.9, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
