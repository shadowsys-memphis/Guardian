# Local LM Studio Models Integration

**Status:** SHIPPED — `getActiveModel()` / `streamLmStudio()` in `routes/gemini.ts`, with Gemini fallback. _(audited 2026-08-11)_

## What & Why
Allow the br(AI)n app to use Ray's local LM Studio models — Qwen3.5 9B (4bit MLX), Gemma 4 12B (Q6_K GGUF), and Gemma 4 E4B (4bit MLX) — as alternatives to Gemini for Jessica's conversations and the health-data extraction pipeline. LM Studio exposes an OpenAI-compatible REST API (`/v1/chat/completions`), so the integration is a clean adapter alongside the existing Gemini path. Ray can switch the active model from the Admin panel without touching code.

## Done looks like
- A new "AI Model" section in Admin (under Settings or a dedicated tab) shows the four available models: Gemini 2.5 Flash (default), Qwen3.5 9B, Gemma 4 12B, Gemma 4 E4B
- Selecting a model saves it to `app_settings` (key: `active_ai_model`) and is immediately active for the next Jessica conversation
- The currently-selected model is displayed on the Jessica phone page so Ray knows which brain is running
- When LM Studio is selected but unreachable, the API returns a clear error ("LM Studio not running — check that it's open and the model is loaded") rather than a silent crash
- The LM Studio base URL is configurable via `LM_STUDIO_URL` environment variable (default `http://localhost:1234`), so Ray can expose it via a tunnel when working from the deployed app

## Out of scope
- Fine-tuning or modifying the local models
- Adding models not in the list above
- Streaming token-by-token output (initial version uses non-streaming for LM Studio; Gemini keeps its existing streaming path)
- Automatic model health-check polling

## Steps

1. **Model config + settings** — Add `LM_STUDIO_URL` env var support to the API server. Extend the `app_settings` table with an `active_ai_model` key (default: `gemini`). Define a model registry constant with the four models (id, label, provider, lmStudioModelId).

2. **LM Studio adapter** — Create a new route helper (or small module inside `artifacts/api-server/src/routes/`) that calls `POST {LM_STUDIO_URL}/v1/chat/completions` with the OpenAI message format. Convert the Jessica system prompt + conversation history into the OpenAI messages array format, call the model, and return the text response. Parse the same `<health_data>` / `<craving>` XML tags from the response (reuse existing `parseHealthDataTags` / `parseCravingTag` helpers).

3. **Unified message handler** — In `gemini.ts` (the `POST /gemini/conversations/:id/messages` route), read `active_ai_model` from settings at request time and branch: Gemini path stays as-is; LM Studio path calls the new adapter and applies the same post-processing (save health data points, save cravings, strip tags from response, save assistant message).

4. **Model selector in Admin** — Add a small "AI Brain" card to the Admin dashboard (or Health Intel tab) with four option buttons. On select, `PUT /api/health-assessment/settings` (or a new `PUT /api/ai-model` endpoint) saves the choice. Show the active model label in a small status chip.

5. **Jessica page indicator** — Display the active model name as a small badge on the Jessica phone page header so Ray always knows which model is live.

## Relevant files
- `artifacts/api-server/src/routes/gemini.ts`
- `artifacts/api-server/src/routes/health-assessment.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/brain-app/src/pages/jessica-phone.tsx`
- `artifacts/brain-app/src/pages/admin-view.tsx`
- `lib/db/src/schema/index.ts`
- `lib/api-spec/openapi.yaml`
