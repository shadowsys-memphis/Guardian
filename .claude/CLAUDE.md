# br(AI)n App — Claude Code Context

## Project Mission

The **br(AI)n App** is a unified AI caregiver system for a Veteran named **Pops** who lives with PTSD, Schizophrenia, and Auditory Hallucinations. His caregiver **Raymo** built and operates this system. **Jessica** is the AI companion (powered by Gemini) who calls Pops daily, checks on his health, and routes data back to Raymo's admin dashboard.

---

## Monorepo Layout

```
/
├── artifacts/
│   ├── api-server/          # Express 5 API — src/routes/, src/index.ts
│   └── brain-app/           # React + Vite frontend — src/pages/, src/lib/
├── lib/
│   ├── api-spec/            # openapi.yaml + orval.config.ts (source of truth)
│   ├── api-client-react/    # GENERATED — React Query hooks (do not hand-edit)
│   ├── api-zod/             # GENERATED — Zod schemas from OpenAPI (do not hand-edit)
│   ├── db/                  # Drizzle ORM schema + PostgreSQL connection
│   ├── integrations/
│   │   └── gemini_ai_integrations/
│   └── integrations-gemini-ai/  # Replit-managed Gemini SDK wrapper
│       └── src/index.ts         # exports: ai, generateImage, batchProcess, batchProcessWithSSE
├── scripts/                 # seed.ts — run with pnpm --filter @workspace/scripts run seed
├── pnpm-workspace.yaml
├── tsconfig.json            # root — composite project references: lib/db, lib/api-client-react, lib/api-zod
└── tsconfig.base.json       # shared compiler options (strict, ES2022, bundler) — no composite/emitDeclarationOnly here
```

**Package names** follow `@workspace/<dir-name>` (e.g. `@workspace/db`, `@workspace/api-client-react`).

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 24 |
| Package manager | pnpm workspaces |
| Language | TypeScript 5.9 |
| API framework | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod (`zod/v4`), `drizzle-zod` |
| API codegen | Orval (OpenAPI → React Query + Zod) |
| Build | esbuild (CJS bundle) |
| Frontend | React 19, Vite 7, TailwindCSS 4, Framer Motion |
| Routing (frontend) | Wouter |
| State | TanStack React Query v5 |
| AI | Gemini via `@workspace/integrations-gemini-ai` |

---

## Three-View System

### `/pops` — Pops' Display (zero-touch)
- Navy/Gold high-contrast military aesthetic, large text
- Shows current Quarter (Q1–Q4 mapped to time-of-day blocks)
- 14-day Haldol cycle progress bar
- **Zombie Mode** banner when `isZombiePhase=true` (Days 1–5 of Haldol cycle = high-symptom)
- Auto-refreshes every 30 seconds; no user interaction required

### `/admin` — Raymo's Command Center
- Tabs: Dashboard, Schedule Editor, Symptom Log, Voice Scripts (Script Patcher), Haldol Tracker, Health Intel, Shopper
- Full CRUD on schedule tasks, voice scripts, health questions
- Symptom logger, trend charts, cycle-day correlation heatmap
- Doctor Report at `/admin/report`

### `/jessica` — Live Jessica Call Interface (`JessicaPhone`)
- Active AI call UI — starts a Gemini conversation and streams SSE responses
- Raymo or Pops interact with Jessica through this view

### `/scripts` — Script Manifest Display (`JessicaView`)
- Terminal-style display of active voice scripts
- Scripts shown by trigger key, tone, full text
- `/api/scripts/active` feeds the phone system

### Other routes
- `/smarthome` — Smart home device controls (`artifacts/brain-app/src/pages/smart-home.tsx`)
- `/intercom` — E2EE family intercom (AES-GCM, ciphertext+iv+salt in `intercom_messages` DB table)

---

## Vault Gate — CRITICAL

**All routes are gated behind a PIN-based vault.** `VaultProvider` wraps the entire app in `App.tsx`. If `isUnlocked === false`, only `<VaultGate>` renders — no other page is accessible. The vault uses client-side PIN + Web Crypto API (PBKDF2 → AES-GCM). Do **not** remove this gate or bypass it for convenience.

Imports in `App.tsx`:
- `VaultProvider`, `useVault` from `@/lib/vault-context`
- `VaultGate` from `@/pages/vault-gate`

---

## Database Schema (19 Tables)

