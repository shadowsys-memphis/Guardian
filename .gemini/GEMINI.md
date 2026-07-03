# Brain Guardian OS — Gemini Code Assist Context

> **Cross-agent ground rules** — multi-tenancy, system boundaries, and git discipline live in [`GEMINI.md`](../GEMINI.md) at the repo root. Read that first. This file is the deep Gemini/Jessica technical reference only.

## Project Mission

The **Brain Guardian OS** is a unified AI caregiving platform. Its earlier working name, **br(AI)n App**, came from the Google AI Studio prototype/build flow and may still appear in legacy folders, comments, or imported docs. Treat **Brain Guardian OS** as the current product name and **br(AI)n App** as legacy/prototype provenance only.

**Jessica** is the AI companion who calls the **patient** daily via a Gemini-backed conversation pipeline, extracts health data from natural speech, and routes it to the **admin/caregiver** dashboard.

Roles: **admin** (caregiver who operates the system), **patient** (care recipient). Do not hardcode personal names in new code, schema, or prompts.

> **Runtime AI note:** Brain Guardian OS currently uses the Replit-managed Gemini integration (`@workspace/integrations-gemini-ai`) in app code, so no Gemini API key should be hardcoded. This is separate from `GEMINI.md`, which is the Gemini CLI / Gemini Code Assist harness file for coding-agent context.

---

## Monorepo Structure

```
/
├── artifacts/
│   ├── api-server/              # Express 5 — all API routes
│   └── brain-app/               # React 19 + Vite 7 — three views + admin
├── lib/
│   ├── api-spec/                # openapi.yaml (source of truth) + orval.config.ts
│   ├── api-client-react/        # GENERATED React Query hooks — do not hand-edit
│   ├── api-zod/                 # GENERATED Zod schemas — do not hand-edit
│   ├── db/                      # Drizzle ORM PostgreSQL schema
│   └── integrations-gemini-ai/  # Gemini SDK wrapper (ai, generateImage, batchProcessWithSSE)
├── scripts/                     # seed.ts
└── pnpm-workspace.yaml
```

Package naming: `@workspace/<directory>` — e.g. `@workspace/db`, `@workspace/integrations-gemini-ai`.

---

## Gemini Integration Architecture

### Where Gemini Lives

`lib/integrations-gemini-ai/src/index.ts` exports:
- `ai` — pre-configured Gemini client (Replit-managed, platform-injected credentials)
- `generateImage` — image generation helper
- `batchProcess` / `batchProcessWithSSE` — batch message processing with SSE support
- `isRateLimitError` — rate limit error classifier

All Gemini calls in `artifacts/api-server/src/routes/gemini.ts` import from `@workspace/integrations-gemini-ai`.

### Database Tables for Gemini

| Table | Purpose |
|---|---|
| `conversations` | One row per Jessica call session thread. Columns: `id`, `title`, `created_at` |
| `messages` | Each turn in the conversation. Columns: `id`, `conversation_id` (FK cascade), `role` (`user`\|`model`), `content`, `created_at` |
| `call_sessions` | Health assessment session linked to a conversation. Columns: `id`, `conversation_id`, `session_date`, `cycle_day`, `started_at`, `ended_at`, `summary`, `flagged` |
| `health_data_points` | Structured health data extracted from Jessica's responses. Columns: `id`, `session_id`, `question_id`, `category`, `raw_response`, `parsed_value`, `parsed_intensity`, `flagged` |

Schema files:
- `lib/db/src/schema/conversations.ts`
- `lib/db/src/schema/messages.ts`
- `lib/db/src/schema/index.ts` (all other tables)

---

## Jessica AI Phone Gateway — Full Data Flow

### 1. Start Call
```
POST /gemini/conversations  →  creates conversations row AND a linked call_sessions row automatically
```
The Gemini route handles both in one step — a separate `POST /health-assessment/sessions` call is not needed to begin a Jessica call. The `/health-assessment/sessions` endpoint exists as a standalone API but the Jessica phone UI drives everything through the conversation endpoint.

### 2. Build System Prompt
`buildJessicaSystemPrompt(questions, cycleDay, isZombiePhase)` in `artifacts/api-server/src/routes/gemini.ts`:

