---
name: ElevenLabs voice tool-calling (mid-call webhook tools)
description: How to wire real-time server tools into an ElevenLabs conversational agent — API shape, agent attachment, and the "errors are hidden from the LLM" gotcha.
---

# ElevenLabs voice tool-calling

## API shape (confirmed against the live OpenAPI spec)
- Tools are managed separately from agents: `POST/PATCH /v1/convai/tools(/{id})` with body `{tool_config: {...}}` (webhook tools need `type`, `name`, `description`, `response_timeout_secs`, `tool_error_handling_mode`, `api_schema` — `url`/`method`/`request_headers`/`request_body_schema` as an object-schema with `required`/`properties`).
- An agent's tool list is a separate attach step: `conversation_config.agent.prompt.tool_ids` via GET/PATCH `/v1/convai/agents/{id}`. Creating a tool does NOT attach it to any agent — a second call is required, and it must MERGE into the existing `tool_ids` array (read-then-write), never overwrite it, or you silently detach whatever tools were already there.
- Tool availability is agent-level, not call-direction-specific — attaching once covers both inbound and outbound calls.

## The "errors are hidden from the LLM" gotcha
`tool_error_handling_mode: "auto"` means a non-2xx HTTP response body is NOT shown to the LLM — it just sees a generic failure. If the agent should react intelligently to validation failures or ambiguous input (e.g. speak a clarification), the endpoint must return HTTP 200 with a structured `{success: false, message: "..."}` body for all *business-logic* outcomes, and reserve non-2xx strictly for auth/config failures the agent shouldn't try to talk its way around.

## Auth pattern for tool-invocation webhooks
Different from ElevenLabs' outbound signed webhooks (see elevenlabs-webhook-auth.md — that's HMAC over rawBody for post-call events). For webhooks ElevenLabs calls mid-conversation, a static shared-secret custom header is simpler and sufficient: generate with `crypto.randomBytes`, persist in an internal settings table (not a user-facing Replit Secret — nobody types this in, it's a machine-to-machine token), send it as `request_headers` in the tool's `api_schema`, and check it server-side. Fail closed: missing config → 503, mismatched header → 401.

## Idempotent sync pattern
A sync routine that creates-or-updates N tools and attaches them to an agent should: store the created tool IDs persistently, PATCH by ID when present (fall back to POST-create on a 404, e.g. if a tool was deleted out-of-band), and never throw — log and degrade gracefully if the API key/agent ID is missing or wrong, since this may run at every server startup.
