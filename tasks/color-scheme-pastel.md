# Pastel Color Scheme Redesign

**Status:** SHIPPED — `--primary: 142 38% 44%` (green) in `index.css`; navy/gold is gone. _(audited 2026-08-11)_

## What & Why
Replace the current military navy/gold theme with a softer palette: muted pastel greens as the primary tone, pastel light reds as accent/highlight color, and crisp off-white as the base background. This gives the app a cleaner, more approachable feel.

## Done looks like
- Background is crisp off-white (not stark white — slightly warm or cool tint)
- Primary UI elements (cards, nav, panels) use muted pastel greens
- Highlights, badges, alerts, and interactive accents use pastel light red/rose
- Text is dark enough to contrast against the off-white background
- No remnants of the old navy, gold, or amber palette remain
- Hardcoded colors in jessica-view, pops-view, and admin-view are updated to match

## Out of scope
- Font or typography changes
- Layout or structural changes
- Adding new UI components

## Steps
1. **Redefine CSS variables in `index.css`** — Update the `@theme` block and all HSL CSS variables: set `--background` to off-white, `--foreground` to a dark neutral, `--primary` to muted pastel green, `--accent`/highlight to pastel light red/rose, and adjust `--secondary`, `--border`, `--muted` to harmonize. Remove or tone down CRT/scanline effects that clash with the new palette.

2. **Update hardcoded colors in page files** — Replace the Matrix green (`#00ff41`) in `jessica-view.tsx`, amber shadow in `pops-view.tsx`, and red shadow in `admin-view.tsx` with equivalents from the new pastel palette.

3. **Audit and adjust component-level styling** — Scan other page/component files for any inline or Tailwind arbitrary color classes (e.g. `bg-[#...]`, `text-[#...]`) that reference the old navy/gold theme and update them to match the new scheme.

## Relevant files
- `artifacts/brain-app/src/index.css`
- `artifacts/brain-app/src/pages/jessica-view.tsx`
- `artifacts/brain-app/src/pages/pops-view.tsx`
- `artifacts/brain-app/src/pages/admin-view.tsx`
- `artifacts/brain-app/components.json`
