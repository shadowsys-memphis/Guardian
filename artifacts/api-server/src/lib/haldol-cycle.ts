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

export const DEFAULT_INTERVAL_DAYS = 14;
export const DEFAULT_ZOMBIE_PHASE_DAYS = 5;

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

  const injection = new Date(lastInjectionDate);
  const now = opts?.now ?? new Date();
  const daysSinceInjection = Math.floor((now.getTime() - injection.getTime()) / 86_400_000);

  const cycleDay = (daysSinceInjection % intervalDays) + 1;

  const nextInjection = new Date(injection);
  nextInjection.setDate(injection.getDate() + intervalDays * Math.ceil((daysSinceInjection + 1) / intervalDays));

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
    nextInjectionDate: nextInjection.toISOString().split("T")[0],
    isDueToday,
    isOverdue,
    daysOverdue: isOverdue ? daysSinceInjection - intervalDays : 0,
    daysSinceInjection,
  };
}
