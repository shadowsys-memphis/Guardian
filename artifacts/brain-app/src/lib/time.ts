const PACIFIC_TZ = "America/Los_Angeles";

/**
 * "0730" | "07:30" -> "7:30 AM". Returns the input unchanged if unparseable.
 *
 * Display-only: schedule_tasks.time_label is stored as 24-hour "HHMM" and all
 * scheduling logic stays 24-hour — this formats it for caregiver-facing
 * admin/schedule views. Mirrors the server helper of the same name in
 * api-server's lib/pacific-time.ts (used for Jessica's context string).
 */
export function to12Hour(raw: string): string {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(raw.trim());
  if (!m) return raw;
  const h24 = Number(m[1]);
  if (h24 > 23 || Number(m[2]) > 59) return raw;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/** "6:32 PM" — Pacific, 12-hour. */
export function formatPacificTime(date: string | number | Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    timeZone: PACIFIC_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "6:32:07 PM" — Pacific, 12-hour, with seconds (for a live ticking clock). */
export function formatPacificClock(date: string | number | Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    timeZone: PACIFIC_TZ,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/** "Jul 30, 2026" — Pacific. */
export function formatPacificDate(date: string | number | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    timeZone: PACIFIC_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Jul 30" — Pacific, no year. */
export function formatPacificShortDate(date: string | number | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    timeZone: PACIFIC_TZ,
    month: "short",
    day: "numeric",
  });
}

/** "Jul 30, 6:32 PM" — Pacific, 12-hour. */
export function formatPacificDateTime(date: string | number | Date): string {
  return new Date(date).toLocaleString("en-US", {
    timeZone: PACIFIC_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "Monday, July 30, 2026" — Pacific. */
export function formatPacificLongDate(date: string | number | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    timeZone: PACIFIC_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
