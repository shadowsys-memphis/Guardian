# GEMINI.md

Project context for Gemini CLI. Full detail lives in `CLAUDE.md` and `.claude/CLAUDE.md`.

---

## What this is

Guardian is a **public, multi-tenant** AI caregiver platform. The current deployment serves one household, but the schema and API must treat every feature as multi-tenant from day one.

Roles are generalized: **admin**, **caregiver**, **patient**. Do not hardcode personal names or single-tenant assumptions into universal schema, routes, or prompts.

---

## Note on Gemini inside the app

Gemini is also the AI engine powering the in-app companion (Jessica). That code lives in:
- `lib/integrations-gemini-ai/` — SDK wrapper (exports: `ai`, `batchProcessWithSSE`)
- `artifacts/api-server/src/routes/gemini.ts` — SSE streaming route, Jessica system prompt

Do not modify the Jessica system prompt or Gemini route without explicit approval. Those prompts drive live care interactions.

---

## Multi-tenancy rules

- Every `care_events` / `health_data_points` row must carry a `tenant_id`.
- `tenant_id` is always derived from `req.tenantSession.sub` — never from client-supplied fields, never a hardcoded fallback, never `"local"`.
- Doctor-facing files and reports must come from verified `care_events` only — not loose AI-generated summaries.

---

## System boundaries

| Component | Role |
|---|---|
| Guardian Core | This repo — public caregiving platform |
| Guardian Hermes Adapter | In-app dispatch layer + `care_events` evidence ledger + learning foundation |
| OpenClaw / ClawX | Optional local runtime/integration — not Guardian core |
| LM Studio | Local model provider used by Guardian and/or OpenClaw |

Do not conflate these. Changes to Guardian Core do not imply changes to OpenClaw or LM Studio.

---

## Hard stops

- CORS must use exact origin matching — no `startsWith`, no wildcards.
- No broad rewrites without explicit approval. Propose, then wait.
- Generated files under `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` are never hand-edited.
- `import { z } from "zod/v4"` — not `"zod"`.
