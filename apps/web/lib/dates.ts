/**
 * Today's date key (YYYY-MM-DD) in the given IANA timezone. Pages use this so the
 * day they query matches the timezone the API uses to bucket EntryEvent.dateKey;
 * a naive `new Date().toISOString()` would use UTC and miss events near midnight.
 */
export function todayKeyInTimeZone(timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone && timeZone.length > 0 ? timeZone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Shift a YYYY-MM-DD date key by a number of days (UTC-anchored, DST-safe). */
export function shiftDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
