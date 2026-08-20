/* ============================================================
   <PresenceField /> — Brain Guardian living time mark
   Inline-SVG mount of the organic Presence Field ring (256 grid),
   driven by useDayQuarter. The gradient light rides the ring
   through the real day (0deg = 06:00 at the top, one turn per
   day on Ray's quarter clock); the slate body stays constant.
   MOTION IS EVENT-DRIVEN. At rest the mark is completely still:
   no halo breath, no day-long rotation, no ticking. Pass `live`
   to let the light ride the day clock, and `calling` when Jessica
   is actually on the line. The chrome (nav/header/favicon) uses
   <PresenceMark /> instead — this component is for large in-app
   moments only.
   ============================================================ */
import { useId } from "react";
import clsx from "clsx";
import { useDayQuarter, type Quarter } from "./useDayQuarter";
import { RING_PATHS } from "./ring-paths";
import "./presence-field.css";

export interface PresenceFieldProps {
  /** Rendered size in px. Below ~48px prefer the favicon asset. */
  size?: number;
  /** Admin lock — pins the light to this quarter's midpoint. */
  quarter?: Quarter;
  /** Jessica is on the line: ripples travel out from the ring. */
  calling?: boolean;
  /** Let the light ride the real day clock. Off by default — the
      mark holds a fixed angle and stops ticking entirely. */
  live?: boolean;
  className?: string;
}

export function PresenceField({
  size = 96,
  quarter,
  calling = false,
  live = false,
  className,
}: PresenceFieldProps) {
  // One gradient id per instance — duplicate ids are invalid HTML
  // and Safari will paint the wrong gradient.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const strokeId = `pfStroke${uid}`;
  const haloId = `pfHalo${uid}`;
  // Still by default: with `live` off useDayQuarter stops its interval
  // and pins the light, so nothing on the mark moves until an actual
  // event (a call) says otherwise.
  const day = useDayQuarter({ override: quarter, live });

  return (
    <svg
      className={clsx(
        "presence-field",
        day.className,
        { "is-calling": calling },
        className,
      )}
      style={day.style}
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label={`Brain Guardian — Presence Field, Q${day.quarter}, ${day.daypart}`}
    >
      <defs>
        {/* userSpaceOnUse so every stroke shares one gradient; the
            gradient lives inside the rotor, so the lit end rides
            the ring as --orbit-angle advances through the day. */}
        <linearGradient
          id={strokeId}
          gradientUnits="userSpaceOnUse"
          x1="128"
          y1="246"
          x2="128"
          y2="10"
        >
          <stop offset="0" stopColor="var(--pf-ink, #3A4456)" />
          <stop offset="0.45" stopColor="var(--pf-ink, #3A4456)" />
          <stop offset="1" stopColor="var(--pf-glow, #D9A441)" />
        </linearGradient>
        <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--pf-glow, #D9A441)" stopOpacity="0.5" />
          <stop offset="60%" stopColor="var(--pf-glow, #D9A441)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--pf-glow, #D9A441)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className="pf-rotor">
        {/* the warmth around the light — rides at the lit end (06:00 top) */}
        <circle className="pf-halo" cx="128" cy="30" r="52" fill={`url(#${haloId})`} />

        <g
          className="pf-ring"
          stroke={`url(#${strokeId})`}
          strokeWidth="1.7"
          strokeLinejoin="round"
        >
          {RING_PATHS.map((p, i) => (
            <path key={i} d={p.d} opacity={p.opacity} />
          ))}
        </g>
      </g>

      {/* calling ripples dissolve outward from the whole ring */}
      <g className="pf-ripple">
        <circle className="ring-1" cx="128" cy="128" r="100" />
        <circle className="ring-2" cx="128" cy="128" r="100" />
        <circle className="ring-3" cx="128" cy="128" r="100" />
      </g>
    </svg>
  );
}

export default PresenceField;
