/* ============================================================
   useDayQuarter — the day clock behind the Presence Field mark.
   Quarter windows are RAY'S boundaries, mirroring the server:
     Q1 06:00–10:00 · Q2 10:00–14:00 · Q3 14:00–18:00 · Q4 18:00–06:00
   Defined identically in lib/jessica-tools.ts (quarterForHour),
   routes/state.ts (computeCurrentQuarter) and lib/call-scheduler.ts
   (computeQuarterForHour) — if those change, change this too.
   Five Presence Field states ride those quarters on the concept
   boards' windows:
     morning 6–10 · midday 10–14 · mid-afternoon 14–17 ·
     mid-evening 17–21 · late-night 21–6
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

/** [startMin, durationMin] per quarter; Q4 wraps midnight.
    Quarters are unequal (Q4 covers 12h), so the light sweeps its
    90° of arc at a different pace per quarter — one full turn is
    still exactly one day. */
const QUARTERS: Record<Quarter, readonly [number, number]> = {
  1: [360, 240], // Q1 06:00–10:00
  2: [600, 240], // Q2 10:00–14:00
  3: [840, 240], // Q3 14:00–18:00
  4: [1080, 720], // Q4 18:00–06:00
};

const minutesOfDay = (d: Date): number =>
  d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

export function quarterOf(d: Date): Quarter {
  const m = minutesOfDay(d);
  if (m >= 360 && m < 600) return 1;
  if (m >= 600 && m < 840) return 2;
  if (m >= 840 && m < 1080) return 3;
  return 4;
}

export function daypartOf(d: Date): Daypart {
  const m = minutesOfDay(d);
  if (m >= 360 && m < 600) return "morning"; // 6–10
  if (m >= 600 && m < 840) return "midday"; // 10–14
  if (m >= 840 && m < 1020) return "midafternoon"; // 14–17
  if (m >= 1020 && m < 1260) return "evening"; // 17–21
  return "night"; // 21–6
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
  /** Follow the real clock. Off by default: the hook computes the
      day state once and then stops, so a mark at rest never moves.
      Turn it on only where the day clock is the point. */
  live?: boolean;
}

export interface DayClock extends DayState {
  /** `q2 daypart-midday` — drop straight onto the mark's <svg>. */
  className: string;
  /** Sets --orbit-angle. Spread onto the mark's style. */
  style: CSSProperties;
}

export function useDayQuarter(opts: UseDayQuarterOptions = {}): DayClock {
  const { override, tickMs = 30_000, live = false } = opts;
  const [state, setState] = useState<DayState>(() => computeDayState());
  const turns = useRef(0);
  const lastAngle = useRef(state.angle);

  useEffect(() => {
    // Not live: keep the state computed at mount and never schedule a
    // tick. Without this the mark creeps around the ring all day, which
    // reads as idle motion even though no event caused it.
    if (!live) return;
    const tick = () => setState(computeDayState());
    const id = window.setInterval(tick, tickMs);
    tick();
    return () => window.clearInterval(id);
  }, [tickMs, live]);

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
