# br(AI)n App — OpenAI Codex Agent Context

## What This Project Is

A **pnpm monorepo** — the br(AI)n caregiver AI system for a Veteran (Pops) with PTSD/Schizophrenia, operated by his caregiver Raymo. Jessica is the AI companion (Gemini-backed) who calls Pops daily and pipes health data back to Raymo's dashboard.

---

## Repo Layout

```
/
├── artifacts/
│   ├── api-server/          # Express 5 API server
│   │   └── src/
│   │       ├── index.ts     # app entry, PORT env var
│   │       └── routes/      # health, state, schedule, symptoms, scripts,
│   │                        # haldol, gemini, smarthome,
│   │                        # health-assessment, shopper
│   └── brain-app/           # React 19 + Vite 7 frontend
│       └── src/
│           ├── App.tsx       # routes, VaultProvider/VaultGate imports, BottomNav
│           ├── pages/        # pops-view, admin-view, jessica-phone, smart-home,
│           │                 # doctor-report, jessica-view, not-found
│           ├── components/ui/ # shadcn/ui component library
│           └── lib/          # utils.ts (cn helper)
├── lib/
│   ├── api-spec/
│   │   ├── openapi.yaml      # SOURCE OF TRUTH for all API types
│   │   └── orval.config.ts   # codegen config
│   ├── api-client-react/     # GENERATED — do not hand-edit
│   ├── api-zod/              # GENERATED — do not hand-edit
│   ├── db/
│   │   └── src/schema/       # Drizzle ORM table definitions
│   └── integrations-gemini-ai/  # Gemini SDK wrapper
├── scripts/
│   └── seed.ts
├── pnpm-workspace.yaml
├── tsconfig.json             # root — project references for lib/db, lib/api-client-react, lib/api-zod
└── tsconfig.base.json        # shared compiler options (strict, ES2022) — no composite here
```

Package names: `@workspace/<dir>` — e.g. `@workspace/db`, `@workspace/api-client-react`.

---

## pnpm Commands

```bash
# Typecheck entire monorepo (always run from root)
pnpm run typecheck

# Regenerate API client + Zod schemas from openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes to PostgreSQL
pnpm --filter @workspace/db run push

# Seed initial data
pnpm --filter @workspace/scripts run seed

# Filter pattern for any workspace package
pnpm --filter @workspace/<package-name> run <script>
```

---

## Environment Variables

The project runs on Replit. Environment variables are platform-injected:

| Variable | Source | Notes |
|---|---|---|
| `PORT` | Replit | API server binds to this — never hardcode a port |
| `DATABASE_URL` | Replit PostgreSQL | Used by `@workspace/db` via Drizzle |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Replit Gemini AI integration | Required by `@workspace/integrations-gemini-ai` — provisioned via Replit integration panel, not a raw Google API key |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Replit Gemini AI integration | Required alongside `AI_INTEGRATIONS_GEMINI_API_KEY` — points the SDK to the Replit-proxied Gemini endpoint |
| `BASE_URL` | Vite `import.meta.env` | Frontend base path prefix for routing |

Do **not** hardcode ports, API keys, or database URLs anywhere in the codebase.

---

## TypeScript Project References

- `tsconfig.base.json` — shared strict compiler options (ES2022, bundler moduleResolution, no `composite` or `emitDeclarationOnly`)
- Each package's own `tsconfig.json` extends `../../tsconfig.base.json` and adds `composite: true`, `emitDeclarationOnly: true`, `outDir`, `rootDir`
- Root `tsconfig.json` lists project references for `lib/db`, `lib/api-client-react`, `lib/api-zod` only — not every workspace package
- Always typecheck from root: `pnpm run typecheck`

---

## Build / Typecheck / Codegen Commands

```bash
# Full typecheck (required before any PR/commit)
pnpm run typecheck

# After editing openapi.yaml — MUST run codegen first, then typecheck
pnpm --filter @workspace/api-spec run codegen && pnpm run typecheck

# API server build (esbuild CJS bundle)
pnpm --filter @workspace/api-server run build

# Frontend build
pnpm --filter @workspace/brain-app run build
```

---

## Domain Map — Where Things Live

