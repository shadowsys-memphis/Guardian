/* ============================================================
   <PresenceMark /> — the Brain Guardian logo mark.
   Small, STATIC, three strokes, one shared gradient. This is the
   identity element: nav rail, page headers, favicon, app icons.
   It never animates and never tracks the clock.
   For the fuller living artwork (day clock, calling ripples) use
   <PresenceField /> — that one belongs in large in-app moments
   only, never in chrome.
   ============================================================ */
import { useId } from "react";
import clsx from "clsx";
import { MARK_PATHS } from "./mark-paths";

export interface PresenceMarkProps {
  /** Rendered size in px. Stays legible down to ~24px. */
  size?: number;
  /** `current` draws in currentColor — the single-flat-colour lockup. */
  tone?: "gradient" | "current";
  className?: string;
  /** Decorative next to a wordmark; give it a label when it stands alone. */
  title?: string;
}

export function PresenceMark({
  size = 32,
  tone = "gradient",
  className,
  title,
}: PresenceMarkProps) {
  // One gradient id per instance — duplicate ids are invalid HTML and
  // Safari will paint the wrong gradient.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradientId = `pmGrad${uid}`;
  const stroke = tone === "current" ? "currentColor" : `url(#${gradientId})`;

  return (
    <svg
      className={clsx("presence-mark", className)}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {tone === "gradient" && (
        <defs>
          <linearGradient id={gradientId} x1="0.12" y1="0.02" x2="0.88" y2="0.98">
            <stop offset="0" stopColor="var(--pm-ink, #22303F)" />
            <stop offset="0.42" stopColor="var(--pm-ink-2, #2F4256)" />
            <stop offset="1" stopColor="var(--pm-glow, #D9A441)" />
          </linearGradient>
        </defs>
      )}
      <g
        stroke={stroke}
        strokeWidth="3.1"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        {MARK_PATHS.map((p, i) => (
          <path key={i} d={p.d} opacity={p.opacity} />
        ))}
      </g>
    </svg>
  );
}

export default PresenceMark;
