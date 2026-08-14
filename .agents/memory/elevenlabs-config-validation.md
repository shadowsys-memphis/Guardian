---
name: ElevenLabs config validation
description: How the daily ElevenLabs agent/phone-number health check works and where its alert surfaces.
---

# ElevenLabs Config Validation

## The rule
ELEVENLABS_AGENT_ID and ELEVENLABS_PHONE_NUMBER_ID are validated against ElevenLabs' live API at startup AND daily at 8:00 AM PT. Results are stored in `app_settings` key `elevenlabs_config_alert` and surface as a dashboard banner in `system-jobs-panel.tsx`. This catches deleted/renamed agents before they silently kill the next scheduled call.

**Why:** The previous behaviour was a buried startup log line ("Skipped syncing voice tools... document_not_found"). By the time Ray noticed, 5 consecutive daily calls had failed silently.

**How to apply:** Any new ElevenLabs credential (e.g. a new agent for a different persona) should be added to `validateElevenLabsConfig()` in `artifacts/api-server/src/lib/call-scheduler.ts`. The validation job is `elevenlabs_config_check` in CRON_JOBS.

## Missed-call streak escalation
- Streak tracked in `app_settings` key `missed_call_streak` (count) and `missed_call_streak_alert` (JSON, streak ≥ 2 only)
- When streak ≥ 2: persistent dashboard banner (survives per-day dismissal) + outbound ElevenLabs call to ADMIN_PHONE_NUMBER (throttled once per Pacific day, respects quiet window)
- Admin call uses `triggerOutboundCall({ test: true, extraContext: "..." })` — `test: true` routes to ADMIN_PHONE_NUMBER, never Pops' number
- `acknowledgeAlert` now accepts: `"med_refusal" | "wellbeing" | "missed_call" | "missed_call_streak" | "elevenlabs_config"`
- Streak alert clears automatically when a successful call is detected by `missedCallJob` (no manual reset needed)
