const PACIFIC_TZ = "America/Los_Angeles";

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
