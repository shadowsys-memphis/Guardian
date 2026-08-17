# TODO — Guardian

*Built 2026-08-17. Every item below was verified against source at commit `775bc80`,
not copied forward from older notes. Companion to `STATUS.md` (narrative) — this file
is the actionable list.*

> **Permanent safety rule:** the automated daily call stays **OFF** until Ray runs a full
> day against his own phone (909-732-4902) with zero issues and explicitly says turn it on.
> Test calls go to Ray's number only. Never flip `dailyCallEnabled` without him.

---

## P0 — Blockers

### 1. Deployment target is `autoscale` — no scheduled job can fire in production
`.replit:11` → `deploymentTarget = "autoscale"`. Autoscale scales to zero between HTTP
requests; `index.ts:30` starts the job runner as an in-process `setInterval`
(`lib/call-scheduler.ts`). The container owning the timer is gone between requests.

**Nothing in `call-scheduler.ts` can run in prod** — not the daily call, not missed-call
detection, not streak escalation, not quarter auto-advance. This, not the ElevenLabs
credentials and not `dailyCallEnabled`, is why no calls reach Pops.

- **Fix:** `deploymentTarget = "vm"` (Reserved VM, always-on). Existing code then works as written.
- **Alternative:** keep autoscale + Replit Scheduled Deployment hitting an authed endpoint —
  requires rewriting the scheduler around statelessness (it assumes 60s ticks, an in-memory
  `lastPolledAt` Map, and a missed-call job that wakes two hours later).
- Reserved VM costs money — **Ray's decision, not an agent's.**
- **Blocks #4 and #5.**

### 2. GitHub push auth is broken — today's work exists only on this Repl
`.git/autopush.log`: `Invalid username or token. Password authentication is not supported`.
Needs a Personal Access Token.

Local `master` is **2 commits ahead** of `origin/master`:
- `bb5b4dd` — tenant-scoping fix in `loadLiveContext()`
- `775bc80` — session-expiry handling

Until this is fixed, any other machine or agent working from GitHub reads code **without the
tenant fix** and will describe a system that doesn't match what's running.

### 3. No transcript has ever saved — 0 across 20 call sessions
Webhook is attached (`ea0faa50cbed4960ae8923d261087141`) and the server side verifies:
bad signature → 401, correctly-signed probe → 200. Nothing has ever landed.

- **Prime suspect:** the HMAC secret on ElevenLabs' side ≠ `ELEVENLABS_WEBHOOK_SECRET` in Replit Secrets.
- **Check:** `curl -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/workspace/webhooks`
  → if `most_recent_failure_error_code` is 401, the secrets differ. Regenerate on ElevenLabs, paste into Replit Secrets.
- `retry_enabled` is **false** — failed deliveries vanish silently.
- Nothing is lost: all transcripts remain retrievable from ElevenLabs' API and can be backfilled.

---

## P1 — The actual product

### 4. Nine of ten daily touchpoints don't exist
Ray's schedule expects ~**10** Jessica interactions/day — 6:00 wake-up, 8:15 hydration,
10:00 chores, 12:00 meds, 1:00 hydration, 2:00 activity, 5:00 health check, 6:00 meds,
8:00 journal, 9:00 sleep check. `call-scheduler.ts` implements **one** (`dailyCallJob`).

All ten are **voice** — Pops does not use a screen; `/pops` is a caregiver view, not his.

- **Design:** a `touchpoints` table (`time_of_day`, `purpose`, `purpose_prompt`, `active`),
  one generic job firing whichever are due, per-touchpoint once-daily claim keys reusing
  `claimForToday`, and `purpose_prompt` flowing into the `extraContext` arg
  `triggerOutboundCall()` already accepts.
- **Blocked on #1** — ten touchpoints on a scale-to-zero deployment is zero touchpoints.
- **Related:** the live ElevenLabs prompt asks about medication on *every* call. Once
  touchpoints exist, medication language belongs only on the noon and 6:00 PM prompts.

### 5. Test day against Ray's phone
Run the day's calls to 909-732-4902, listen, fix. Prerequisite for ever enabling the daily call.
Blocked on #1 for the automated path (manual "Call Now" still works).

