import type { SupportedLocale } from "./messages";

export const localeCookieName = "mikoshi-tracker-locale";
export const defaultLocale: SupportedLocale = "en";
export const supportedLocales = ["en", "zh-CN", "es"] as const satisfies readonly SupportedLocale[];
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

export function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  if (normalized.startsWith("zh")) {
    return "zh-CN";
  }

  if (normalized.startsWith("en")) {
    return "en";
  }

  if (normalized.startsWith("es")) {
    return "es";
  }

  return null;
}

export function resolveLocaleFromAcceptLanguage(value: string | null): SupportedLocale | null {
  if (!value) {
    return null;
  }

  for (const part of value.split(",")) {
    const candidate = normalizeLocale(part.split(";")[0]?.trim());
    if (candidate) {
      return candidate;
    }
  }

  return null;
}
