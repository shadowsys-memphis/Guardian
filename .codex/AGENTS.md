# br(AI)n — Agent Context

> **Living document.** After completing any `prd.json` story, append one dated bullet to `## Patterns Discovered` and one entry to `progress.txt`. This is how future agent iterations learn from the current one.

---

## What This Project Is

**br(AI)n** is a three-part caregiver AI OS for a Veteran (Pops) with PTSD, Schizophrenia, and Auditory Hallucinations, operated by his caregiver Raymo. Jessica is the AI companion (Gemini-backed) who calls Pops daily and pipes health data back to Raymo's dashboard.

**Brain Guardian** is the paid commercial vertical — multi-tenant Stripe subscriptions. Ray's own workspace runs as `tenantId: "local"`. Paying subscribers get their own isolated workspace via UUID tenant IDs.

---

## Repo Layout

```
/
├── artifacts/
│   ├── api-server/                  # Express 5 API server
│   │   └── src/
│   │       ├── index.ts             # app entry — reads process.env.PORT
│   │       ├── middlewares/
│   │       │   └── tenant-auth.ts   # requireAnySession, requireLocalSession
│   │       └── routes/              # 17 route modules + index.ts
│   └── brain-app/                   # React 19 + Vite 7 frontend
│       └── src/
│           ├── App.tsx              # routing, VaultProvider/VaultGate
│           ├── pages/               # 10 page components
│           ├── components/          # shadcn/ui + schedule-dnd.tsx
│           └── lib/                 # calendar.ts, vault-context.tsx, utils.ts
├── lib/
│   ├── api-spec/
│   │   ├── openapi.yaml             # SOURCE OF TRUTH — all API types derive from here
│   │   └── orval.config.ts          # codegen config
│   ├── api-client-react/            # GENERATED — never hand-edit
│   ├── api-zod/                     # GENERATED — never hand-edit
│   ├── db/
│   │   └── src/schema/              # Drizzle ORM (index.ts, conversations.ts, messages.ts)
│   └── integrations-gemini-ai/      # Gemini SDK wrapper
├── scripts/
│   └── seed.ts
├── .codex/
│   └── AGENTS.md                    # ← this file
├── prd.json                         # Ralph loop: user stories
├── progress.txt                     # Ralph loop: completed story learnings
├── pnpm-workspace.yaml
├── tsconfig.json                    # root — project references for lib packages
└── tsconfig.base.json               # shared compiler options (strict, ES2022)
```

Package names: `@workspace/<dir>` — e.g. `@workspace/db`, `@workspace/api-client-react`.

---

## pnpm Commands

```bash
# Typecheck entire monorepo (always from root — never tsc inside a sub-package)
pnpm run typecheck

# After editing openapi.yaml — codegen FIRST, then typecheck
pnpm --filter @workspace/api-spec run codegen && pnpm run typecheck

# Push DB schema changes to PostgreSQL (non-interactive; drizzle-kit stalls on TTY)
# Use raw SQL via pg Pool instead — see Patterns Discovered
pnpm --filter @workspace/db run push

# Seed initial data
pnpm --filter @workspace/scripts run seed

# Dev servers
pnpm --filter @workspace/api-server run dev   # port from $PORT env
pnpm --filter @workspace/brain-app run dev    # port from $PORT env

# Build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/brain-app run build
```

---

## Environment Variables

| Variable | Notes |
|---|---|
| `PORT` | Replit-injected — API server and Vite both bind to this. Never hardcode. |
| `DATABASE_URL` | Replit PostgreSQL — used by `@workspace/db` via Drizzle |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Replit Gemini integration — not a raw Google key |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Replit Gemini proxy endpoint |
| `STRIPE_SECRET_KEY` | Stripe — Brain Guardian billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `BASE_URL` | Vite `import.meta.env` — frontend base path prefix |

---

## TypeScript Project References

- `tsconfig.base.json` — shared strict options (ES2022, bundler moduleResolution). No `composite` here.
- Each lib package adds `composite: true`, `emitDeclarationOnly: true`, `outDir`, `rootDir`
- Root `tsconfig.json` lists project references for `lib/db`, `lib/api-client-react`, `lib/api-zod`
- **Always typecheck from root.** `pnpm run typecheck` — never `tsc` inside a package.
- Codegen first when `openapi.yaml` changes. Order: `codegen` → `typecheck`. Never reversed.

