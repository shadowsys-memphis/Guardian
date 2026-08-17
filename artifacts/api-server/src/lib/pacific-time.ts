// ─── Shared Pacific-time helpers ──────────────────────────────────────────────
//
// All caregiving schedule logic (cron jobs, quiet windows, call sessions) is
// Pacific-local, but Postgres/JS dates default to UTC. Pacific is UTC-7 or
// UTC-8 depending on DST, so anything derived from `new Date().toISOString()`
// silently drifts by a day for roughly a third of the clock (e.g. any time
// from ~5pm Pacific onward is already "tomorrow" in UTC). Every place that
// needs "today" or a scheduled-time comparison must go through these helpers
// instead of ad-hoc `toISOString()` slicing.

export const PACIFIC_TZ = "America/Los_Angeles";

export interface PacificNow {
  hhmm: string;
  date: string;
  tomorrow: string;
  hour: number;
  epochMs: number;
}

export function pacificNow(): PacificNow {
  const now = new Date();
  const date = pacificDateOf(now.getTime());
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  // Intl renders midnight as "24" in some ICU versions — normalize to "00".
  const hour = parseInt(p["hour"], 10) % 24;
  const hh = String(hour).padStart(2, "0");
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return {
    hhmm: `${hh}:${p["minute"]}`,
    date,
    tomorrow: t.toISOString().split("T")[0]!,
    hour,
    epochMs: now.getTime(),
  };
}

/**
 * "0730" | "07:30" -> "7:30 AM". Returns the input unchanged if unparseable.
 *
 * Display-only formatting for caregiver-facing surfaces (Jessica's context
 * string, admin/schedule UI mirrors this in brain-app's src/lib/time.ts).
 * Internal scheduling and time_label storage stay 24-hour "HHMM".
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

/** Pacific calendar date (YYYY-MM-DD) that the instant `epochMs` falls on. */
export function pacificDateOf(epochMs: number): string {
  // en-CA formats as YYYY-MM-DD, exactly the format the DB columns use.
  return new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ }).format(new Date(epochMs));
}

/** Today's Pacific calendar date (YYYY-MM-DD). Use this instead of `new Date().toISOString().split("T")[0]`, which is UTC and drifts a day off Pacific for evening times. */
export function todayPacific(): string {
  return pacificDateOf(Date.now());
}

/**
 * Converts a Pacific wall-clock "HH:MM" on Pacific calendar date `dateStr`
 * into the real UTC epoch-ms instant it refers to. DST-safe: derives the
 * actual Pacific UTC offset for that approximate instant from Intl instead of
 * assuming a fixed -7/-8h, so comparisons stay correct across the spring/fall
 * transitions.
 *
 * This is the building block for all "is it time for X yet" scheduling
 * checks — reasoning in real epoch-ms instants avoids the classic bug class
 * of comparing wrapped "HH:MM" strings, where a window that crosses midnight
 * (e.g. 23:00 + 60min bound) silently never matches.
 */
export function pacificWallTimeToEpochMs(dateStr: string, hhmm: string): number {
  const [year, month, day] = dateStr.split("-").map((v) => parseInt(v, 10));
  const [hh, mm] = hhmm.split(":").map((v) => parseInt(v, 10));
  // A naive instant using the wall-clock numbers as if they were UTC. Not the
  // answer, but a stable anchor close enough (within ~1 day) to look up the
  // correct Pacific UTC offset for.
  const naiveUtc = Date.UTC(year!, month! - 1, day!, hh, mm, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(naiveUtc)).map((x) => [x.type, x.value]));
  const shownAsUtc = Date.UTC(
    parseInt(p["year"]!, 10),
    parseInt(p["month"]!, 10) - 1,
    parseInt(p["day"]!, 10),
    parseInt(p["hour"]!, 10) % 24,
    parseInt(p["minute"]!, 10),
    0
  );
  const offsetMs = shownAsUtc - naiveUtc; // Pacific's clock reading minus true UTC, at naiveUtc
  return naiveUtc - offsetMs;
}
