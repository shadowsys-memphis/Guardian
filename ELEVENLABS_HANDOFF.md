# ElevenLabs → Guardian phone calls — VERIFIED CONFIG

**Corrected 2026-08-14.** The previous version of this file pointed at the WRONG agent
("Laura", a blank default in an old second ElevenLabs account) and claimed "Jessica is
the in-app branding, not the ElevenLabs object name." That was false and caused repeated
misconfiguration. **The real agent is named Jessica, in ElevenLabs, in the account below.**

## The one true configuration

| What | Value |
|---|---|
| ElevenLabs account | **raymond.jessee90@gmail.com** — the account whose agent list shows **Jessica** |
| `ELEVENLABS_AGENT_ID` | `agent_2101kkxm5vnwety8ycdrv0d1fadn` (Jessica) |
| `ELEVENLABS_PHONE_NUMBER_ID` | `phnum_0901kyf3mdpsesettfj938kbxsqp` (+1 844-495-0750, Twilio via ElevenLabs) |
| `ELEVENLABS_API_KEY` | An API key created **while signed into the account above**. If the agents page shows anything other than Jessica, you are in the wrong account — stop. |
| `ELEVENLABS_WEBHOOK_SECRET` | The HMAC secret of the "Jessica" post-call webhook (points at `/api/jessica/elevenlabs-webhook`) |

After changing any secret: **Stop and Run the Replit app** so processes pick up the new values.

## Where Twilio fits

Nowhere you need to touch. Twilio is the phone line; ElevenLabs manages it. The chain is:
Jessica (ElevenLabs agent) → Twilio (the line) → the phone rings. There is no Twilio
console step in normal operation.

## Built-in tripwire

`elevenlabs_config_check` (daily cron + Admin "Run Now") verifies not just that the IDs
resolve but that the configured agent's **name is actually "Jessica"** and that the phone
number is assigned to that agent. If the key/ID ever drift to the wrong account again, the
dashboard raises an alert naming the wrong agent instead of passing silently.

## Never do

- Never create an API key without first confirming the agents page shows **Jessica**.
- Never trust an old copy of this file over the live API. Verify with
  `GET /v1/convai/agents` — the reliable identity check is the agent's *name*, not
  whether an ID happens to resolve.