| Domain | Route file | DB tables used |
|---|---|---|
| App state | `routes/state.ts` | `app_state` |
| Schedule | `routes/schedule.ts` | `schedule_tasks` |
| Symptoms | `routes/symptoms.ts` | `symptom_logs` |
| Voice scripts | `routes/scripts.ts` | `voice_scripts` |
| Haldol tracker | `routes/haldol.ts` | `haldol_cycle` |
| Gemini/Jessica AI | `routes/gemini.ts` | `conversations`, `messages`, `call_sessions`, `health_data_points`, `meal_cravings` |
| Smart home | `routes/smarthome.ts` | `smart_home_devices` |
| Intercom (E2EE) | `routes/intercom.ts` (imported in `routes/index.ts` — file not yet on disk) | `intercom_messages` |
| Health assessment | `routes/health-assessment.ts` | `health_questions`, `call_sessions`, `health_data_points`, `app_settings` |
| Shopper | `routes/shopper.ts` | `meals`, `meal_ingredients`, `grocery_carts`, `cart_meals`, `cart_items`, `meal_cravings` |

---

## API Endpoint Index (54 operationIds)

All base paths relative to `/api`.

```
GET    /healthz                                     healthCheck
GET    /state                                       getAppState
PUT    /state                                       updateAppState
GET    /schedule                                    getSchedule
POST   /schedule                                    createScheduleTask
PUT    /schedule/:id                                updateScheduleTask
DELETE /schedule/:id                                deleteScheduleTask
POST   /schedule/:id/complete                       completeScheduleTask
GET    /symptoms                                    getSymptomLogs
POST   /symptoms                                    createSymptomLog
GET    /scripts                                     getVoiceScripts
POST   /scripts                                     createVoiceScript
PUT    /scripts/:id                                 updateVoiceScript
DELETE /scripts/:id                                 deleteVoiceScript
GET    /scripts/active                              getActiveScripts
GET    /haldol                                      getHaldolCycle
PUT    /haldol                                      updateHaldolCycle
GET    /gemini/conversations                        listGeminiConversations
POST   /gemini/conversations                        createGeminiConversation
GET    /gemini/conversations/:id                    getGeminiConversation
DELETE /gemini/conversations/:id                    deleteGeminiConversation
GET    /gemini/conversations/:id/messages           listGeminiMessages
POST   /gemini/conversations/:id/messages           sendGeminiMessage  [SSE stream]
GET    /smarthome/devices                           getSmartHomeDevices
PUT    /smarthome/devices/:key                      updateSmartHomeDevice
GET    /intercom/messages                           getIntercomMessages
POST   /intercom/messages                           postIntercomMessage
GET    /health-assessment/questions                 listHealthQuestions
POST   /health-assessment/questions                 createHealthQuestion
PUT    /health-assessment/questions/:id             updateHealthQuestion
DELETE /health-assessment/questions/:id             deleteHealthQuestion
GET    /health-assessment/sessions                  listCallSessions
POST   /health-assessment/sessions                  startCallSession
PUT    /health-assessment/sessions/:id/end          endCallSession
GET    /health-assessment/sessions/:id/data-points  getSessionDataPoints
GET    /health-assessment/summary/today             getTodaySummary
GET    /health-assessment/trends                    getAssessmentTrends
GET    /health-assessment/anomalies                 getAssessmentAnomalies
GET    /health-assessment/settings                  getAssessmentSettings
PUT    /health-assessment/settings                  updateAssessmentSettings
GET    /health-assessment/report/weekly             getWeeklyReport
GET    /health-assessment/report/monthly            getMonthlyReport
GET    /shopper/meals                               listMeals
POST   /shopper/meals                               createMeal
DELETE /shopper/meals/:id                           deleteMeal
POST   /shopper/sync                                syncFromSheets
GET    /shopper/cart                                getCart
POST   /shopper/cart/meals                          addMealToCart
DELETE /shopper/cart/meals/:cartMealId              removeMealFromCart
POST   /shopper/cart/approve                        approveCart
POST   /shopper/cart/dismiss                        dismissCart
GET    /shopper/cravings                            listCravings
POST   /shopper/cravings                            createCraving
PATCH  /shopper/cravings/:id                        updateCraving
```

