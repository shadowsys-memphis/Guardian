---
name: Brain App Architecture
description: Key decisions and patterns for the br(AI)n app build — E2EE, AI, smart home, intercom.
---

# br(AI)n App Architecture

## E2EE Vault
- AES-256-GCM keys derived in-browser via PBKDF2 (100k iterations). Salt stored in localStorage, key in React context only (never persisted).
- VaultProvider wraps entire app. VaultGate shows passphrase unlock screen until unlocked.
- Intercom messages stored as {ciphertext, iv, salt} on server — server never sees plaintext.
- Crypto utils in `artifacts/brain-app/src/lib/crypto.ts`, context in `vault-context.tsx`.

## Gemini AI / Jessica
- Backend route: `artifacts/api-server/src/routes/gemini.ts`
- Uses `conversations` + `messages` tables from `lib/db/src/schema/conversations.ts` / `messages.ts` (NOT conversationsTable/messagesTable — plain names).
- System prompt defines Jessica as care coordinator for Pops/Raymo with smart home command parsing.
- SSE streaming for chat responses — consume with fetch+ReadableStream on client, NOT React Query hook.
- `@google/genai` must be a direct dep in `artifacts/api-server/package.json` (it's externalized from bundle, needs runtime link).
- `@workspace/integrations-gemini-ai` provides `ai` client. zod imported as `from "zod"` (not "zod/v4") in api-server routes.

## Smart Home
- 8 default devices seeded on first GET: Alexa (3), Sonos (2), Lights (3).
- Route: `artifacts/api-server/src/routes/smarthome.ts`
- AI device commands parsed from `<device_command>{json}</device_command>` tags in Jessica responses.

## DB Tables Added
- `smart_home_devices` — device state (isOn, volume, brightness)
- `intercom_messages` — encrypted chat (ciphertext, iv, salt)
- `conversations` + `messages` — Gemini chat history (from Gemini integration template)

**Why:** All new features require data persistence across sessions.

## Navigation
- Bottom nav bar at all times (Home/Jessica/Devices/Intercom/Admin/Lock).
- All pages behind VaultGate — must enter passphrase first.