- **Tone profile**: If `isZombiePhase` (Haldol cycle days 1–5), tone = "soft, brief, low-pressure." Normal days = "warm, engaged, conversational."
- **Health questions**: Up to 12 active questions selected by `getActiveQuestionsForCycleDay()`, embedded with their `qid` and `category`.
- **Invisible tag protocol**: Jessica is instructed to emit structured XML tags in responses that are parsed server-side and never shown to the patient:

```xml
<health_data>{"category":"mood","questionId":4,"parsedValue":"yes","parsedIntensity":"mild","rawResponse":"I'm doing okay I guess"}</health_data>

<device_command>{"device":"living_room_light","action":"on"}</device_command>

<craving>{"meal":"chicken soup"}</craving>
```

### 3. Message Loop (SSE)
```
POST /gemini/conversations/:id/messages  →  SSE stream of Gemini response chunks
```
- Each chunk is streamed to the frontend via `text/event-stream`
- Server collects full response text
- `parseHealthDataTags()` extracts `<health_data>` tags → saved to `health_data_points`
- Device commands and cravings are similarly parsed and acted on

### 4. End Session
```
POST /gemini/conversations/:id/end  →  set ended_at, compute summary, set flagged if needed
```

### 5. Intelligence Pipeline
- **Today's summary**: `GET /health-assessment/summary/today` — categories bucketed red/yellow/green
- **30-day trends**: `GET /health-assessment/trends` — by category and date, includes `cycle_day`
- **Sustained anomalies**: `GET /health-assessment/anomalies` — categories flagged in 3+ of last 5 sessions
- **Quiet window**: configurable via `app_settings` — Jessica won't send messages during this window

---

## Health Assessment — Question System

`health_questions` table drives what Jessica asks each call:

| Column | Notes |
|---|---|
| `text` | The actual question text |
| `category` | `mood`, `medication`, `sleep`, `appetite`, `cognition`, `voices`, `energy`, `task` |
| `response_type` | `yes_no`, `scale` (1–5), `free_text` |
| `cycle_days` | JSON array of Haldol cycle days this question applies to (null = every day) |
| `priority` | Lower = asked first |
| `always_ask` | If true, always included regardless of cycle day |
| `higher_is_better` | Used for trend direction interpretation |

`getActiveQuestionsForCycleDay(cycleDay)` filters by `cycle_days` and `active=true`.

---

## All API Endpoints — Gemini Domain

| operationId | Method | Path | Notes |
|---|---|---|---|
| `listGeminiConversations` | GET | `/api/gemini/conversations` | |
| `createGeminiConversation` | POST | `/api/gemini/conversations` | |
| `getGeminiConversation` | GET | `/api/gemini/conversations/:id` | Includes messages |
| `deleteGeminiConversation` | DELETE | `/api/gemini/conversations/:id` | Cascade deletes messages |
| `listGeminiMessages` | GET | `/api/gemini/conversations/:id/messages` | |
| `sendGeminiMessage` | POST | `/api/gemini/conversations/:id/messages` | **SSE stream** — `text/event-stream` |

---

## Full API Surface (all domains)

| Domain | operationIds |
|---|---|
| health | `healthCheck` |
| state | `getAppState`, `updateAppState` |
| schedule | `getSchedule`, `createScheduleTask`, `updateScheduleTask`, `deleteScheduleTask`, `completeScheduleTask` |
| symptoms | `getSymptomLogs`, `createSymptomLog` |
| scripts | `getVoiceScripts`, `createVoiceScript`, `updateVoiceScript`, `deleteVoiceScript`, `getActiveScripts` |
| haldol | `getHaldolCycle`, `updateHaldolCycle` |
| gemini | `listGeminiConversations`, `createGeminiConversation`, `getGeminiConversation`, `deleteGeminiConversation`, `listGeminiMessages`, `sendGeminiMessage` |
| smarthome | `getSmartHomeDevices`, `updateSmartHomeDevice` |
| intercom | `getIntercomMessages`, `postIntercomMessage` |
| health-assessment | `listHealthQuestions`, `createHealthQuestion`, `updateHealthQuestion`, `deleteHealthQuestion`, `listCallSessions`, `startCallSession`, `endCallSession`, `getSessionDataPoints`, `getTodaySummary`, `getAssessmentTrends`, `getAssessmentAnomalies`, `getAssessmentSettings`, `updateAssessmentSettings`, `getWeeklyReport`, `getMonthlyReport` |
| shopper | `listMeals`, `createMeal`, `deleteMeal`, `syncFromSheets`, `getCart`, `addMealToCart`, `removeMealFromCart`, `approveCart`, `dismissCart`, `listCravings`, `createCraving`, `updateCraving` |