---

## Multi-Tenant Architecture

Two session types resolved exclusively from `req.tenantSession` (never client-supplied):

| Session type | `tenantId` value | Who |
|---|---|---|
| Local | `"local"` | Ray's personal workspace |
| Tenant | UUID string | Paying Brain Guardian subscriber |

Three auth tiers in `routes/index.ts`:

### 1. Public — no auth
`/healthz`, `/tenants/auth`, `/tenants/setup`, `/billing/checkout`, `/billing/webhook`, `/billing/checkout-session`

### 2. Core — `requireAnySession` (local + tenant)
Routes fully tenant-scoped — every DB query filters by `tenantId`:
`state`, `schedule`, `symptoms`, `inventory`, `admin` (AI proxy), `workspace` (proxy), `intake` (AI proxy), `gemini`

### 3. Local-only — `requireLocalSession`
Not yet migrated to multi-tenant — no `tenant_id` column in their DB tables:
`scripts`, `haldol`, `smarthome`, `health-assessment`, `shopper`, `rotation`

---

## Frontend Pages

### Vault-protected (require passphrase via `VaultGate`)

| Route | Component | Purpose |
|---|---|---|
| `/` | → redirect `/pops` | |
| `/pops` | `PopsView` | Pops' zero-touch passive display — 30s auto-refresh |
| `/admin` | `AdminView` | Ray's command center — 10 tabs (see below) |
| `/admin/report` | `DoctorReport` | Weekly/monthly health report for doctor |
| `/jessica` | `JessicaPhone` | Active Jessica call interface |
| `/shopper` | `ShopperView` | Meal planning + grocery cart |
| `/scripts` | `JessicaView` | Terminal-style script manifest |
| `/my-subscription` | `MySubscriptionPage` | Brain Guardian subscription management |

### Public (outside `VaultGate` — no passphrase)

| Route | Component | Purpose |
|---|---|---|
| `/guardian` | `GuardianPage` | Brain Guardian marketing + signup (MPA entry, indexed) |
| `/guardian/success` | `GuardianSuccessPage` | Post-payment confirmation (noindex) |

### AdminView Tabs (10)

`dashboard` · `schedule` (drag-and-drop editor) · `symptoms` · `scripts` (Voice Scripts) · `haldol` (Haldol Tracker) · `health` (Health Intel — 5 sub-sections) · `shopper` · `inventory` · `rotation` · `calendar-sync`

---

## Database Tables

### Tenant-scoped (have `tenant_id` — safe for multi-tenant)

| Table | Key columns |
|---|---|
| `app_state` | current_quarter, quarter_override, zombie_mode, motivation_level, active_message |
| `schedule_tasks` | quarter (Q1–Q4), time_label, title, voice_script, is_completed, order, is_active |
| `symptom_logs` | ptsd_trigger bool, hallucination_intensity 0–5, motivation_level 1–5, logged_by |
| `inventory_items` | item_name, category, replenishment_cycle, last_restocked_date, estimated_run_out_date |

### Local-only (no `tenant_id` — restricted to Ray's session until migrated)

| Table | Key columns |
|---|---|
| `voice_scripts` | task_key (unique), script_text, tone, is_active, last_patched, patch_note |
| `haldol_cycle` | last_injection_date (cycle_day computed on read) |
| `smart_home_devices` | device_key (unique), type, room, is_on, volume, brightness |
| `health_questions` | text, category, response_type, cycle_days JSON, priority, always_ask |
| `call_sessions` | conversation_id, session_date, cycle_day, summary, flagged |
| `health_data_points` | session_id, question_id, category, raw_response, parsed_value, flagged |
| `app_settings` | key (unique), value (runtime key/value config) |
| `meals` | name, description, estimated_cost_cents, active |
| `meal_ingredients` | meal_id FK, name, quantity, unit, estimated_cost_cents |
| `grocery_carts` | week_start_date, budget_cents, status (pending\|approved\|dismissed) |
| `cart_meals` | cart_id, meal_id (join table) |
| `cart_items` | cart_id, ingredient_name, total_quantity, unit, estimated_cost_cents |
| `meal_cravings` | meal_name, source (jessica\|ray), status (pending\|added\|dismissed) |
| `rotation_tasks` | title, period, time_slot, is_hourly, category, status, med_response |
| `historical_care_logs` | date_label, wants_responded_rate, med_adherence, sore_rotation_complete, efficacy_score |

