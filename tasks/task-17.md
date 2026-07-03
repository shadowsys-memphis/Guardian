---
title: Google Workspace Integration + Enhanced Zero-Touch Dialer
---
# Google Workspace Integration + Enhanced Zero-Touch Dialer

## What & Why
Two complementary integrations from the `care-giver-os` iteration: (1) Google Calendar and Google Drive export hooks so Raymo can push care tasks to his calendar and save clinical summaries/meal plans to Drive; (2) upgrade the existing Jessica Phone page with the full TwilioAssistant UX — call state machine, TTS audio playback, action-parsing dispatch stream, and speaker toggle.

## Done looks like
- From the Rotation tab (Task A), each task card has a **"SYNC CAL"** button that POSTs to `/api/calendar/events` and pushes a Google Calendar event using the user's OAuth access token.
- The Clinical Summary modal (Task A) has an **"Export to Drive"** button that POSTs to `/api/drive/export` and saves the report as a `.txt` file to the user's Google Drive.
- The Shopper tab's meal plan panel has an **"Export Meal Plan to Drive"** button using the same `/api/drive/export` endpoint.
- The **Jessica Phone** page shows the full TwilioAssistant experience:
  - Idle state: "Connect Twilio Line" button with a brief description.
  - Calling state: animated waveform bars + "Bridging Secure Twilio Tunnel..." pulse text + hang-up option.
  - Connected state: live chat bubble thread (user / AI roles), animated waveform status bar, triggered action stream panel (shows dispatched ADD_EVENT / TOGGLE_SMART_DEVICE / ADD_TASK commands as they fire).
  - Speaker toggle button mutes/unmutes TTS audio playback (base64 audio decoded via Web Audio API).
  - Suggested speech preset buttons pre-fill the input.
  - Gemini AI responses are parsed for `---ACTION--- ... ---END_ACTION---` blocks; extracted actions are dispatched via `onTriggerActions` and displayed in the stream.
- All Google OAuth errors show a clear toast message explaining that the user needs to grant permissions.

## Out of scope
- OAuth credential setup / secrets management (those must be provided by Raymo separately).
- MMS/receipt image intake (covered in the Shopper task).
- The core rotation dashboard UI (Task A).

## Steps
1. **Backend: Calendar & Drive routes** — Implement `POST /api/calendar/events` and `POST /api/drive/export` in the API server following the same Express route pattern. Both accept an `x-google-access-token` header from the frontend and use the `googleapis` SDK (already in the caregiver-os server). Return `{ success, link/eventLink }` or a structured error.

2. **Frontend: Calendar sync wiring** — In the Rotation tab (admin-view), wire each task card's "SYNC CAL" button to call the calendar API route. Use the toast system for success/failure feedback.

3. **Frontend: Drive export wiring** — Wire the "Export to Drive" button in the Clinical Summary modal and the "Export Meal Plan to Drive" button in the Shopper tab to the Drive API route. Reuse the existing toast system.

4. **Enhanced Zero-Touch Dialer** — Port the `TwilioAssistant.tsx` component from `care-giver-os` into `artifacts/brain-app/src/components/`. Adapt styles to match the existing design system (shadcn/ui Cards, Buttons, Badges). Replace hardcoded `fetch('/api/assistant')` with the workspace API client pattern.

5. **Jessica Phone page upgrade** — Replace or augment the current `jessica-phone.tsx` with the TwilioAssistant component. Pass the current app state (tasks, schedule, smart home devices) as the `context` prop. Wire `onTriggerActions` to dispatch state mutations via the existing API hooks (add schedule task, toggle smart device, add calendar event).

6. **TTS Audio Playback** — Ensure the `speak: true` flag is passed when the speaker is on, and the returned `audio` base64 string is decoded and played via the Web Audio API (same pattern as in TwilioAssistant.tsx). Handle unsupported/blocked AudioContext gracefully.

## Relevant files
- `artifacts/brain-app/src/pages/jessica-phone.tsx`
- `artifacts/brain-app/src/pages/admin-view.tsx`
- `artifacts/api-server/src/routes/gemini.ts`
- `artifacts/api-server/src/routes/index.ts`
- `/tmp/caregiver-os/src/components/TwilioAssistant.tsx`
- `/tmp/caregiver-os/server.ts:53-211`