All tables defined in `lib/db/src/schema/index.ts` (re-exports `conversations` and `messages` from sub-files).

| Table | Key Columns / Notes |
|---|---|
| `app_state` | `current_quarter`, `quarter_override`, `zombie_mode`, `motivation_level`, `active_message` — single row |
| `schedule_tasks` | `quarter` (Q1–Q4), `time_label`, `title`, `voice_script`, `is_completed`, `order`, `is_active` |
| `symptom_logs` | `ptsd_trigger` (bool), `hallucination_intensity` (0–5), `motivation_level` (1–5), `behavior_notes`, `logged_by` |
| `voice_scripts` | `task_key` (unique), `label`, `script_text`, `tone`, `is_active`, `last_patched`, `patch_note` |
| `haldol_cycle` | `last_injection_date` (date) — cycle day computed on read |
| `conversations` | `title`, `created_at` — Gemini chat threads |
| `messages` | `conversation_id` (FK cascade), `role`, `content` — chat messages |
| `smart_home_devices` | `device_key` (unique), `name`, `type`, `room`, `is_on`, `volume`, `brightness`, `meta` |
| `intercom_messages` | `sender`, `ciphertext`, `iv`, `salt` — E2EE, never store plaintext |
| `health_questions` | `text`, `category`, `response_type`, `cycle_days` (JSON array), `priority`, `always_ask`, `active`, `higher_is_better` |
| `call_sessions` | `conversation_id`, `session_date`, `cycle_day`, `started_at`, `ended_at`, `summary`, `flagged` |
| `health_data_points` | `session_id`, `question_id`, `category`, `raw_response`, `parsed_value`, `parsed_intensity`, `flagged` |
| `app_settings` | `key` (unique), `value` — key/value store for runtime config |
| `meals` | `name`, `description`, `estimated_cost_cents`, `active` |
| `meal_ingredients` | `meal_id` (FK), `name`, `quantity`, `unit`, `estimated_cost_cents` |
| `grocery_carts` | `week_start_date`, `budget_cents`, `total_estimated_cost_cents`, `status`, `approved_at` |
| `cart_meals` | `cart_id`, `meal_id` — join table |
| `cart_items` | `cart_id`, `ingredient_name`, `total_quantity`, `unit`, `estimated_cost_cents` |
| `meal_cravings` | `meal_name`, `source` (`jessica`\|`ray`), `status` (`pending`\|`added`\|`dismissed`) |

**Zod import rule**: Always `import { z } from "zod/v4"` — NOT `from "zod"`. The project pins Zod v4 and `drizzle-zod` uses the `/v4` subpath. Using the wrong path causes type mismatches.

---

## All API Endpoints (54 operationIds)

Base URL: `/api`

### state
| operationId | Method | Path |
|---|---|---|
| `healthCheck` | GET | `/healthz` |
| `getAppState` | GET | `/state` |
| `updateAppState` | PUT | `/state` |

### schedule
| operationId | Method | Path |
|---|---|---|
| `getSchedule` | GET | `/schedule` |
| `createScheduleTask` | POST | `/schedule` |
| `updateScheduleTask` | PUT | `/schedule/:id` |
| `deleteScheduleTask` | DELETE | `/schedule/:id` |
| `completeScheduleTask` | POST | `/schedule/:id/complete` |

### symptoms
| operationId | Method | Path |
|---|---|---|
| `getSymptomLogs` | GET | `/symptoms` |
| `createSymptomLog` | POST | `/symptoms` |

### scripts
| operationId | Method | Path |
|---|---|---|
| `getVoiceScripts` | GET | `/scripts` |
| `createVoiceScript` | POST | `/scripts` |
| `updateVoiceScript` | PUT | `/scripts/:id` |
| `deleteVoiceScript` | DELETE | `/scripts/:id` |
| `getActiveScripts` | GET | `/scripts/active` |

### haldol
| operationId | Method | Path |
|---|---|---|
| `getHaldolCycle` | GET | `/haldol` |
| `updateHaldolCycle` | PUT | `/haldol` |

### gemini
| operationId | Method | Path |
|---|---|---|
| `listGeminiConversations` | GET | `/gemini/conversations` |
| `createGeminiConversation` | POST | `/gemini/conversations` |
| `getGeminiConversation` | GET | `/gemini/conversations/:id` |
| `deleteGeminiConversation` | DELETE | `/gemini/conversations/:id` |
| `listGeminiMessages` | GET | `/gemini/conversations/:id/messages` |
| `sendGeminiMessage` | POST | `/gemini/conversations/:id/messages` — SSE stream |

