---
name: LM Studio AI model switching
description: How the AI model selector works; what was missing in brain-app that blocks startup.
---

# LM Studio AI Model Integration

## The rule
Active model is stored in `app_settings` table (key: `active_ai_model`, default: `"gemini"`).
`GET /api/ai-model` and `PUT /api/ai-model` read/write it.
The message handler in `gemini.ts` branches at request time based on this setting.

**Why:** Allows Ray to switch Jessica's AI brain without code changes or redeployment.

## How to apply
- Gemini path: existing streaming SSE
- LM Studio path: non-streaming fetch to `{LM_STUDIO_URL}/v1/chat/completions`, then single SSE chunk
- LM_STUDIO_URL defaults to `http://localhost:1234`; use a tunnel for remote access

## Brain-app startup blockers (files that MUST exist)
These files were missing and prevented the brain app from starting at all:
- `artifacts/brain-app/src/lib/vault-context.tsx` — VaultProvider + useVault hook
- `artifacts/brain-app/src/pages/vault-gate.tsx` — Passphrase unlock gate screen
- `artifacts/brain-app/src/pages/intercom.tsx` — E2EE intercom page

The api-server also needs:
- `artifacts/api-server/src/routes/intercom.ts` — Intercom CRUD route (was missing from index.ts import)

**Why:** App.tsx imports all three frontend files; without them Vite fails to compile. The API server build also fails without the intercom route.

## api-client-react rebuild
After running `pnpm --filter @workspace/api-spec run codegen`, you must also run:
`cd lib/api-client-react && npx tsc -p tsconfig.json`
to regenerate the `.d.ts` declaration files in `dist/`. Otherwise new hooks won't be visible to the brain-app TypeScript compiler.
