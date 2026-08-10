---
name: Scanned appointment → reminder routing
description: Document Scanner apply flow writes appointments into medical_appointments (not just schedule_tasks) so the night-before reminder job can find them; type vocabulary must stay in sync across three files.
---

## Type vocabulary must match across three places
The appointment-type normalizer in `documents.ts`, the fasting-check keyword match in `call-scheduler.ts` (`type.includes("bloodwork") || type.includes("lab")`), and the `TYPE_LABELS` display map in `admin-view.tsx` (Appointments tab) all read/write the same `medical_appointments.type` string but live in three different files with no shared enum. A normalizer that invents a new value (e.g. `"bloodwork"`) not in `TYPE_LABELS` shows an unlabeled raw badge in the UI even if the fasting-check still matches by luck. Always map inferred/extracted types onto the existing `TYPE_LABELS` vocabulary (currently `primary_care/psychiatry/cardiology/neurology/va_appointment/lab_work/other`), and confirm whichever value means "needs the fasting warning" still contains a fasting-check keyword.

**Why:** found while fixing scanned appointments never reaching the reminder job — a prior partial fix had already dual-written into `medical_appointments` but normalized type to values the frontend couldn't label.

**How to apply:** any change to appointment-type inference, the fasting-check keyword list, or `TYPE_LABELS` must be checked against the other two.

## Multiple insert destinations need independently-checked duplicate guards
When one user action must write the same logical record into two tables serving different consumers (here: `schedule_tasks` for the dashboard/rotation display, `medical_appointments` for the reminder-call job), give each table its own existence check before its own insert — don't `continue`/short-circuit the loop after only the first table's check. A single shared guard means a record already present in table A but missing from table B (e.g. because B's write was added later) can never be backfilled by re-running the action.

**Why:** the original dual-write had one `continue` gating both inserts, so documents applied before the `medical_appointments` write existed could never be repaired even via the app's own "re-apply/overwrite" flow.

**How to apply:** when adding a second write target to an existing idempotent insert loop, give it its own `if (overwrite) { check-exists }` guard rather than reusing the first table's boolean. Verified end-to-end via direct DB inserts/deletes + calling the real endpoint with a local-session JWT — never invoke the actual cron job or call-placing endpoints for this kind of test in this repo (see hard safety rules in `docs/HANDOFF-day1-readiness.md`).