### smarthome
| operationId | Method | Path |
|---|---|---|
| `getSmartHomeDevices` | GET | `/smarthome/devices` |
| `updateSmartHomeDevice` | PUT | `/smarthome/devices/:key` |

### intercom
| operationId | Method | Path |
|---|---|---|
| `getIntercomMessages` | GET | `/intercom/messages` |
| `postIntercomMessage` | POST | `/intercom/messages` |

### health-assessment
| operationId | Method | Path |
|---|---|---|
| `listHealthQuestions` | GET | `/health-assessment/questions` |
| `createHealthQuestion` | POST | `/health-assessment/questions` |
| `updateHealthQuestion` | PUT | `/health-assessment/questions/:id` |
| `deleteHealthQuestion` | DELETE | `/health-assessment/questions/:id` |
| `listCallSessions` | GET | `/health-assessment/sessions` |
| `startCallSession` | POST | `/health-assessment/sessions` |
| `endCallSession` | PUT | `/health-assessment/sessions/:id/end` |
| `getSessionDataPoints` | GET | `/health-assessment/sessions/:id/data-points` |
| `getTodaySummary` | GET | `/health-assessment/summary/today` |
| `getAssessmentTrends` | GET | `/health-assessment/trends` |
| `getAssessmentAnomalies` | GET | `/health-assessment/anomalies` |
| `getAssessmentSettings` | GET | `/health-assessment/settings` |
| `updateAssessmentSettings` | PUT | `/health-assessment/settings` |
| `getWeeklyReport` | GET | `/health-assessment/report/weekly` |
| `getMonthlyReport` | GET | `/health-assessment/report/monthly` |

### shopper
| operationId | Method | Path |
|---|---|---|
| `listMeals` | GET | `/shopper/meals` |
| `createMeal` | POST | `/shopper/meals` |
| `deleteMeal` | DELETE | `/shopper/meals/:id` |
| `syncFromSheets` | POST | `/shopper/sync` |
| `getCart` | GET | `/shopper/cart` |
| `addMealToCart` | POST | `/shopper/cart/meals` |
| `removeMealFromCart` | DELETE | `/shopper/cart/meals/:cartMealId` |
| `approveCart` | POST | `/shopper/cart/approve` |
| `dismissCart` | POST | `/shopper/cart/dismiss` |
| `listCravings` | GET | `/shopper/cravings` |
| `createCraving` | POST | `/shopper/cravings` |
| `updateCraving` | PATCH | `/shopper/cravings/:id` |

---

## Codegen Workflow — Orval

The source of truth for all API types is `lib/api-spec/openapi.yaml`.

**Never hand-edit** files under `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/`. They are fully regenerated on each codegen run.

```bash
# 1. Edit openapi.yaml
# 2. Run codegen (generates React Query hooks + Zod schemas)
pnpm --filter @workspace/api-spec run codegen

# 3. Rebuild TypeScript project references (always after codegen)
pnpm run typecheck
```

Orval config: `lib/api-spec/orval.config.ts`
- `api-client-react` target → `lib/api-client-react/src/generated/` (react-query, split mode)
- `zod` target → `lib/api-zod/src/generated/` (zod client, split mode)
- Custom fetch mutator: `lib/api-client-react/src/custom-fetch.ts`

---

## TypeScript Composite Project Rules

- Every package has its own `tsconfig.json` extending `../../tsconfig.base.json`
- `tsconfig.base.json` sets shared compiler options (strict, ES2022, bundler resolution) — it does **not** set `composite` or `emitDeclarationOnly`
- `composite: true` and `emitDeclarationOnly: true` are set **per-package** in each package's own `tsconfig.json`
- Root `tsconfig.json` lists project references for the **generated/consumer** packages: `lib/db`, `lib/api-client-react`, `lib/api-zod` (not all workspace packages)
- **Always typecheck from root**: `pnpm run typecheck`
- Build order matters — if a package's declarations are missing, downstream types break
- Never run `tsc` in a sub-package independently when debugging cross-package type errors

---

## Jessica AI Phone Gateway — Architecture

Jessica is a Gemini-powered AI companion. When a call starts:

