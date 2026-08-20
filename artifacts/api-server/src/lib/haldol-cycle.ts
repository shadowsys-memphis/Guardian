/**
 * THE single source of truth for Haldol cycle math.
 *
 * This logic previously lived as four hand-copied duplicates (haldol.ts,
 * gemini.ts, call-scheduler.ts, admin-view.tsx) with a hardcoded 14-day
 * interval — and they had already drifted: the frontend copy applied
 * Math.min/max clamping the others didn't. When Pops moved from biweekly to
 * monthly dosing, every one of those copies became wrong at once.
 *
 * Nothing should recompute cycle days locally. Import this.
 */

import { pacificDateOf } from "./pacific-time";

// Monthly per Dr Uddin (2026-07-28). The DB row's interval_days is the real
// source; this fallback only covers a missing/invalid value and must match
// the prescribed cadence so a fallback never silently shortens the cycle.
export const DEFAULT_INTERVAL_DAYS = 28;
export const DEFAULT_ZOMBIE_PHASE_DAYS = 5;

/** Epoch ms of UTC midnight for a "YYYY-MM-DD" string — a timezone-neutral
 *  anchor for whole-calendar-day arithmetic. */
function utcMidnightMs(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map((v) => parseInt(v, 10));
  return Date.UTC(y!, m! - 1, d!);
}

export interface HaldolCycleInfo {
  /** 1-based day within the current cycle. Never clamped — it wraps. */
  cycleDay: number;
  intervalDays: number;
  zombiePhaseDays: number;
  /** Post-injection high-symptom window. */
  isZombiePhase: boolean;
  nextInjectionDate: string;
  /** Exactly one full interval has elapsed — the dose is due today, not late. */
  isDueToday: boolean;
  /** A full interval has elapsed AND that day has passed with nothing logged. */
  isOverdue: boolean;
  daysOverdue: number;
  daysSinceInjection: number;
}

export function computeHaldolCycle(
  lastInjectionDate: string,
  opts?: { intervalDays?: number | null; zombiePhaseDays?: number | null; now?: Date }
): HaldolCycleInfo {
  const intervalDays =
    opts?.intervalDays && opts.intervalDays > 0 ? opts.intervalDays : DEFAULT_INTERVAL_DAYS;
  const zombiePhaseDays =
    opts?.zombiePhaseDays && opts.zombiePhaseDays >= 0 ? opts.zombiePhaseDays : DEFAULT_ZOMBIE_PHASE_DAYS;

  const now = opts?.now ?? new Date();
  // Whole PACIFIC calendar days since the injection date. The old math parsed
  // the date as UTC midnight and counted raw 24-hour blocks to "now", which
  // rolled the cycle day over at 5pm Pacific every evening — dragging the
  // zombie window and due/overdue flags with it. Clamped at 0 so a
  // future-dated injection reads as day 1 instead of a negative modulo
  // pinning cycleDay ≤ 1 (rest mode stuck on).
  const injectionMs = utcMidnightMs(lastInjectionDate);
  const todayMs = utcMidnightMs(pacificDateOf(now.getTime()));
  const daysSinceInjection = Math.max(0, Math.round((todayMs - injectionMs) / 86_400_000));

  const cycleDay = (daysSinceInjection % intervalDays) + 1;

  const nextInjectionMs =
    injectionMs + intervalDays * Math.ceil((daysSinceInjection + 1) / intervalDays) * 86_400_000;

  // The dose is DUE on the day a full interval has elapsed, and only overdue
  // after that day passes. (Getting this boundary wrong told Ray the injection
  // was late on the very morning of the scheduled appointment.)
  //
  // Overdue is tracked separately from cycleDay because cycleDay silently
  // wraps back to a low number and reads as a healthy fresh cycle.
  const isDueToday = daysSinceInjection === intervalDays;
  const isOverdue = daysSinceInjection > intervalDays;

  return {
    cycleDay,
    intervalDays,
    zombiePhaseDays,
    isZombiePhase: cycleDay <= zombiePhaseDays,
    nextInjectionDate: new Date(nextInjectionMs).toISOString().split("T")[0],
    isDueToday,
    isOverdue,
    daysOverdue: isOverdue ? daysSinceInjection - intervalDays : 0,
    daysSinceInjection,
  };
}
