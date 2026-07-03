# Unconditional Software Reframe

## What & Why

The current br(AI)n App is built on the wrong foundation for Pops' view — it shows a task grid with checkboxes and completion tracking, which is exactly what the Unconditional Software design philosophy forbids. This task reframes the entire app to match the attached design doc and integrates the Governor system from `governor.py`/`manifest.json`.

**Three major changes:**

1. **Pops' view goes ambient** — no task list, no checkboxes, no guilt. It becomes a passive wall display showing what state the system is in RIGHT NOW (the current scheduled moment), nothing more.
2. **Wall-clock state machine** — the system auto-detects the current quarter from the actual time. No manual quarter switching. Q1=0600-1200, Q2=1200-1800, Q3=1800-2200, Q4=2200-0600.
3. **Governor Panel added to admin** — Raymo's three personal productivity pillars (Productivity: Lulubear Bakery, Passion: SS_III, Curiosity: AI/Crypto Growth) get their own tab in the command center.

## Done looks like

- **Pops' screen (`/pops`):** Full-screen ambient display. Giant time. Giant current-state sentence (e.g. "IT'S MORNING. MEDICATIONS AT 0630."). Zero task list. Zero checkboxes. Zero completion percentage visible.
- **Zombie mode on Pops' screen:** Nearly blank — just the time and a single large phrase like "REST TODAY." Nothing else. No schedule visible at all.
- **Auto quarter:** The system reads wall clock time and updates the displayed state automatically, matching Q1-Q4 time windows. No button press required.
- **Active broadcast message** from Raymo still appears on Pops' screen in large text (override slot).
- **Admin view** has a new "Governor" tab alongside the existing 5 tabs. It shows the three pillars (name, description, focus duration, metrics) and a text area to log a daily synthesis note — stored in the DB and timestamped. No external AI call — just the data panel.
- **Admin dashboard** removes the manual Q1/Q2/Q3/Q4 override buttons (system is now clock-driven), but keeps the zombie mode toggle and broadcast field.
- All existing functionality (symptom log, schedule editor, voice scripts, haldol tracker, Jessica view) remains fully intact.

## Out of scope

- Live Gemini/Perplexity API calls from the Governor panel (future work)
- Physical button hardware integration
- ElevenLabs/SignalWire phone system wiring (separate task)
- Motion sensor detection
- Any changes to Jessica view or the API spec for existing routes

## Tasks

1. **Backend: auto-quarter endpoint** — Add a `GET /api/state/computed` (or augment `GET /api/state`) to return the system-computed current quarter based on wall clock time (Q1=0600-1200, Q2=1200-1800, Q3=1800-2200, Q4=2200-0600). The state API should also return the current scheduled task for that moment (the highest-priority task in the current quarter by `order`). Store override capability (Raymo can lock the quarter manually from admin; if no override exists, the computed value is used).

2. **Database: Governor table** — Add a `governor_pillars` table and a `governor_notes` table. Seed the three pillars from `manifest.json` (Lulubear Bakery/Productivity, SS_III/Passion, AI-Crypto Growth/Curiosity) with their descriptions, metrics, and focus durations. Governor notes are daily text blobs with a timestamp and pillar tag.

3. **Pops' view overhaul** — Replace the 4-column task grid with a full-screen ambient display. Layout: top-left shows `br(AI)n_OS // ONLINE` with pulse dot. Top-right shows a giant `HH:mm:ss` clock. Center of screen shows the current scheduled moment as a single large sentence (time label + task title formatted as a statement). Active broadcast message from Raymo replaces the center content when set. Zombie mode collapses everything except the clock and "REST TODAY" in massive text. Haldol cycle bar stays at the bottom footer as-is. Remove all checkboxes, circles, completion badges, and task grid.

4. **Admin: auto-quarter + Governor tab** — Remove the manual Q1/Q2/Q3/Q4 buttons from the Dashboard tab (replaced by computed display showing "System: Q2 (Auto)" with an optional manual override toggle). Add a new "Governor" tab to the sidebar showing all three pillars as cards (name, description, focus duration, metrics list) plus a form to write and save a daily synthesis note. Notes display in reverse-chronological order below the pillars.

5. **API routes for Governor** — Add `GET /api/governor/pillars` and `POST /api/governor/notes` / `GET /api/governor/notes` endpoints following the existing serialization pattern (explicit serialize functions, no Zod parse on DB output).

6. **Codegen + type refresh** — After all schema and route changes, run `pnpm --filter @workspace/api-spec run codegen` to regenerate the React hooks, then update all relevant view imports.

## Relevant files

- `artifacts/brain-app/src/pages/pops-view.tsx`
- `artifacts/brain-app/src/pages/admin-view.tsx`
- `artifacts/api-server/src/routes/state.ts`
- `lib/db/src/schema/index.ts`
- `lib/api-spec/openapi.yaml`
- `scripts/src/seed.ts`
