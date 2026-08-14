---
name: ElevenLabs live-state verification
description: How to verify ElevenLabs call/agent/phone config claims against live API state instead of trusting docs, env vars, or webhook 200s at face value.
---

## Verifying whether a real call happened

A validly-signed 200 from `/api/jessica/elevenlabs-webhook` does NOT prove our app's
outbound-call code (`triggerOutboundCall`) placed the call. ElevenLabs fires
`post_call_transcription` webhooks for ANY conversation with the agent — including
ones tested directly in ElevenLabs' own dashboard (browser mic, no phone number
needed) — completely bypassing our `/api/jessica/outbound-call` route, Twilio, and
`ELEVENLABS_PHONE_NUMBER_ID` entirely.

**Why:** the webhook handler looks up `call_sessions` by `elevenlabs_conversation_id`;
if nothing matches (because the conversation didn't originate from our code), it just
acks `{received: true}` and does nothing further — no warning is logged. A real,
correctly-signed ElevenLabs event can leave zero trace in our own database despite
ElevenLabs having a complete record of it.

**How to apply:** to verify a claimed call actually happened and through which path,
check in this order, in the environment (dev vs prod) the user actually used — they
have separate databases, so a call tested against the deployed app won't show up in
dev DB queries, and vice versa:
1. `call_sessions` table for a row dated today with a non-null `elevenlabs_conversation_id`
   — the only proof the call went through OUR outbound flow.
2. ElevenLabs' own `/v1/convai/conversations` list — ground truth for "did ANY
   conversation with the agent happen," regardless of channel.
3. Deployment/workflow logs around the claimed time for `/api/jessica/elevenlabs-webhook`
   POSTs (200 = validly signed = a real ElevenLabs event fired — but check #1 before
   crediting our pipeline for it).

## Verifying agent/phone IDs

This project's ElevenLabs agent ID has drifted repeatedly (account has leftover
agents named "Huey" x2, "New agent", and a since-deleted "Laura") without every
config or handoff doc being updated each time — a hardcoded agent/phone-number ID
anywhere (env var, .md handoff doc, code comment) silently goes stale the next time
the agent changes. Always confirm the current value against a live
`GET /v1/convai/agents` / `/v1/convai/phone-numbers` call before trusting or reusing
an ID, including ones found in this project's own docs — they are not self-updating.

**Existence is not correctness.** `ELEVENLABS_AGENT_ID` once pointed at "Laura" — a
real, valid, blank-default agent that returned HTTP 200 on every check — while the
actual fully-configured "Jessica" agent (real system prompt, greeting, voice) sat
unreferenced under a different ID the whole time, still correctly assigned to the
real phone number. An "does this ID resolve?" check cannot catch a wrong-but-valid
ID; it only started failing once "Laura" was later deleted (200 → 404). The reliable
way to find "the" real agent is to cross-check via a resource you trust more than the
env var — e.g. `GET /v1/convai/phone-numbers` returns each number's
`assigned_agent.agent_id`, which is a better source of truth than a possibly-stale
`ELEVENLABS_AGENT_ID`. When in doubt, list ALL agents (`GET /v1/convai/agents`) and
compare their names/prompts/tools rather than trusting the one env var points to.
