# STATUS — what's done, what's next

*The one file that answers "where was I?" Updated 2026-08-14 late night.*

---

## 8/14 night — first call to Pops, and what it uncovered

**The call:** Jessica called Pops for the first time. The custom intro prompt written for
it never reached the call — she ran the short prompt stored on the ElevenLabs agent
instead, asked about meds/sleep/energy back-to-back, and Pops hung up at 60 seconds.

**Root cause (confirmed against ElevenLabs' API docs):** our code sent
`conversation_config_override` at the top level of the outbound-call request. ElevenLabs
requires it nested inside `conversation_initiation_client_data` — sent top-level it is
silently dropped, the call still connects, and the agent falls back to its stored prompt.
**This means every phone call to date ran on the ElevenLabs stored prompt, never on
`buildJessicaSystemPrompt()`** — no schedule context, no health questions, no zombie-phase
tone has ever reached a real call.

**Fixed tonight:**
- The nesting bug — fixed in `routes/jessica.ts` (in the working tree, NOT yet
  committed/published). Also added an `intro: true` flag for first-call framing.
- The stored ElevenLabs prompt — replaced with a safe floor: short calls, one question
  at a time, never discuss meds/medical, always admit she's an AI, never play along
  with things that aren't real. This is live now and is what runs if an override is
  ever dropped again.

**Found, not yet fixed:**
- **No transcript has ever saved.** The dev DB shows 0 transcripts / 0 summaries /
  0 health data points across all 20 call sessions. The webhook is attached and prod
  answers 401 to unsigned posts (server side works), but nothing has ever landed —
  prime suspect is the HMAC secret mismatch already flagged below. ElevenLabs webhook
  `retry_enabled` is false, so failed deliveries vanish. All transcripts are still
  retrievable from ElevenLabs' API — nothing is lost, it can be backfilled.
- **Jessica's tools are registered in triplicate** on the agent with two different
  secrets (repeated sync runs). Needs dedup.
- **ElevenLabs' built-in guardrails are all switched off** (including
  medical_and_legal_information). Worth turning on.
- **Before publishing the nesting fix:** trim the health question list in Admin first.
  The full prompt asks 3–5 questions per call plus routine walkthroughs — more
  question-pressure than tonight, not less. Ray's rule: she can't interrogate him.
- Hard call cap confirmed real: 10 min, enforced by ElevenLabs (`max_duration_seconds`).

**Research brief** (guardrails for AI calls to vulnerable people + the config-drift
problem, with sources): https://claude.ai/code/artifact/b9038702-1773-42d7-a025-6a0f7392fe36

---

## What works right now

- **Pops' real daily schedule is in the system** — all four quarters as Ray defined them
  (Q1 morning 6–10, Q2 midday 10–2, Q3 fun block 2–6, Q4 wind-down 6pm–bed).
  Wake-up call at **7:00 AM**. Meds at **noon and 6 PM only**. 22 tasks total.
- **Every task has a priority level** (safety > medication > meals/hydration > sleep >
  hygiene/Koda > routine). Missing a pill and skipping a chore are no longer treated the same.
  Refused / no-answer / missed are tracked as different things.
- **Day types exist**: Normal, Sunday, Rest, Appointment, Sick — resolved once each morning.
  Jessica can only *suggest* a Rest day; Ray confirms it.
- **Jessica can see the schedule on phone calls** (fixed 8/14 — an ElevenLabs setting was
  silently blocking it) and can now **mark tasks done or declined by voice**, but only when
  Pops actually confirms on the call.
- **Morning safety net**: wake-up call retries twice if unanswered, then flags "no answer"
  (softly — not an emergency). One short out-of-bed follow-up call, never nagging.

## The safety rule (permanent)

**The automated daily call is OFF.** It stays off until Ray has run the full day against his
own phone (909-732-4902) with zero issues and explicitly says "turn it on." Test calls go to
Ray's phone only. Pops' number is saved and correct.

## What's next (in order)

1. ~~**Transcript saving**~~ — **DONE 2026-08-14.** The webhook already existed at the
   workspace level and pointed at the right URL; it had simply never been attached to the
   Jessica agent (`post_call_webhook_id` was `null`). Now linked
   (`ea0faa50cbed4960ae8923d261087141`, events `["transcript"]`, format json).
   Verified: bad signature → 401, correctly-signed probe → 200, phone number still assigned.
   **One thing still unconfirmed** — whether the HMAC secret stored on ElevenLabs' side
   matches `ELEVENLABS_WEBHOOK_SECRET` in Replit Secrets. ElevenLabs won't reveal it via API.
   After the first real call, check it with:
   `curl -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/workspace/webhooks`
   — if `most_recent_failure_error_code` is 401, the two secrets differ; re-generate on the
   ElevenLabs webhook page and paste the same value into Replit Secrets. Currently `null`.
2. **Test day on Ray's phone** — run the day's calls against the admin number, listen, fix.
3. **Publish** — next Replit publish ships the new voice tools to production. The scary
   "delete care_events" migration warning was a dev/prod table mismatch, fixed 8/14 —
   the publish screen should no longer threaten it. If any publish screen EVER offers to
   delete a table: cancel, don't promote, ask Claude.
4. **Remaining routine tasks** (Replit task pane 142–146): medication protocol, chores &
   afternoon, evening sequence, day-type behaviors, dashboard scoring.

## Parked (known, deliberately not started)

- **Haldol cycle inaccuracy** — Ray reports it's still wrong after one fix; investigate only
  when Ray says go.
- **"Rest mode always active" question** — likely related to the Haldol cycle bug.
- **Hermes rename** — the in-app `hermes.ts` is an internal dispatcher an AI named on July 3;
  it is NOT Ray's real Hermes system and touches nothing outside this app. Rename to
  `care-dispatch.ts` pending Ray's go-ahead.
- **Quarter Orbit logo** — the app's logo (`quarter-orbit-*.svg`, spec in
  `docs/quarter-orbit-kit.md`). Unfinished; it's designed to be interactive with the time
  of day (the light rides the ring through Ray's four quarters). Parked, not abandoned.

## Where things live

- This file — current status. Start here.
- `.local/tasks/routine-*.md` — the routine spec files (Replit task pane 140–146).
- `CLAUDE.md` + `.claude/CLAUDE.md` — technical reference for AI assistants.
- The schedule itself — in the database, editable from the Admin dashboard.