---

## Database Schema — All 19 Tables

| Table | Key Purpose |
|---|---|
| `app_state` | Single-row live state (quarter, zombie mode, motivation, active message) |
| `schedule_tasks` | Daily tasks by quarter (Q1–Q4) with optional voice scripts |
| `symptom_logs` | Caregiver-logged PTSD triggers, hallucination intensity, behavior notes |
| `voice_scripts` | Jessica's phone scripts by `task_key`, with tone and patch history |
| `haldol_cycle` | Last injection date — cycle day computed on read |
| `conversations` | Gemini chat threads (one per Jessica call) |
| `messages` | Turns within a conversation (role: user\|model) |
| `smart_home_devices` | Device state: on/off, volume, brightness, by `device_key` |
| `intercom_messages` | E2EE messages: ciphertext + iv + salt (never plaintext) |
| `health_questions` | Question bank for Jessica's daily health check-in |
| `call_sessions` | Per-day Jessica call sessions with summary and flagged status |
| `health_data_points` | Structured data extracted from Jessica's response parsing |
| `app_settings` | Key/value config store (e.g. quiet window settings) |
| `meals` | Meal definitions with cost estimates |
| `meal_ingredients` | Ingredients per meal with quantity and cost |
| `grocery_carts` | Weekly grocery carts with budget and approval status |
| `cart_meals` | Join table: cart ↔ meals |
| `cart_items` | Aggregated ingredient list for a cart |
| `meal_cravings` | Patient food cravings captured by Jessica during calls |

---

## Critical Constraints

### Zod Import
```typescript
import { z } from "zod/v4";  // CORRECT
import { z } from "zod";      // WRONG — causes drizzle-zod type mismatches
```

### Vault Gate
All frontend routes are gated by `VaultProvider` → `VaultGate`. The PIN never leaves the client. Decryption uses PBKDF2 → AES-GCM. Never bypass `isUnlocked` check.

### SSE for Gemini Messages
`sendGeminiMessage` streams `text/event-stream`. The custom fetch in `lib/api-client-react/src/custom-fetch.ts` handles chunked SSE. Do not expect a JSON response from this endpoint.

### Intercom E2EE
`intercom_messages` stores only `ciphertext`, `iv`, `salt`. The server never sees plaintext. All encryption/decryption is client-side Web Crypto API (AES-GCM). Do not add server-side plaintext handling.

### Codegen sequence
After editing `openapi.yaml`:
```bash
pnpm --filter @workspace/api-spec run codegen  # first
pnpm run typecheck                              # then
```
Never reverse this order.

### Route registration order
`GET /scripts/active` must be registered before `GET /scripts/:id` in the Express router or Express matches "active" as the `:id` parameter.

---

## Key Dev Commands

```bash
pnpm run typecheck                              # typecheck full monorepo
pnpm --filter @workspace/api-spec run codegen  # regenerate from openapi.yaml
pnpm --filter @workspace/db run push           # apply schema to PostgreSQL
pnpm --filter @workspace/scripts run seed      # seed initial data
```

---

## Using the Gemini Client

```typescript
import { ai, batchProcessWithSSE } from "@workspace/integrations-gemini-ai";

// Direct generation
const result = await ai.models.generateContent({
  model: "gemini-2.0-flash",
  contents: [{ role: "user", parts: [{ text: "Hello" }] }],
  systemInstruction: { parts: [{ text: systemPrompt }] },
});

// SSE batch processing
batchProcessWithSSE(messages, history, systemPrompt, res);
```

The `ai` client is pre-configured with Replit-managed credentials — no `GEMINI_API_KEY` env var needed in code.

---

## Quarter System

| Quarter | Time Range | Purpose |
|---|---|---|
| Q1 | 06:00–12:00 | Morning routine |
| Q2 | 12:00–18:00 | Afternoon activities |
| Q3 | 18:00–22:00 | Evening wind-down |
| Q4 | 22:00–06:00 | Night/sleep |

`computedQuarter` = always wall-clock based. `currentQuarter` = override if set by the admin, else computed. Zombie Mode (days 1–5 Haldol) reduces task load and shifts Jessica's tone.
