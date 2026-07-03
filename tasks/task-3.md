---
title: Health Intelligence System (Jessica Assessments + Dashboard)
---
# Health Intelligence System (Jessica Assessments + Dashboard)

## What & Why
Jessica's daily calls to Pops are structured health assessments in disguise. She asks optimized questions — covering mood, medication side effects, sleep, appetite, cognitive clarity, voice activity, and energy — and his natural spoken answers become the primary health data source. Ray's dashboard surfaces that data as actionable intelligence: trends, cycle-day correlations, anomaly flags, and a running health picture that would otherwise require a clinical visit to get.

For Pops: he has a conversation with a friend. He never knows he's being assessed.
For Ray: a real-time, longitudinal health record built from nothing but daily voice calls.

## Done looks like
- A structured question library in the DB: question text, category (mood / medication / sleep / appetite / cognition / voices / energy), expected response type (yes-no / scale 1-5 / free text), and which cycle days it's prioritized
- Jessica pulls the day's question set based on Pops' current cycle phase and asks them naturally mid-conversation — not as a checklist but woven into dialogue ("How'd you sleep last night?" / "Any of those background voices been louder today?")
- Pops' answers are parsed by Gemini into structured data points: `{ category: "voices", value: "yes", intensity: "mild", raw: "yeah a little but not bad" }` and stored per call session
- Ray's admin dashboard has a "Health" section showing:
  - Today's assessment summary (all categories, green/yellow/red status)
  - 30-day trend charts per category (mood, sleep, voices, appetite)
  - Cycle-day overlay: patterns mapped against Haldol cycle days so Ray can see correlations
  - Anomaly alerts: if a key metric spikes (e.g., voices reported intense 3 days running), a flag appears at the top
- Call session log: each call shows the questions asked, Pops' raw responses, and the parsed data
- Ray can edit/add questions to the library and mark which ones are "always ask" vs. cycle-phase-conditional
- Daily task completion (meds taken, meals eaten) is tracked as a sub-category within the same assessment flow — not a separate system
- A quiet window (configurable) prevents Jessica from initiating calls during off-hours

## Out of scope
- Clinical diagnosis or medical recommendations
- Integration with EHR / external health systems
- Automated outbound phone dialing (Jessica initiates in-app, not via carrier)
- Multi-patient support

## Steps
1. **DB schema** — Add `health_questions` (text, category, response_type, cycle_days, priority, active), `call_sessions` (date, cycle_day, duration, summary), `health_data_points` (session_id, question_id, raw_response, parsed_value, parsed_intensity, category, flagged). Add `app_settings` for quiet window.
2. **Question library seed** — Pre-populate with 20–30 optimized questions across all categories. Examples: "How's your energy today — low, okay, or good?" / "Any of the voices been active?" / "Did you sleep through the night?" / "How's your appetite been?" / "Did you take your morning meds?" Weight questions by cycle phase.
3. **Jessica assessment flow** — Extend the Gemini system prompt so Jessica weaves the day's question set into natural conversation. After each answer, Gemini extracts a structured data point and emits it as a `<health_data>{json}</health_data>` tag in the stream. The API server intercepts these tags, saves each data point to the DB, and strips the tag before sending to the client.
4. **Call session management** — On conversation start, open a `call_session` record tied to today's date and cycle day. On end (user hangs up or 30-min timeout), close the session and compute a session summary (categories covered, any flags).
5. **Admin Health dashboard** — New "Health" tab in Ray's admin panel. Today's summary grid (category cards with status color), 30-day line charts per category, cycle-day heatmap overlay, and anomaly alert banner. Uses data from `health_data_points` aggregated per session.
6. **Question library manager** — Admin UI for Ray to view, edit, enable/disable questions, and adjust cycle-day weighting. Simple table with toggles.
7. **Pops' home screen** — `/pops` shows today's upcoming call times as a simple visual timeline (icon + time only, no clinical language). After a call, a soft completion animation plays so he gets positive feedback.

## Relevant files
- `artifacts/api-server/src/routes/gemini.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/brain-app/src/pages/jessica-phone.tsx`
- `artifacts/brain-app/src/App.tsx`
- `lib/db/src/schema/index.ts`