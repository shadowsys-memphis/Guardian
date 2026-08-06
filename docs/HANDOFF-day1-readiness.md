# HANDOFF — Guardian Day-1 Calling Readiness

**Written by:** Claude Code (Replit workspace), 2026-08-06 ~11:45 UTC / ~04:45 PT
**For:** the next agent (ChatGPT or other) picking this up when Ray's session runs out.
**Self-contained on purpose** — you can read this cold, without the prior conversation.

---

## 1. What this system is, in one paragraph

Guardian is an AI caregiver app for **Pops**, an elderly veteran with PTSD and schizophrenia, run by his caregiver **Ray** (the human you're talking to). Its core function: an AI companion named **Jessica** places a real automated phone call to Pops every morning (ElevenLabs → Twilio), checks on his health, and routes what she learns to Ray's dashboard. The repo is a pnpm monorepo at `/home/runner/workspace` on Replit; the deployed app is `guardian-os-LedgerGhost90.replit.app` and it shares the same PostgreSQL database as the workspace.

**Why this handoff exists:** the automated calling system has never been allowed to run unsupervised. Ray is working through a staged safety gate before it is. That gate is the work in progress.

---

## 2. HARD SAFETY RULES — do not violate these

1. **Never set `dailyCallEnabled` to `true`.** It lives inside the `assessment_settings` JSON blob in the `app_settings` table. It arms real automated phone calls to a schizophrenic veteran. Turning it on is **Ray's decision alone**, and only after Stage 4 below passes. You may turn it **off** for safety at any time.
2. **Never point the system at Pops' real phone number.** All testing targets Ray's own phone. See §4.
3. **Never call ElevenLabs/Twilio APIs directly** to place a call outside the app's own tested path.
4. **One writing agent at a time.** Ray's standing team contract: *Claude Code in the Replit workspace is the only agent that makes changes* (code, git, DB, config). Other agents (Open Claw on Mac, and you) are **read-only advisors** — review, verify, explain, draft. Do not commit, push, edit files, create branches/folders, or write to the database unless Ray explicitly moves that authority to you. A second writer on a system that phones a vulnerable person is a real hazard, not a formality.
5. Decisions with real-world consequences (enabling calls, deploying, deleting) are Ray's.

---

## 3. Where the staged gate stands

Ray's plan, Stage 0 → 5. **Stages 0 and 1 are complete. Stage 2 is next.**

| Stage | What it is | Status |
|---|---|---|
| 0 | Confirm safe state — `dailyCallEnabled` off | ✅ **DONE** 2026-08-06 |
| 1 | Redirect call target to Ray's own phone | ✅ **DONE** 2026-08-06 |
| 2 | Exercise all 8 cron jobs manually, verify each logs correctly | ⬜ next |
| 3 | Break-test failure modes + close the `ended_at` tracking gap | ⬜ |
| 4 | ONE supervised real call to Pops, Ray present | ⬜ |
| 5 | Enable `dailyCallEnabled` for real, monitor closely | ⬜ Ray only |

### Stage 0 — what was found and done
`dailyCallEnabled` was found **TRUE** at 10:52 UTC — flipped during an earlier session and never flipped back. It was scheduled to fire a real call at 10:00 AM PT that day. **Set to FALSE at ~10:55 UTC**, about 6 hours before fire time.

Verified no call has ever fired: zero `daily_call` rows in `cron_job_log`, and the `daily_call_last_triggered_date` claim key does not exist. How it got flipped TRUE without a working UI at the time was never explained — **treat any future unexplained TRUE as an incident.**

### Stage 1 — what was found and done
`pops_phone_number` = `+19097324902`, **which is Ray's own phone, not Pops'.** It had already held that value since 2026-07-26 (the day of the 17 historical test sessions), so even while the flag was mistakenly TRUE, calls would have gone to Ray.

**Pops' real number is not stored anywhere in the system.** Ray must enter it manually at Stage 4.

Verified the number is read **live at call time, not cached**: `triggerOutboundCall()` runs a fresh `SELECT` on `app_settings.pops_phone_number` on every attempt (`artifacts/api-server/src/routes/jessica.ts`, `getPopsPhonenumber()` at ~line 55, used at ~line 138, passed as `to_number` at ~line 193). No module-level cache, no restart needed. The only other number source is the `ADMIN_PHONE_NUMBER` env var (used only when `test: true`), which holds the same Ray number.

---

## 4. Current live state (verified, 2026-08-06 ~11:45 UTC)

```
assessment_settings = {"quietWindowStart":"22:00","quietWindowEnd":"07:00",
                       "engagementIntervalHours":4,
                       "dailyCallEnabled":false,      ← SAFE
                       "dailyCallTime":"10:00"}
pops_phone_number   = +19097324902  ← Ray's phone, NOT Pops'
haldol_cycle        = last_injection_date 2026-08-05, interval_days 28,
                      zombie_phase_days 5 → next due 2026-09-02
call_sessions       = 17 rows, all 2026-07-26, all ended_at NULL (legacy)
cron_job_log        = daily_call rows: 0  (no call has ever fired)
```

Read-only verification query (safe to run):
```bash
cd /home/runner/workspace/lib/db && node -e "
const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(\"SELECT key,value FROM app_settings WHERE key IN ('assessment_settings','pops_phone_number')\")
 .then(r=>{console.log(r.rows);return p.end()})"
```

---

## 5. How the calling system actually works (the parts that matter)

**Scheduler:** `artifacts/api-server/src/lib/call-scheduler.ts` — 8 jobs, one 60-second `setInterval` tick, started once from `src/index.ts`. All scheduling decisions are Pacific time (`src/lib/pacific-time.ts`). Runs log to the `cron_job_log` table; once-per-day jobs claim a slot via an atomic conditional UPSERT (`claimForToday`).

The 8 jobs: `daily_call`, `appointment_reminder`, `haldol_alert`, `med_refusal_escalation`, `wellbeing_escalation`, `rotation_reset`, `missed_call_detection`, `quarter_auto_advance`. Only the first two can place phone calls.

**Two ways a call can be triggered — they behave differently, and this matters:**

| Path | Master switch? | Quiet window? | Notes |
|---|---|---|---|
| Cron "Run Now" (force) on `daily_call` | **bypassed** | **enforced** (`call-scheduler.ts` ~line 226) | also bypasses time gate + daily claim |
| Settings → Jessica → "Call Now" button (`POST /jessica/outbound-call`, `jessica.ts` ~line 251) | **not checked** | **not checked** | dials immediately, any hour |

So while `dailyCallEnabled` is FALSE, the scheduler cannot call — but **either button still can.** That is safe *only* because the target is Ray's phone. It is the single most important thing to understand before touching this system.

**Call session lifecycle / the `ended_at` gap:** an outbound call inserts a `call_sessions` row with `reached: false` and `ended_at` NULL. When the call ends, ElevenLabs POSTs to the public webhook `POST /jessica/elevenlabs-webhook`, which sets `ended_at = NOW()`, `reached`, `summary`, `flagged`, and the full `transcript` (`jessica.ts` ~line 419). The mechanism exists in code — **it has never been verified against a real call.** That verification is Stage 3's requirement and can be done as part of the first Stage 2 test call.

---

## 6. Known issues / open blockers before Stage 5

1. **Deployment is Autoscale, not Reserved VM** (`.replit` line 11: `deploymentTarget = "autoscale"`). An autoscale app sleeps when idle — no process means no 60-second tick, so the 10:00 AM call would simply never fire. Cron-log timestamp gaps confirm multi-hour sleeps. **This must change to Reserved VM (or an external pinger) before Stage 5 means anything.** Ray's decision + a republish.
2. **The ElevenLabs webhook is public and unauthenticated.** PR #2 (signature verification, open since Jul 21) is unmerged. A forged POST could set `reached=true` — masking a genuinely missed call to Pops — or inject a fake transcript/summary. Should be resolved before Stage 5.
3. **`ended_at` never verified live** (see §5). All 17 existing rows are NULL, so the system currently cannot distinguish a completed call from a dropped one.
4. **Document-scanner gap:** appointments captured by the document scanner land in `schedule_tasks`, not `medical_appointments` — so they never generate a night-before reminder call. Scanned appointments must be re-entered by hand in the Appointments tab until fixed.
5. A partial multi-agent code audit was run and then stopped early to conserve Ray's budget. Raw agent transcripts (findings beyond the above) are on disk at:
   `/home/runner/.claude/projects/-home-runner-workspace/902b377f-b013-46cd-b35c-7fb96af7cfe9/subagents/workflows/wf_d7bae4f4-d4a/journal.jsonl`
   Mine it before re-running anything — several areas completed and their findings are recorded there.

---

## 7. The immediate next action

**Stage 2, item 1 — one test call to Ray's own phone.** No code change needed, nothing to deploy. Ray opens `/settings` → Jessica tab → **Call Now**, answers his phone, talks to Jessica for a minute, hangs up. Then check the newest `call_sessions` row:

- At dial time it should appear with `reached = false`, `ended_at` NULL.
- After hanging up, the webhook should flip it to `ended_at` set, `reached = true`, with `summary` and `transcript` populated.

If that second half does not happen, you have found the most important bug in the system, and it must be fixed before Pops is ever called. That single test satisfies Stage 2 item 1 and the Stage 3 tracking-gap requirement at once.

Everything else in Stage 2 (the other 7 jobs) can be exercised afterward via the Run Now buttons on `/settings` → System tab, checking that each writes a `cron_job_log` row.

---

## 8. What has already been changed — please review this

Everything below was done by Claude Code in the Replit workspace on 2026-08-06. A second pair of eyes on it is welcome; each item lists how to verify it independently.

### Database changes (3) — no code involved, live immediately

| # | Change | Why | How to verify |
|---|---|---|---|
| 1 | `assessment_settings.dailyCallEnabled`: `true` → **`false`** | Found unexpectedly armed, ~6h before a real 10:00 PT call would have fired. Safety flip. | Query in §4. Confirm `false`. |
| 2 | `pops_phone_number` re-written to `+19097324902` | Stage 1 redirect. **Note: it already held this value** — the write was a confirmation, not a correction. Only `updated_at` actually changed. | Query in §4. Confirm it is Ray's number. |
| 3 | `haldol_cycle.last_injection_date`: `2026-08-06` → **`2026-08-05`** | Ray's correction — cycle restarted with Aug 5 as day 1. Makes today (Aug 6) cycle **day 2 of 28**, next injection **2026-09-02**, zombie/soft-tone window Aug 5–9. Provenance appended to the row's `notes`. | `SELECT last_injection_date, interval_days FROM haldol_cycle;` — expect 2026-08-05 / 28. Check the derived day count matches what the UI shows. |

**Worth a reviewer's attention on #3:** the `notes` field now contains both the original "Shot given 2026-08-06 — confirmed by Ray same day" text and the correction. If Aug 5 is right, the older sentence is stale and someone may want to clean it up. Confirm the intended date with Ray — this drives Jessica's tone and the overdue alert.

### Code / docs commits

| Commit | What | Review notes |
|---|---|---|
| `69b7960` | `docs/HANDOFF.md` updated — Stage 0/1 recorded, Haldol date corrected, settings + rotation items closed, webhook security flagged | Docs only, no runtime impact. |
| `2ba8549` | **Settings consolidation** — daily-call toggle + call-time moved to `/settings` → Jessica tab; `SystemJobsPanel` extracted to `src/components/system-jobs-panel.tsx` and given a `/settings` → System tab; dead `AppSettingsTab` deleted from `admin-view.tsx` | Built to the locked spec in `docs/spec-settings-consolidation.md`, which lists 7 acceptance criteria — **re-running those greps and `pnpm run typecheck` from the repo root is a genuinely useful review task.** Key risk to check: does saving the quiet window (or any other `assessment_settings` field) from a different Settings tab overwrite `dailyCallEnabled`? A partial-payload write there could silently re-arm or disarm the daily call. This was flagged for audit but **not yet confirmed either way** — it is a plausible explanation for how the flag got flipped TRUE unexplained. |
| `43f0c4f` | **Rotation reset fix** — the midnight reset no longer wipes completions earned the same Pacific day (Replit's constant restarts made the catch-up run land mid-afternoon and erase Ray's morning caregiving checkoffs); save failures now surface in the UI | Verify the `WHERE` clause in `rotationResetJob` (`call-scheduler.ts` ~line 473) excludes rows completed today. |

### Infrastructure

**GitHub auto-sync was broken and is fixed.** A Replit env refresh wiped git's credential helper at 10:03 UTC, stranding 3 commits locally and writing the `GITHUB-SYNC-FAILED.txt` alert file. Repaired with `gh auth setup-git`, pushed, alert file deleted. `master` is level with `origin/master`. This is a known recurring failure — the same recipe fixes it each time.

### What was NOT done, deliberately

- `dailyCallEnabled` was **not** re-enabled and must not be.
- No test call has been placed yet — Stage 2 has not started.
- No backend code was changed this session. The webhook signature verification (PR #2) remains unmerged.
- The multi-agent audit was stopped early to conserve budget; its partial findings are on disk (§6 item 5), not yet synthesized into a report.

---

## 9. Repo orientation, briefly

- `artifacts/api-server/` — Express 5 API. Routes in `src/routes/`, scheduler in `src/lib/call-scheduler.ts`.
- `artifacts/brain-app/` — React frontend. `/settings` page is `src/pages/settings-view.tsx`; cron monitor is `src/components/system-jobs-panel.tsx`.
- `lib/db/` — Drizzle schema + `pool` export for raw SQL. **`drizzle-kit push` hangs in this environment** — use raw SQL via `pool`.
- `docs/HANDOFF.md` — the broader project ground-truth doc (team contract, medical facts, repo topology). Read it alongside this file.
- `CLAUDE.md` and `.claude/CLAUDE.md` — architecture guidance, auth tiers, gotchas.
- Typecheck with `pnpm run typecheck` **from the repo root**. There is no test framework in this repo.
- Haldol cycle is **28 days**, prescriber-set. Any hardcoded 14-day/biweekly logic anywhere is a bug.