---

## Database Tables (19 total)

All defined in `lib/db/src/schema/index.ts` (re-exports `conversations`, `messages` from sub-files).

```
app_state           — single-row live state (quarter, zombie_mode, motivation_level, active_message)
schedule_tasks      — daily tasks by quarter (Q1–Q4), order, voice_script, is_completed
symptom_logs        — ptsd_trigger bool, hallucination_intensity 0–5, motivation_level 1–5
voice_scripts       — task_key (unique), script_text, tone, is_active, last_patched, patch_note
haldol_cycle        — last_injection_date; cycle_day computed on read
conversations       — Gemini chat threads (id, title, created_at)
messages            — id, conversation_id FK, role, content, created_at
smart_home_devices  — device_key (unique), type, room, is_on, volume, brightness
intercom_messages   — sender, ciphertext, iv, salt (E2EE — never plaintext)
health_questions    — text, category, response_type, cycle_days JSON, priority, always_ask
call_sessions       — conversation_id, session_date, cycle_day, summary, flagged
health_data_points  — session_id, question_id, category, raw_response, parsed_value, parsed_intensity, flagged
app_settings        — key (unique), value (key/value runtime config)
meals               — name, description, estimated_cost_cents, active
meal_ingredients    — meal_id FK, name, quantity, unit, estimated_cost_cents
grocery_carts       — week_start_date, budget_cents, status (pending|approved|dismissed)
cart_meals          — cart_id, meal_id (join table)
cart_items          — cart_id, ingredient_name, total_quantity, unit, estimated_cost_cents
meal_cravings       — meal_name, source (jessica|ray), status (pending|added|dismissed)
```

---

## Frontend Pages

| Path | Component | Purpose |
|---|---|---|
| `/pops` | `PopsView` | Pops' zero-touch passive display — auto-refresh 30s |
| `/admin` | `AdminView` | Raymo's dashboard (7 tabs) |
| `/admin/report` | `DoctorReport` | Weekly/monthly health report for doctor |
| `/jessica` | `JessicaPhone` | Active Jessica call interface — `pages/jessica-phone.tsx` |
| `/scripts` | `JessicaView` | Terminal-style script manifest view — `pages/jessica-view.tsx` |
| `/smarthome` | `SmartHomePanel` | Smart home device controls — `pages/smart-home.tsx` |
| `/intercom` | `IntercomView` | E2EE family intercom (referenced in App.tsx) |

All routes are wrapped in `VaultProvider` / `VaultGate` (imported in `App.tsx` from `@/lib/vault-context` and `@/pages/vault-gate`). If `isUnlocked === false`, only `VaultGate` renders.

---

## DO NOT

- **Do not** hand-edit files under `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` — they are fully regenerated by Orval.
- **Do not** use `import { z } from "zod"` — always `import { z } from "zod/v4"`.
- **Do not** hardcode ports — always read `process.env.PORT`.
- **Do not** edit `.replit` or `artifact.toml` directly — these are platform-managed.
- **Do not** create Python virtual environments or Docker containers — this is Replit NixOS.
- **Do not** store plaintext in `intercom_messages` — E2EE only.
- **Do not** add frontend routes outside `VaultProvider` scope.
- **Do not** run `tsc` in a sub-package to debug cross-package type errors — always `pnpm run typecheck` from root.
- **Do not** run codegen after typechecking when you've changed `openapi.yaml` — codegen must come first.
- **Do not** register `GET /scripts/:id` before `GET /scripts/active` in the Express router.

---

## Critical Rules Summary

1. **Zod**: `from "zod/v4"` — not `"zod"`
2. **Codegen first**: `codegen` → `typecheck` (never reversed)
3. **Port**: always `process.env.PORT`
4. **Vault gate**: all UI routes require `isUnlocked === true`
5. **Intercom**: E2EE only — ciphertext/iv/salt stored, never plaintext
6. **Composite TS**: typecheck from root only
7. **Generated files**: never hand-edit `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/`
8. **Route order**: `/scripts/active` before `/scripts/:id` in Express