### Conversation-scoped (no tenant_id — scoped via conversation ownership)

| Table | Key columns |
|---|---|
| `conversations` | title, created_at |
| `messages` | conversation_id FK, role, content |

---

## API Endpoint Index (74 operationIds)

All paths relative to `/api`.

### Public
```
GET  /healthz                          healthCheck
POST /tenants/auth                     (tenant auth — no operationId)
POST /tenants/setup                    (tenant setup — no operationId)
POST /billing/checkout                 (create Stripe checkout session)
POST /billing/webhook                  (Stripe webhook — raw body)
GET  /billing/checkout-session         (read session status)
```

### Core — requireAnySession
```
GET    /state                                     getAppState
PUT    /state                                     updateAppState
GET    /schedule                                  getSchedule
POST   /schedule                                  createScheduleTask
PUT    /schedule/:id                              updateScheduleTask
DELETE /schedule/:id                              deleteScheduleTask
POST   /schedule/:id/complete                     completeScheduleTask
GET    /symptoms                                  getSymptomLogs
POST   /symptoms                                  createSymptomLog
GET    /inventory                                 listInventory
POST   /inventory                                 createInventoryItem
PATCH  /inventory/:id/restock                     restockInventoryItem
GET    /intercom/messages                         getIntercomMessages
POST   /intercom/messages                         postIntercomMessage
POST   /gemini/conversations                      createGeminiConversation
GET    /gemini/conversations                      listGeminiConversations
GET    /gemini/conversations/:id                  getGeminiConversation
DELETE /gemini/conversations/:id                  deleteGeminiConversation
GET    /gemini/conversations/:id/messages         listGeminiMessages
POST   /gemini/conversations/:id/messages         sendGeminiMessage  [SSE]
POST   /admin/chat                                chatWithAssistant
POST   /admin/clinical-summary                    generateClinicalSummary
POST   /workspace/calendar                        createCalendarEvent
POST   /workspace/drive                           exportToDrive
POST   /intake/image                              intakeImage
GET    /billing/status                            (requireAnySession inline)
POST   /billing/customer-portal                   (requireAnySession inline)
```

### Local-only — requireLocalSession
```
GET    /scripts                                   getVoiceScripts
POST   /scripts                                   createVoiceScript
PUT    /scripts/:id                               updateVoiceScript
DELETE /scripts/:id                               deleteVoiceScript
GET    /scripts/active                            getActiveScripts   ← MUST be before /scripts/:id in router
GET    /haldol                                    getHaldolCycle
PUT    /haldol                                    updateHaldolCycle
GET    /smarthome/devices                         getSmartHomeDevices
PUT    /smarthome/devices/:key                    updateSmartHomeDevice
GET    /health-assessment/questions               listHealthQuestions
POST   /health-assessment/questions               createHealthQuestion
PUT    /health-assessment/questions/:id           updateHealthQuestion
DELETE /health-assessment/questions/:id           deleteHealthQuestion
GET    /health-assessment/sessions                listCallSessions
POST   /health-assessment/sessions                startCallSession
PUT    /health-assessment/sessions/:id/end        endCallSession
GET    /health-assessment/sessions/:id/data-points getSessionDataPoints
GET    /health-assessment/summary/today           getTodaySummary
GET    /health-assessment/trends                  getAssessmentTrends
GET    /health-assessment/anomalies               getAssessmentAnomalies
GET    /health-assessment/settings                getAssessmentSettings
PUT    /health-assessment/settings                updateAssessmentSettings
GET    /health-assessment/report/weekly           getWeeklyReport
GET    /health-assessment/report/monthly          getMonthlyReport
GET    /health-assessment/ai                      getAiModel
POST   /health-assessment/ai                      setAiModel
GET    /health-assessment/lmstudio                getLmStudioUrl
POST   /health-assessment/lmstudio                setLmStudioUrl
POST   /health-assessment/lmstudio/test           testLmStudioConnection
GET    /shopper/meals                             listMeals
POST   /shopper/meals                             createMeal
DELETE /shopper/meals/:id                         deleteMeal
POST   /shopper/sync                              syncFromSheets
GET    /shopper/cart                              getCart
POST   /shopper/cart/meals                        addMealToCart
DELETE /shopper/cart/meals/:cartMealId            removeMealFromCart
POST   /shopper/cart/approve                      approveCart
POST   /shopper/cart/dismiss                      dismissCart
GET    /shopper/cravings                          listCravings
POST   /shopper/cravings                          createCraving
PATCH  /shopper/cravings/:id                      updateCraving
POST   /shopper/remix                             remixMealPlan
GET    /rotation/tasks                            listRotationTasks
POST   /rotation/tasks                            createRotationTask
PATCH  /rotation/tasks/:id                        updateRotationTask
DELETE /rotation/tasks/:id                        deleteRotationTask
GET    /rotation/logs                             listCareLogs
POST   /rotation/logs                             createCareLog
```

