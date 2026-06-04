import { useEffect, useState } from "react";

// Minimal dependency-free hash router. The admin SPA is served under /admin/ by
// Caddy with a try_files fallback to index.html, so hash routing keeps deep
// links working without any server-side route config.

export type Route =
  | { name: "dashboard" }
  | { name: "users" }
  | { name: "user"; id: string }
  | { name: "circles" }
  | { name: "circle"; id: string }
  | { name: "entries" }
  | { name: "events" }
  | { name: "audit" }
  | { name: "tokens" };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/^\/+/, "");
  const [head, param] = path.split("/");
  switch (head) {
    case "users":
      return param ? { name: "user", id: decodeURIComponent(param) } : { name: "users" };
    case "circles":
      return param ? { name: "circle", id: decodeURIComponent(param) } : { name: "circles" };
    case "entries":
      return { name: "entries" };
    case "events":
      return { name: "events" };
    case "audit":
      return { name: "audit" };
    case "tokens":
      return { name: "tokens" };
    case "dashboard":
    case "":
      return { name: "dashboard" };
    default:
      return { name: "dashboard" };
  }
}

export function navigate(path: string): void {
  const next = path.startsWith("#") ? path : `#/${path.replace(/^\/+/, "")}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
