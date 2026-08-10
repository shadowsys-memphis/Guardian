---
name: Audio-first interaction mandate (Brain Guardian OS)
description: Core UX principle for this app — phone/voice with Jessica is the primary interface, not the web dashboard
---

The product's stated purpose (from the user, repeated many times across sessions — his words: "explained at least 13 times") is a phone-call-driven, zero-touch caregiving system: Pops gets simple, scheduled (cron) calls from Jessica that keep him aware, on-track, and independent — and the caregiver (Ray) should be able to manage that day-to-day (add/remove/adjust tasks, change schedule) through natural conversation over the phone too, not by opening a web dashboard.

**Why:** The user experiences dashboard-centric fixes (e.g. "go flip this in Settings") as a direct violation of the app's core concept. Repeated instances of agents defaulting to web-UI solutions have caused real frustration and rework (reconfiguring the same settings multiple times).

**How to apply:** When diagnosing or fixing anything related to Pops' schedule, tasks, or reminders, do not default to "go set X in Settings/Admin" as the resolution. If the capability to do it by voice doesn't exist yet, say so explicitly as a gap to close, not as the intended design. When building new schedule/task features, wire the phone/voice path (live-call tool-calling during an ElevenLabs call) first; a web UI is a secondary/fallback surface for Ray's oversight only. As of Aug 2026, no live-call tool-calling exists yet — the ElevenLabs webhook is post-call/transcript-only, so Jessica cannot yet take an action *during* a call. This is a real, known gap, not a misunderstanding to talk the user out of.
