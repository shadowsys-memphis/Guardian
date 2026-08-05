/* ============================================================
   <QuarterOrbit /> — Brain Guardian Living Time Mark
   Inline-SVG mount of quarter-orbit-mark-master.svg (256 grid),
   driven by useDayQuarter. Same state API as the Offered mark:
   the existing .is-calling / .is-resting toggles and
   jessica-states.css animations work here unchanged.

   Requires (in this order):
     import "jessica-states.css";
     import "quarter-orbit-states.css";
   ============================================================ */
import { useId } from "react";
import clsx from "clsx";
import { useDayQuarter, type Quarter } from "./useDayQuarter";

export interface QuarterOrbitProps {
  /** Rendered size in px. Below ~48px prefer the favicon variant. */
  size?: number;
  /** Admin lock — pins the dial to this quarter's midpoint. */
  quarter?: Quarter;
  /** Jessica speaks: ripples travel out from wherever she is in the day. */
  calling?: boolean;
  /** Slow halo breath at the current daypart's tempo. */
  resting?: boolean;
  /** Show the backdrop plate (dusk navy at night). Off for UI mounts. */
  plate?: boolean;
  className?: string;
}

export function QuarterOrbit({
  size = 96,
  quarter,
  calling = false,
  resting = true,
  plate = false,
  className,
}: QuarterOrbitProps) {
  // One gradient id per instance — duplicate ids are invalid HTML
  // and Safari will paint the wrong gradient (kit mounting rule 2).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const haloId = `qoHalo${uid}`;
  const day = useDayQuarter({ override: quarter });

  return (
    <svg
      className={clsx(
        "quarter-orbit",
        day.className,
        {
          "is-calling": calling,
          "is-resting": resting && !calling,
          "no-plate": !plate,
        },
        className,
      )}
      style={day.style}
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label={`Brain Guardian — Q${day.quarter}, ${day.daypart}`}
    >
      <defs>
        <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor="var(--jessica-glow, #E8BC6A)"
            stopOpacity="0.85"
          />
          <stop
            offset="55%"
            stopColor="var(--jessica-glow, #E8BC6A)"
            stopOpacity="0.32"
          />
          <stop
            offset="100%"
            stopColor="var(--jessica-glow, #E8BC6A)"
            stopOpacity="0"
          />
        </radialGradient>
      </defs>

      <rect
        className="bg-plate"
        width="256"
        height="256"
        rx="56"
        fill="var(--bg-plate-fill, #FAF7F1)"
      />

      <g
        className="orbit-track"
        stroke="var(--track-rest, #C6D6C4)"
        strokeWidth="22"
        strokeLinecap="round"
      >
        <path className="arc arc-q1" d="M 146.39 54.26 A 76 76 0 0 1 201.74 109.61" />
        <path className="arc arc-q2" d="M 201.74 146.39 A 76 76 0 0 1 146.39 201.74" />
        <path className="arc arc-q3" d="M 109.61 201.74 A 76 76 0 0 1 54.26 146.39" />
        <path className="arc arc-q4" d="M 54.26 109.61 A 76 76 0 0 1 109.61 54.26" />
      </g>

      <g className="orbit-dial" transform="rotate(45 128 128)">
        <circle className="jessica-halo" cx="128" cy="52" r="44" fill={`url(#${haloId})`} />
        <g className="jessica-ripple-group">
          <circle className="ring-1" cx="128" cy="52" r="20" />
          <circle className="ring-2" cx="128" cy="52" r="20" />
          <circle className="ring-3" cx="128" cy="52" r="20" />
        </g>
        <circle
          className="jessica-core"
          cx="128"
          cy="52"
          r="19"
          fill="var(--jessica-amber, #D9A441)"
        />
      </g>
    </svg>
  );
}

export default QuarterOrbit;
