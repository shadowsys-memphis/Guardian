# TODO — Guardian

*Built 2026-08-17 at `775bc80`; re-verified against source 2026-08-20 (origin/master `eb241d7`
plus this session's uncommitted webhook fix). Companion to `STATUS.md` (narrative) — this file
is the actionable list.*

> **Permanent safety rule:** the automated daily call stays **OFF** until Ray runs a full
> day against his own phone (909-732-4902) with zero issues and explicitly says turn it on.
> Test calls go to Ray's number only. Never flip `dailyCallEnabled` without him.

---

## P0 — Blockers

### 3. Call sessions intermittently never finalize — ROOT CAUSE FOUND 2026-08-20, fix in tree
Delivery was never the problem: ElevenLabs' webhook status shows **zero failures ever**
(`most_recent_failure_error_code: null`) because the handler answers 200 and then silently
drops the payload. The handler's Zod schema required every transcript item's `message` to be
a string, but ElevenLabs sends `message: null` on tool-call turns — so **any call where
Jessica used one of her voice tools failed schema parse and hit a bare `{received:true}`
early-return**. Proven against a real stuck conversation (`conv_9401m0321…`): the old schema
fails at `data.transcript[2].message` ("Expected string, received null"), the fixed one passes.

Two smaller contributors, both real in the data:
- Calls placed from the **dev workspace** create their session row in the dev DB, but the
  webhook URL points at the **prod** deployment — prod finds no row and silently no-ops.
  (This is why every dev-DB session, 24/24, is unfinalized.)
- The conversation id was backfilled by a separate UPDATE after the INSERT — a crash between
  the two left a session with no id the webhook could ever match (one such row exists).

**Fixed in `routes/jessica.ts` (2026-08-20, uncommitted at time of writing):**
- `message` is now `.nullable().optional()`; null-message turns are excluded from saved text.
- Every early-return branch now logs *why* (Zod issues, unknown session, skipped event type,
  already-finalized) instead of a silent 200.
- Conversation id is written atomically in the session INSERT (follow-up UPDATE removed).
- Finalization extracted to `finalizeCallSession()`, shared with a new **local-only
  `POST /jessica/reconcile-calls`** endpoint that backfills any still-open session from the
  ElevenLabs API through the exact same path (skips sessions <30 min old or still in
  progress; sessions with no conversation id are counted, never touched).

**Remaining:** deploy, then hit reconcile once **on prod** (`POST /api/jessica/reconcile-calls`
with a local session token); spot-check the Calls view shows recovered transcripts; watch the
new warn/error log lines. Until reconciled, the missed-call streak can false-alarm — a day
Pops *was* reached but the webhook dropped counts as missed and walks toward the admin-alert
call.

---

## P1 — The actual product

### 5. Test day against Ray's phone
Run the day's calls to 909-732-4902, listen, fix. Prerequisite for ever enabling the daily
call. Deployment target is now VM (see Verified fixed), so the automated path can fire —
`dailyCallEnabled` and test mode still gate it.

### 6. Trim the health question list in Admin — before publishing
The full prompt asks 3–5 questions per call plus routine walkthroughs. That is *more*
question-pressure than the 8/14 call Pops hung up on at 60 seconds, not less.
**Ray's rule: she can't interrogate him.**

---

## P2 — Cleanups

### 7. ElevenLabs account hygiene *(not re-verified 2026-08-20 — check before acting)*
- Jessica's tools were registered **in triplicate** with two different secrets — dedup.
- Built-in guardrails were **all off**, including `medical_and_legal_information` — turn on.

### 11. `STATUS.md` refresh
Updated 2026-08-17; still missing: VM deployment target, touchpoints landing, the webhook
root cause + fix above, and the GitHub push being restored.

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

Checked against source/environment on the date shown.

| Item | Evidence |
|---|---|
| Quarter boundaries wrong in 3 files | All three now `6/10/14/18` — `state.ts:14`, `call-scheduler.ts:920`, `jessica-tools.ts:25` (08-17) |
| `documents.ts` apply not transactional | `db.transaction()` at `:315`; `appliedAt` set inside it (08-17) |
| Restrictions couldn't be cleared | Gated `.length > 0 \|\| body.overwrite` (08-17) |
| `ELEVENLABS_HANDOFF.md` pointed at wrong agent (Laura) | Line 13 now Jessica's agent id (08-17) |
| `loadLiveContext()` had no tenant filter | Fixed in `bb5b4dd` (08-17) |
| Post-call webhook never attached to the agent | Attached + signature-verified (08-14) |
| **#1 — deployment target `autoscale`** | `.replit:11` now `deploymentTarget = "vm"`; scheduler can run in prod (08-20) |
| **#2 — GitHub push auth broken** | `GITHUB_TOKEN` PAT works; 8 stranded commits pushed, `origin/master` == `master` @ `eb241d7` (08-20) |
| **#4 — touchpoints didn't exist** | `touchpoints` table auto-created + seeded, generic due-touchpoint job in `call-scheduler.ts` (~`:1300`), config API in `routes/touchpoints.ts` incl. global call test-mode switch. Test day (#5) still pending (08-20) |
| **#8 — `documents.ts` hardcoded `Q1`** | Quarter resolved via `quarterForTime()` at `documents.ts:334–340` (08-20) |
| **#9 — demo seed in wrong quarter** | `tenant-migration.ts:13` now `Q2` (08-20) |
| **#10 — military time in admin UI** | `to12Hour()` lives in `brain-app/src/lib/time.ts`, used by the schedule editor + calendar descriptions (08-20) |
| Schedule editor edits didn't stick / snapped back | Mutations now invalidate the schedule query; DnD no longer resyncs from stale cache; drag-cancel wired (`89474aa`, 08-20) |

---

## Suggested order

1. **#3** — commit + deploy the webhook fix, run reconcile on prod, confirm transcripts appear.
2. **#6** then **#5** — trim questions, then test day.
3. **#7** and **#11** — hygiene + status refresh whenever.
