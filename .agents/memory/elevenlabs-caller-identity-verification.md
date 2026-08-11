---
name: Verifying caller identity for sensitive ElevenLabs voice tools
description: A shared tool-secret header only proves "ElevenLabs' infrastructure sent this," never which human is on the call — use ElevenLabs' system dynamic variables to check that too, for any voice tool whose action shouldn't be available to just anyone who reaches the agent.
---

# Verifying caller identity for sensitive ElevenLabs voice tools

## Rule
A static shared-secret header on an ElevenLabs webhook tool authenticates the *caller system* ("this request really came from ElevenLabs"), not the *human on the call*. If a tool can take a safety- or account-sensitive action (e.g. disabling an automated check-in call, changing account settings), restricting it to "only Ray/the authorized person should do this" in the tool's prompt/description text is not an enforced boundary — it's a suggestion to the LLM that a manipulated, confused, or simply different conversation can bypass with no error at all.

To enforce it for real, use ElevenLabs' automatically-populated system dynamic variables, which are available with no runtime configuration and can be templated with `{{variable_name}}` into a tool's `request_headers`:
- `system__called_number` — the number that was dialed (the useful signal for outbound calls)
- `system__caller_id` — the inbound caller's number (voice calls only; useful once inbound calling exists)
- `system__conversation_id` — ElevenLabs' conversation ID, useful for a DB-lookup-based check instead

Compare the header value the tool call arrives with against the known authorized number server-side, and deny (gracefully — see below) on any mismatch, missing header, or unconfigured expected value. This works even in an outbound-only system: whichever number your own call-initiation code dialed is exactly what comes back in `system__called_number`, so it's a reliable signal without needing inbound infrastructure.

**Why:** this is the only mechanism that ties a specific tool invocation back to which real phone call it happened on, independent of anything the LLM decided to believe about who it's talking to.

**How to apply:** normalize phone numbers before comparing — compare on the last ~10 digits rather than a full exact string, since a leading country-code digit may or may not be present depending on how a number was originally stored vs. how it's echoed back, even though it's the same underlying value round-tripping through the system. An exact-string comparison can produce false negatives on an otherwise-legitimate match.

## Failure-mode contract
`tool_error_handling_mode: "auto"` (the default) hides non-2xx response bodies from the LLM entirely. A caller-identity check must still respond HTTP 200 with `{ success: false, message: "<spoken denial>" }` on failure — the same contract as any other business-logic failure for that tool — so Jessica can actually explain the denial out loud instead of the call silently going nowhere. Reserve non-2xx for genuine system/config auth failures (e.g. a missing/invalid shared secret) that have no caller-specific explanation to give.