---

## DO NOT

- **Do not** hand-edit `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` — fully regenerated by Orval
- **Do not** `import { z } from "zod"` — always `import { z } from "zod/v4"`
- **Do not** hardcode ports — always `process.env.PORT`
- **Do not** edit `.replit` or `artifact.toml` directly — platform-managed
- **Do not** create Python virtual environments or Docker containers — Replit NixOS
- **Do not** store plaintext in `intercom_messages` — E2EE only (ciphertext/iv/salt)
- **Do not** add frontend routes outside `VaultProvider` scope (except Guardian pages, which are intentionally public)
- **Do not** run `tsc` in a sub-package — always `pnpm run typecheck` from root
- **Do not** run codegen after typechecking when `openapi.yaml` changed — codegen must come first
- **Do not** register `GET /scripts/:id` before `GET /scripts/active` in the Express router
- **Do not** use `drizzle-kit push` in non-interactive environments — it stalls waiting for TTY confirmation. Use raw SQL via pg Pool instead (see Patterns Discovered)
- **Do not** supply `tenantId` from client input — resolve exclusively from `req.tenantSession`

---

## Critical Rules

1. **Zod**: `from "zod/v4"` — not `"zod"`
2. **Codegen first**: `codegen` → `typecheck` (never reversed)
3. **Port**: always `process.env.PORT`
4. **Vault gate**: all UI routes require `isUnlocked === true` except `/guardian` and `/guardian/success`
5. **Intercom**: E2EE only — ciphertext/iv/salt stored, never plaintext
6. **Typecheck**: from root only, never inside a sub-package
7. **Generated files**: never hand-edit `lib/api-client-react/` or `lib/api-zod/` generated output
8. **Route order**: `/scripts/active` before `/scripts/:id` in Express
9. **TenantId**: resolve from `req.tenantSession` exclusively — never trust client-supplied values
10. **DB migrations**: use raw SQL via pg Pool for non-interactive environments

---

## Ralph Loop Contract

Stories live in `prd.json`. When completing a story:

1. Implement the story — all `acceptanceCriteria` must be verifiably met
2. Run `pnpm run typecheck` — zero new errors introduced
3. Set `"passes": true` in `prd.json` for the story
4. Append to `progress.txt`: date · story ID · what was learned · what to watch for next time
5. Append one dated bullet to `## Patterns Discovered` below with the durable lesson

The self-test before any story is marked done:

1. Does the implementation meet every acceptance criterion — or just the spirit of it?
2. Which claim in this work, if wrong, causes the most damage — and was it re-derived, not assumed?
3. Are guesses labeled as guesses?
4. Did the attack on the approach actually find anything — or was it a ritual?
5. Can the next agent read `progress.txt` and avoid the trap that was hit?

---

## Patterns Discovered

> Append a dated bullet here after completing each prd.json story. One line in this file, detail in progress.txt.

- **2026-07-11** · dnd-kit multi-container sortable: `onDragOver` handles cross-quarter state moves; `onDragEnd` handles same-quarter arrayMove + commits all deltas. `useEffect` must guard on `!activeId` before syncing remote state or drags get interrupted by refetch. `drizzle-kit push` stalls on TTY in Replit — use raw SQL via pg Pool for any migration that needs to run non-interactively.

---

## Reasoning Standards

> **[PLACEHOLDER]** — Ray is sourcing the operating manual for this section. It will define how agents read requests, decompose problems, allocate effort, verify claims, label confidence, self-attack conclusions, and communicate findings. Until it arrives, the self-test in the Ralph Loop Contract above applies.
