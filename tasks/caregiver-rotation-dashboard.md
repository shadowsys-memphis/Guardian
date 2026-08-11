# Caregiver Rotation Dashboard + AI Clinical Summary

**Status:** SHIPPED — `artifacts/api-server/src/routes/rotation.ts` + `rotation_tasks` table. _(audited 2026-08-11)_

## What & Why
Port the core caregiving rotation system from the `care-giver-os` iteration into the existing Admin view. This adds structured patient task tracking by time-of-day, medication response logging, weekly efficacy history, a 1-button AI clinical summary compiler, and a System AI chat panel — all of which are absent from the current app.

## Done looks like
- Admin view has a new **"Rotation"** tab alongside the existing dashboard/schedule/symptoms/scripts/haldol/health/shopper tabs.
- The Rotation tab shows tasks grouped by period (morning / afternoon / night) with a period filter toggle.
- Each task card shows: time slot badge, category badge (Medication / Food Intake / Physical Rotation / Cognitive / Biometric Read), hourly/bi-hourly indicator, and a check-off button.
- Medication tasks display inline response buttons: 🟢 Stable / 🟡 Drowsy / 🟠 Fatigued / 🔴 Agitated.
- Each task has a freeform clinical notes input field.
- A stats bar at the top shows overall completion % and hourly-task completion % (live, derived from task state).
- A "Hourly Only" filter toggle shows just the bi-hourly rotation items.
- A **"Record Custom Rotation Chore"** form lets the admin add tasks with title, period, category, time slot, and hourly flag.
- A collapsible **System AI** panel in the admin header lets Raymo chat with the Gemini assistant (using existing `/api/assistant` endpoint), passing current task state as context.
- A **"Generate Clinical Summary"** button calls `/api/admin/summary`, displays a formatted markdown report in a modal, and offers Copy / Download TXT actions.
- A **Historical Efficacy** section shows past-week logs (date, wants-responded %, med-adherence %, sore-rotation %, efficacy score 0–10).
- All data persists via new Drizzle tables: `rotation_tasks` and `historical_care_logs`.
- New API routes follow the existing spec-first pattern: add to `openapi.yaml`, run codegen, implement backend, wire frontend.

## Out of scope
- Google Calendar / Drive export (separate task).
- The TwilioAssistant / phone dialer enhancements (separate task).
- Shopper engine changes (separate task).

## Steps
1. **Schema & OpenAPI** — Add `rotation_tasks` (id, title, period, time_slot, is_hourly, category, status, med_response, logged_note, completed_at) and `historical_care_logs` (id, date_label, wants_responded_rate, med_adherence, sore_rotation_complete, general_notes, efficacy_score) to Drizzle schema. Add corresponding CRUD endpoints to `openapi.yaml` and run codegen.

2. **Backend routes** — Implement `GET /api/rotation/tasks`, `POST /api/rotation/tasks`, `PATCH /api/rotation/tasks/:id` (toggle status, set medResponse, update note), `DELETE /api/rotation/tasks/:id`. Implement `GET /api/rotation/logs` and `POST /api/rotation/logs`. Seed the 17 default tasks and 3 historical log entries from the `care-giver-os` constants file on first startup.

3. **Backend: Clinical Summary route** — Implement `POST /api/admin/summary` using the Gemini integration (existing `gemini.ts` pattern). Accepts the packed patient state and returns a structured markdown report.

4. **Rotation tab UI** — Build the Rotation tab inside `admin-view.tsx`. Period filter toggles (morning / afternoon / night), hourly-only toggle, completion stats bar, task list with check-off, med-response buttons (Medication tasks only), clinical notes input, custom task form. Wire to the new API hooks.

5. **Historical Efficacy section** — Below the task list render the weekly log cards (date label, 3 percentage bars, efficacy score badge, general notes). Wire to `GET /api/rotation/logs`.

6. **System AI panel** — Add a collapsible chat panel toggled by a "System AI" button in the Admin header. Uses the existing `POST /api/assistant` endpoint, passing current rotation task state as context.

7. **1-Button Clinical Summary** — Add the "Generate Clinical Summary" button and modal to the Rotation tab. On click, POST to `/api/admin/summary` with packed state. Render markdown line-by-line in the modal with Copy and Download TXT buttons.

## Relevant files
- `artifacts/brain-app/src/pages/admin-view.tsx`
- `artifacts/api-server/src/routes/gemini.ts`
- `artifacts/api-server/src/routes/scripts.ts`
- `artifacts/api-server/src/routes/schedule.ts`
- `artifacts/api-server/src/routes/haldol.ts`
- `artifacts/api-server/src/routes/index.ts`
- `/tmp/caregiver-os/src/App.tsx`
- `/tmp/caregiver-os/src/types.ts`
- `/tmp/caregiver-os/src/lib/constants.ts`
- `/tmp/caregiver-os/server.ts`
