/* ============================================================
   useDayQuarter — the day clock behind the Quarter Orbit mark.
   Quarter windows are IDENTICAL to the server's computed state
   (task-1 / GET /api/state/computed):
     Q1 06:00–12:00 · Q2 12:00–18:00 · Q3 18:00–22:00 · Q4 22:00–06:00
   Five color-temperature dayparts ride those four quarters.
   ============================================================ */
import { useEffect, useRef, useState, type CSSProperties } from "react";

export type Quarter = 1 | 2 | 3 | 4;
export type Daypart =
  | "morning"
  | "midday"
  | "midafternoon"
  | "evening"
  | "night";

export interface DayState {
  quarter: Quarter;
  daypart: Daypart;
  /** Degrees clockwise from 12 o'clock. 0deg = 06:00. 90deg/quarter. */
  angle: number;
  /** 0..1 elapsed within the current quarter. */
  progress: number;
}

/** [startMin, durationMin] per quarter; Q4 wraps midnight. */
const QUARTERS: Record<Quarter, readonly [number, number]> = {
  1: [360, 360], // Q1 06:00–12:00
  2: [720, 360], // Q2 12:00–18:00
  3: [1080, 240], // Q3 18:00–22:00
  4: [1320, 480], // Q4 22:00–06:00
};

const minutesOfDay = (d: Date): number =>
  d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

export function quarterOf(d: Date): Quarter {
  const m = minutesOfDay(d);
  if (m >= 360 && m < 720) return 1;
  if (m >= 720 && m < 1080) return 2;
  if (m >= 1080 && m < 1320) return 3;
  return 4;
}

export function daypartOf(d: Date): Daypart {
  const m = minutesOfDay(d);
  if (m >= 360 && m < 660) return "morning"; // 06–11
  if (m >= 660 && m < 900) return "midday"; // 11–15
  if (m >= 900 && m < 1080) return "midafternoon"; // 15–18
  if (m >= 1080 && m < 1320) return "evening"; // 18–22
  return "night"; // 22–06
}

export function computeDayState(d: Date = new Date()): DayState {
  const quarter = quarterOf(d);
  const [start, dur] = QUARTERS[quarter];
  const m = minutesOfDay(d);
  const elapsed = ((m - start) % 1440 + 1440) % 1440; // Q4 wrap-safe
  const progress = Math.min(elapsed / dur, 1);
  return {
    quarter,
    daypart: daypartOf(d),
    angle: (quarter - 1) * 90 + progress * 90,
    progress,
  };
}

export interface UseDayQuarterOptions {
  /** Admin lock (mirrors app_state quarter override). Pins the dial
      to that quarter's midpoint; daypart still follows the real sun. */
  override?: Quarter;
  /** Tick interval. Default 30s — same cadence as the Pops view. */
  tickMs?: number;
}

export interface DayClock extends DayState {
  /** `q2 daypart-midday` — drop straight onto the mark's <svg>. */
  className: string;
  /** Sets --orbit-angle. Spread onto the mark's style. */
  style: CSSProperties;
}

export function useDayQuarter(opts: UseDayQuarterOptions = {}): DayClock {
  const { override, tickMs = 30_000 } = opts;
  const [state, setState] = useState<DayState>(() => computeDayState());
  const turns = useRef(0);
  const lastAngle = useRef(state.angle);

  useEffect(() => {
    const tick = () => setState(computeDayState());
    const id = window.setInterval(tick, tickMs);
    tick();
    return () => window.clearInterval(id);
  }, [tickMs]);

  const base = override !== undefined ? (override - 1) * 90 + 45 : state.angle;

  // Keep the angle monotonic across the 06:00 wrap so the CSS
  // transition never spins the dial backwards through the night.
  if (override === undefined) {
    if (base < lastAngle.current - 180) turns.current += 1;
    lastAngle.current = base;
  }
  const angle = base + turns.current * 360;

  const quarter = override ?? state.quarter;
  return {
    ...state,
    quarter,
    angle,
    className: `q${quarter} daypart-${state.daypart}`,
    style: { "--orbit-angle": `${angle}deg` } as CSSProperties,
  };
}