1. `POST /gemini/conversations` → creates `conversations` row **and** auto-creates a linked `call_sessions` row (both happen in the Gemini route handler)
2. `POST /gemini/conversations/:id/messages` → streams Gemini response via SSE
3. Jessica's system prompt instructs Gemini to emit invisible XML tags in responses:
   - `<health_data>{...}</health_data>` — parsed server-side, saved to `health_data_points`
   - `<device_command>{...}</device_command>` — smart home commands
   - `<craving>{...}</craving>` — meal craving capture
4. `POST /gemini/conversations/:id/end` → closes session, computes summary
5. Anomaly detection: categories flagged in 3+ of last 5 sessions → `sustainedAnomalies`

Note: `/health-assessment/sessions` endpoints exist as a standalone admin API, but the Jessica phone UI (`/jessica`) drives the entire call lifecycle through the `/gemini/conversations` endpoints.

System prompt is built in `artifacts/api-server/src/routes/gemini.ts` → `buildJessicaSystemPrompt()`.

---

## Critical Gotchas

1. **`zod/v4` import path** — `import { z } from "zod/v4"` everywhere. Using `"zod"` directly causes `drizzle-zod` type mismatches.

2. **Vault gate** — `VaultProvider` wraps all UI. Never add a page that bypasses `useVault().isUnlocked`. The Vault uses PBKDF2 key derivation + AES-GCM; PIN is never stored.

3. **Orval → tsc rebuild sequence** — After editing `openapi.yaml`, you MUST run codegen before typechecking. Running `tsc` first will fail on stale generated types.

4. **Intercom E2EE** — `intercom_messages` stores `ciphertext`, `iv`, `salt` — never plaintext. Decryption happens entirely client-side. Do not add server-side decryption.

5. **Quarter system** — `currentQuarter` in `app_state` is the *effective* quarter (override if set, else wall-clock computed). `computedQuarter` is always the wall-clock value. Both are returned by `getAppState`.

6. **Haldol cycle days 1–5** — `isZombiePhase` is computed from `lastInjectionDate`. Days 1–5 = high-symptom Zombie Mode. Jessica's tone shifts to "soft/brief/low-pressure" automatically via system prompt.

7. **`/scripts/active` before `/scripts/:id`** — Express route order matters. The `active` literal path must be registered before `/:id` or Express will try to match "active" as an ID parameter.

8. **SSE for Gemini messages** — `sendGeminiMessage` returns `text/event-stream`, not JSON. The React Query hook for it uses a custom fetch that handles SSE chunks. Do not add a `Content-Type: application/json` expectation.

9. **No virtual envs, no Docker** — This runs on Replit NixOS. Use `pnpm` for all package management. Do not create Python venvs or Docker containers.

---

## Preferred Patterns

### Adding a new API endpoint
1. Add path + operationId to `lib/api-spec/openapi.yaml`
2. Add handler in `artifacts/api-server/src/routes/<domain>.ts`
3. Register router in `artifacts/api-server/src/routes/index.ts` if new domain (note: `intercom.ts` is imported but the file doesn't exist on disk yet — a known incomplete feature)
4. Run `pnpm --filter @workspace/api-spec run codegen`
5. Run `pnpm run typecheck`

### Adding a new DB table
1. Add table definition to `lib/db/src/schema/index.ts`
2. Export insert schema + types from the same file
3. Run `pnpm --filter @workspace/db run push`

### Adding a new frontend page
1. Create `artifacts/brain-app/src/pages/<page>.tsx`
2. Add `<Route>` in `artifacts/brain-app/src/App.tsx` inside `AppContent` (within `VaultProvider` scope)
3. Optionally add to `NAV_ITEMS` for bottom nav

### Using the Gemini integration
```typescript
import { ai } from "@workspace/integrations-gemini-ai";
// ai is a pre-configured Gemini client (Replit-managed)
// Requires two platform-injected env vars (set via Replit integration panel):
//   AI_INTEGRATIONS_GEMINI_API_KEY
//   AI_INTEGRATIONS_GEMINI_BASE_URL
// Do not reference these vars directly in app code — the wrapper handles them.
```

### Dev commands
```bash
pnpm run typecheck                              # typecheck all packages
pnpm --filter @workspace/api-spec run codegen  # regenerate API client + Zod schemas
pnpm --filter @workspace/db run push           # push schema to PostgreSQL
pnpm --filter @workspace/scripts run seed      # seed initial data
```
