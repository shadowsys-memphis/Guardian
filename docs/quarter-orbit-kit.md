# Brain Guardian — Quarter Orbit Kit (Living Time Mark)

The 2026 flagship direction, engineered. One lit quarter, one day at a time:
four arcs are the four clock quarters, and the amber light rides the ring
through the actual day — 06:00 at the top, one full turn per day.

Same contract as the Offered kit: animation logic fully decoupled from static
artwork, and the **existing `.is-calling` / `.is-resting` toggles and
`jessica-states.css` drive this mark unchanged.**

## Files

| File | Grid | Purpose |
|---|---|---|
| `quarter-orbit-mark-master.svg` | 256×256 | Master mark. Dial rotates about (128,128). Ships posed at Q1 midpoint. |
| `quarter-orbit-appicon.svg` | 1024×1024 | Static, Q1 lit. Full-bleed square — the OS applies its own mask. |
| `quarter-orbit-favicon.svg` | 32×32 | Small-size variant: one cradle arc + the light. The four gaps blur below ~48px, so they're intentionally dropped. |
| `quarter-orbit-states.css` | — | The time layer: dial rotation, quarter presets, daypart temperature, motion tokens. |
| `react/useDayQuarter.ts` | — | The day clock. Quarter windows identical to `GET /api/state/computed`. |
| `react/QuarterOrbit.tsx` | — | Inline-SVG mount for brain-app. No new deps (`clsx` is already in the catalog). |
| `demo.html` | — | Self-contained proof: scrub the whole day, calling/resting/plate toggles, 96→16px row. |
| `icon-proofs/` | — | Rasterized legibility proofs at 512/192/180/48/32/24/16 + contact sheet. |

## Layer contract (do not flatten)

```
.bg-plate              togglable backdrop (warm cream; dusk navy at night)
.orbit-track           four static arcs — the quarters (.arc-q1 … .arc-q4)
.orbit-dial            rotating group — everything that rides with the light
  .jessica-halo        radial warmth (Resting breath lives here)
  .jessica-core        the amber dot — the anchor
  .jessica-ripple-group  3 rings (.ring-1/2/3), hidden until .is-calling
```

## State management

**Jessica states — unchanged.** Toggle one class on the wrapper or the `<svg>`:

```js
mount.classList.add('is-calling');    // Jessica speaks — from wherever she is in the day
mount.classList.add('is-resting');    // slow halo breath at the daypart's tempo
```

**Time states — new.** Two axes, both plain classes + one CSS variable:

```js
// Discrete (no-JS mounts, admin quarter override):
mount.classList.add('q3');                    // dial snaps to Q3 midpoint

// Continuous (the living mark):
mount.style.setProperty('--orbit-angle', '132deg');
mount.classList.add('daypart-evening');       // color temperature + motion tokens
```

Angle map: `0deg = 06:00`, 90°/quarter, clockwise. Quarter boundaries
(12:00 / 18:00 / 22:00 / 06:00) land in the track gaps — the light visibly
crosses into the next quarter.

In React, don't do any of this by hand:

```tsx
import "jessica-states.css";
import "quarter-orbit-states.css";        // load order matters
import { QuarterOrbit } from "./QuarterOrbit";

<QuarterOrbit size={120} resting />                 // the living mark
<QuarterOrbit quarter={2} />                        // admin override — dial locked, sun still moves
<QuarterOrbit calling plate size={220} />           // Jessica on a call, night plate at night
```

`useDayQuarter` is exported separately — anything else in the app (the Pops
banner, the admin header) can key off the same `{ quarter, daypart, angle }`
so the whole UI breathes on one clock. Tick default is 30s, matching the
Pops view's refresh cadence, and the hook keeps the angle monotonic across
the 06:00 wrap so the dial never spins backwards through the night.

## Motion tokens

Each daypart sets exactly two variables — everything animated reads them:

| Daypart | `--ease-day` | `--dur-scale` |
|---|---|---|
| morning (06–11) | ease-out `0.16,1,0.3,1` | 1 |
| midday (11–15) | sine `0.37,0,0.63,1` | 1 |
| mid-afternoon (15–18) | sine | 1.1 |
| evening (18–22) | viscous `0.65,0,0.35,1` | 1.25 |
| night (22–06) | viscous | 1.3 |

Night also dims the core to 55% — a nightlight, never off — and flips the
plate to dusk navy.

## Mounting rules

1. **Inline the SVG in the DOM.** `<img src="*.svg">` cannot be reached by page CSS.
2. **Multiple instances on one page:** rename each `radialGradient` id. The React component does this automatically via `useId`.
3. **Theming via CSS custom properties** — all Offered-kit variables (`--jessica-amber`, `--jessica-glow`, `--bg-plate-fill`) plus `--track-rest` / `--track-active` / `--orbit-angle`.
4. **SwiftUI/iOS pipeline:** layer names map 1:1; drive the dial by animating the group's rotation about (128,128) and reuse the same 4.5s / 1.5s-stagger call timing.

## Spec deviations (deliberate)

- **Palette canonicalized to the locked sovereign colorway**, not the concept boards' hexes. The boards' pale ambers (e.g. `#FFDDA6`) fail as a lit indicator at small sizes on cream; core stays `#D9A441` Lantern Amber, glow `#E8BC6A`, active track `#7FA382`. Board colors survive only as daypart *tints*.
- **The core never changes color.** The boards tint the traveling light per state; here amber = Jessica on Pops' displays, and that constancy is load-bearing. Temperature moves through the halo, track, and plate instead. Side effect worth keeping: call ripples stroke with `--jessica-glow`, so a dusk call ripples lavender.
- **Five color states ride four clock quarters.** Geometry follows the wall-clock state machine (Q1 0600–1200 · Q2 1200–1800 · Q3 1800–2200 · Q4 2200–0600); color follows the finer daypart clock. The boards conflate the two — the product doesn't.
- **Ripple geometry re-derived for an off-center dot:** base r=20 peaking at ~2.6× keeps every ring inside the 256 viewBox from any dial position (the Offered r=30 / 3.5× would clip once the dot rides the ring). The 4.5s / 1.5s-stagger timing is untouched.
- **Static artwork ships posed at Q1 midpoint** via an attribute transform, so the raw file never shows the bead floating in a gap; runtime CSS overrides the pose.
- **Strict-XML comments** (no `--` inside comments) so resvg / asset-pipeline imports don't choke.

## Performance & accessibility

Only `transform` and `opacity` animate — compositor-only, 60fps on the Pops
tablet. `prefers-reduced-motion`: the dial snaps instead of sweeping, the
breath stops, and calling still communicates via the Offered kit's steady
wide ring.
