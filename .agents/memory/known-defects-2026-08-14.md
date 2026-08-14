---
name: Known defects found 2026-08-14
description: Verified, still-unfixed defects found while investigating "Jessica never calls Pops" — scheduler cannot run on autoscale, quarter boundaries wrong in three files, document-apply gaps.
---

# Known defects — found 2026-08-14, NOT yet fixed

All of these were read directly out of the source or the live API on 2026-08-14.
Verify before acting — Replit Agent was editing this repo the same day.

## 1. The scheduler cannot run in production (highest severity)

`.replit` has `deploymentTarget = "autoscale"`. Autoscale scales to zero when no
HTTP traffic is arriving. `index.ts:30` starts the job runner as an in-process
`setInterval` (`lib/call-scheduler.ts:823-829`), so the container that owns the
timer is gone between requests.

**Nothing in `call-scheduler.ts` can fire in production.** Not the daily call,
not missed-call detection, not the streak escalation or the admin alert call
added in `ec4cf27`. Production logs contain zero `elevenlabs_config_check`
lines; every cron_job_log row seen during this investigation came from the
*dev* database (dev and prod are separate DBs).

This — not the ElevenLabs credentials, and not `dailyCallEnabled` — is the
reason no calls reach Pops.

Fix: `deploymentTarget = "vm"` (Reserved VM, always-on; the existing code then
works as written). The alternative — keeping autoscale and driving jobs from a
Replit Scheduled Deployment hitting an authed endpoint on `routes/cron.ts` —
requires rewriting the scheduler around statelessness, because it currently
assumes a long-lived process: 60s ticks, an in-memory `lastPolledAt` Map, and a
missed-call job that must wake two hours after the call time.

## 2. Quarter boundaries don't match Pops' actual schedule

Ray's printed schedule:

```
Q1  Morning     6:00 AM – 10:00 AM
Q2  Midday     10:00 AM –  2:00 PM
Q3  Fun Block   2:00 PM –  6:00 PM
Q4  Wind Down   6:00 PM – bedtime
```

The code uses `6 / 12 / 18 / 22` — Q1 two hours long, Q3 and Q4 four hours late.
Effect: for roughly ten of sixteen waking hours the system believes Pops is in a
different block than he is, and the Fun Block is never the current quarter at
all. **Pops does not use a screen** — he is on the phone with Jessica — so the
damage is that Jessica references the wrong part of his day on calls, and that
any quarter-derived context handed to her is wrong.

Hardcoded in three copies:
- `artifacts/api-server/src/routes/state.ts:9-15` — `computeCurrentQuarter()`
- `artifacts/api-server/src/lib/call-scheduler.ts:731-736` — `computeQuarterForHour()`
- `artifacts/api-server/src/lib/jessica-tools.ts:21-26` — `quarterForHour()`

`jessica-tools.ts:16-19` carries a comment asserting the duplication is
deliberate. It is not — that comment is what allowed the three to drift. Extract
one shared helper and delete the copies.

Related: `lib/tenant-migration.ts:13` seeds a `1000` "Morning Walk" into Q1;
10:00 AM is Q2 under the real windows.

Also: `schedule_tasks.time_label` is stored and rendered as military strings
(`"0600"`, `"1800"`). Ray reads these in the admin/schedule views and wants
12-hour with AM/PM. This is a caregiver-facing nicety, not a Pops-facing one.

## 3. Jessica touchpoint count

Ray's schedule expects roughly **ten** Jessica interactions per day — 6:00
wake-up, 8:15 hydration, 10:00 chores assigned, 12:00 meds, 1:00 hydration,
2:00 activity suggestion, 5:00 health check, 6:00 meds, 8:00 journal prompt,
9:00 sleep check.

`call-scheduler.ts` implements **one**: `dailyCallJob`, at a single configurable
`dailyCallTime`. The other nine have no job behind them.

**All ten are voice.** Pops does not use a screen — there is no display-prompt
option, and the `/pops` page is a caregiver view, not his. Meds are reminded at
noon AND 6:00 PM (both correct; confirmed 2026-08-14).

This is the actual product. Everything else in this file is peripheral to it.
The design discussed: a `touchpoints` table (`time_of_day`, `purpose`,
`purpose_prompt`, `active`), one generic job that fires whichever touchpoints
are due, per-touchpoint once-daily claim keys reusing `claimForToday`, and
`purpose_prompt` flowing into the `extraContext` argument `triggerOutboundCall`
already accepts — so Jessica knows she is doing an 8:15 hydration nudge rather
than the same generic check-in ten times. Blocked on defect #1: ten touchpoints
a day on a scale-to-zero deployment is zero touchpoints.

Related: Jessica's live ElevenLabs agent prompt asks "whether he took his
medication" on EVERY call. Once touchpoints exist, medication language belongs
only on the noon and 6:00 PM prompts.

## 4. `POST /documents/apply` gaps (`routes/documents.ts`)

Verified by reading the file; Replit was actively fixing this area, so re-check.

- **Not transactional** (`:360-519`). No `db.transaction()` anywhere in the file.
  A failure mid-loop leaves partial care-plan writes. `appliedAt` is set at
  `:502` *before* `dispatch()` at `:506`, so a dispatch failure returns 500 with
  the document already marked applied.
- **Restrictions cannot be cleared** (`:466`, `:480`). Both writes are gated on
  `.length > 0`, so unchecking every restriction and re-applying silently leaves
  the old values, despite the UI promising restrictions are replaced.
- **Medication swap is not atomic** (`:443` deactivate → `:455` insert). If the
  insert fails the medication is left deactivated and effectively deleted.
- **`quarter: "Q1"` is hardcoded** at `:396` when inserting the schedule task.
  Scanned appointments should land in the active quarter. Currently masked
  because the wall clock happens to be Q1; breaks at the next advance.
  (This one was missed by the automated audit of this pipeline.)

## 5. `ELEVENLABS_HANDOFF.md` points at the wrong agent

Line 10 instructs setting `ELEVENLABS_AGENT_ID` to
`agent_8301kb79tgd1fgfrc0bh6sjnwp8e` — that is **Laura**, a blank-default agent
in a different, free-tier ElevenLabs account with no phone numbers. Line 23
wrongly claims "Jessica is the in-app branding, not the ElevenLabs object name."

The real agent is `agent_2101kkxm5vnwety8ycdrv0d1fadn` ("Jessica", full Pops
system prompt, owns `+1 844-495-0750` / `phnum_0901kyf3mdpsesettfj938kbxsqp`,
account raymond.jessee90@gmail.com). Correct this doc or it keeps
re-introducing the misconfiguration.

Note that `elevenlabs_config_check` only proves the IDs *resolve*. A
wrong-but-valid agent passes silently — cross-check identity via
`GET /v1/convai/phone-numbers` → `assigned_agent.agent_id`. See
`elevenlabs-live-state-verification.md`.