### 6. Trim the health question list in Admin — before publishing
The full prompt asks 3–5 questions per call plus routine walkthroughs. That is *more*
question-pressure than the 8/14 call Pops hung up on at 60 seconds, not less.
**Ray's rule: she can't interrogate him.**

---

## P2 — Cleanups

### 7. ElevenLabs account hygiene
- Jessica's tools are registered **in triplicate** with two different secrets (repeated sync runs) — dedup.
- Built-in guardrails are **all switched off**, including `medical_and_legal_information` — turn on.

### 8. `documents.ts:364` — `quarter: "Q1"` hardcoded
Scanned appointments should land in the active quarter. Currently masked because the wall
clock happens to be Q1; breaks at the next advance. *(Confirmed still present — the rest of
this route's defects were fixed in `309ceeb`.)*

### 9. `tenant-migration.ts:13` — demo seed in the wrong quarter
`{ quarter: "Q1", timeLabel: "1000", title: "Morning Walk" }` — 10:00 is **Q2** under Ray's
real boundaries. Demo-tenant only, cosmetic, but it's the row that used to bleed into Pops'
call context before today's fix.

### 10. 12-hour time in the admin/schedule views
`schedule_tasks.time_label` is stored and rendered as military (`"0600"`, `"1800"`). Ray wants
12-hour with AM/PM. A `to12Hour()` helper exists but **only** in `gemini.ts:139`, for Jessica's
context string — the frontend has none. Caregiver-facing nicety, not Pops-facing.

### 11. `STATUS.md` is stale
Last updated 2026-08-14; doesn't reflect the quarter fix, the documents.ts fixes, the handoff-doc
correction, or today's two commits. Refresh once P0 settles.

---

## Parked — do not start without Ray's go-ahead

- **Haldol cycle inaccuracy** — Ray reports still wrong after one fix. Investigate only on his word.
- **"Rest mode always active"** — likely the same root cause as the Haldol bug.
- **Hermes rename** — in-app `hermes.ts` is an internal dispatcher an AI named on July 3. It is
  **not** Ray's real Hermes system. Rename to `care-dispatch.ts` pending his go-ahead.
- **Quarter Orbit logo** — `quarter-orbit-*.svg`, spec in `docs/quarter-orbit-kit.md`. Designed to
  track the time of day through Ray's four quarters. Parked, not abandoned.
- **Guardian stub pages** — `/guardian` + `/guardian/success` are inert since billing was removed,
  but still carry their own Vite entries and SSR prerender step. Collapsing them into the main SPA
  is safe cleanup if anyone wants it.

---

## Verified fixed — do not redo

These appear as open in older notes (`.agents/memory/known-defects-2026-08-14.md`). They are done —
checked against source 2026-08-17.

| Item | Evidence |
|---|---|
| Quarter boundaries wrong in 3 files | All three now `6/10/14/18` — `state.ts:14`, `call-scheduler.ts:920`, `jessica-tools.ts:25` |
| `documents.ts` apply not transactional | `db.transaction()` at `:315`; `appliedAt` set inside it at `:488` |
| Restrictions couldn't be cleared | Now gated `.length > 0 \|\| body.overwrite` at `:439`, `:457` |
| `ELEVENLABS_HANDOFF.md` pointed at wrong agent (Laura) | Line 13 now `agent_2101kkxm5vnwety8ycdrv0d1fadn` (Jessica) |
| `loadLiveContext()` had no tenant filter — demo data bled into Pops' calls | Fixed today in `bb5b4dd` |
| Post-call webhook never attached to the Jessica agent | Attached + verified 2026-08-14 |

---

## Suggested order

1. **#2** (push auth) — cheap, and everything else is easier once other machines see real code.
2. **#3** (transcript check) — one API call; it's the oldest open wound and answers whether 20 calls of data are recoverable.
3. **#1** (deployment target) — Ray's cost decision. Unblocks the product.
4. **#6** then **#5** — trim questions, then test day.
5. **#4** — touchpoints. The actual product.
