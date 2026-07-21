# iOS Calendar: Push All Alerts & Reminders

## What & Why
Ray needs to respond to time-sensitive events — appointments, medication windows, shopping alerts, task reminders — from his iOS Calendar, which is far more reliable for action-required notifications than ntfy. The Google Calendar API endpoint already exists (`POST /api/calendar/events`). This task wires it up across the entire app so everything important flows to iOS Calendar automatically.

## Done looks like
- A "Push to Calendar" button appears on: appointments, medication schedules (Haldol dosing windows), shopping alerts, and rotation task reminders
- The AI agent (Jessica) can push calendar events on Ray's behalf when it detects time-sensitive needs (e.g., low inventory, upcoming med change, missed task)
- A dedicated "Calendar Sync" panel in the Admin view lets Ray push categories in bulk (e.g., "push all upcoming appointments", "push all active shopping alerts")
- Events appear on Ray's iOS Calendar via Google Calendar sync within ~1 minute
- Events include enough detail in the description to act without opening the app (medication dose, store + item for shopping, task details)
- Alerts set to fire 30 min before for appointments, at the exact time for medication windows, and as all-day events for shopping reminders

## Out of scope
- CalDAV / iCloud-native integration (Google Calendar → iOS is sufficient)
- Push to other users' calendars (Ray's only)
- Two-way sync (read events back from Google Calendar into the app)
- Creating a new OAuth flow — relies on the token already captured by Task #17's Google Workspace integration

## Steps
1. **Calendar push service (shared utility)** — Create a reusable `pushToCalendar(token, event)` helper that wraps the existing `POST /api/calendar/events` endpoint, with sensible defaults: 30-min pre-event alert, `America/New_York` timezone, and structured description formatting.

2. **Appointment & medication events** — Wire the Rotation Dashboard and Haldol cycle tracker (Task #26) so each appointment and upcoming medication dosing window has a "Push to Calendar" button that calls the helper. Medication events should include dose, time, and any cycle-change warnings in the description.

3. **Shopping alert events** — In the Shopper module, when an item is marked urgent or inventory hits zero, automatically push an all-day calendar event with store name, item, quantity needed, and any price alert. Also add a manual "Push to Calendar" button on the shopping list.

4. **Task rotation reminders** — On the Rotation tab, let Ray push any uncompleted task as a calendar reminder for a chosen time (default: today at the task's scheduled hour).

5. **Jessica AI calendar pushes** — Give the AI agent the ability to call the calendar push service when it detects actionable time-sensitive situations in conversation (e.g., "Pops has a cardiology appointment Friday" → offer to push it, "We're out of wipes" → push a shopping reminder).

6. **Bulk Calendar Sync panel** — Add a "Calendar Sync" card to the Admin view with toggle categories (Appointments, Medications, Shopping, Tasks) and a "Push All" button that queues and sends all pending items in the selected categories as calendar events.

## Relevant files
- `artifacts/api-server/src/routes/workspace.ts`
- `artifacts/brain-app/src/pages/admin-view.tsx`
- `lib/api-spec/openapi.yaml`
