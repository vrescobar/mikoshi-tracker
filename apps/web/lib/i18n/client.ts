import type { SupportedLocale } from "./messages";
import { defaultLocale, localeCookieName, normalizeLocale } from "./shared";

/**
 * Resolve the locale at SPA bootstrap, mirroring what the server used to do
 * with the cookie + Accept-Language: explicit cookie preference first, then
 * the browser languages, then the default.
 */
export function resolveClientLocale(): SupportedLocale {
  const cookieLocale = readLocaleCookie();
  if (cookieLocale) {
    return cookieLocale;
  }

  for (const language of navigator.languages ?? [navigator.language]) {
    const candidate = normalizeLocale(language);
    if (candidate) {
      return candidate;
    }
  }

  return defaultLocale;
}

function readLocaleCookie(): SupportedLocale | null {
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === localeCookieName) {
      return normalizeLocale(decodeURIComponent(rest.join("=")));
    }
  }
  return null;
}
