# Guardian.OS — Consolidation Report
> Generated: 2026-06-22
> Based on full read-only audit of both `Br[AI]n/` and `Guardian-OS/`
> Author: Claude Code (Sonnet 4.6) + Raymo

---

## A. Executive Summary

**`Br[AI]n/`** is the live, daily-use caregiver app for Pops — a Veteran living with PTSD,
schizophrenia, and auditory hallucinations. It is a React 18 SPA backed by Firebase Firestore,
with three detached auxiliary processes (Python governor, Node brain-scheduler, Node state-server).
It has real production value: a working Haldol-cycle engine, a sophisticated alarm/voice system,
a medical journal, a shopper AI pipeline, and a cycle-aware outbound call scheduler. Its weakness
is architectural debt: mixed JS/JSX/TS, dual hook implementations, config scattered across four
files, a hardcoded API key, and no real server — just a flat-file state bridge.

**`Guardian-OS/`** is the clean rewrite of the same product. It is a pnpm TypeScript monorepo
(React 19 + Express 5 + PostgreSQL/Drizzle), spec-first (OpenAPI → Orval-generated Zod + React
Query), with 23 DB tables, 12 fully implemented API routers, 6 frontend views (Pops display,
Jessica AI phone, 8-tab admin, smart home, intercom, vault gate), and Gemini 2.5 Flash SSE
streaming. It has no alarm system, no outbound call scheduler, no brain puzzle, no celebration
UX, no AI meal generation, and no tests.

**Recommended foundation: `Guardian-OS/`.** It is the correct architecture for a production-grade
caregiver OS — typed, contracted, relational, real-time, AI-native. `Br[AI]n/` is the domain
knowledge source: mine its Haldol math, alarm architecture, medical journal schema, shopper agent
logic, scheduler payloads, and UX patterns. Port them into Guardian-OS's existing contract and
schema. Retire `Br[AI]n/` once parity is reached.

---

## B. Project Inventory

### `Br[AI]n/` (legacy, live)

```
Br[AI]n/
├── src/
│   ├── App.jsx                    # Main SPA (4 tabs: ROUTINES, SHOP, ADMIN, CALENDAR)
│   ├── main.jsx                   # Vite entry
│   ├── constants.ts               # App config, default tasks, colors
│   ├── types.ts                   # TypeScript interfaces (Task, CycleStatus, etc.)
│   ├── hooks/
│   │   ├── useTaskContext.jsx      # Firestore task sync + streaks (ACTIVE)
│   │   ├── useCycleContext.jsx     # Haldol cycle math + phase mapping (ACTIVE)
│   │   ├── useAlarmSystem.jsx      # Alarm orchestration, TTS, NTFY (ACTIVE, 631 lines)
│   │   ├── useTasks.ts            # localStorage-only stub (INACTIVE)
│   │   └── useAlarmSystem.ts      # Stub (INACTIVE)
│   ├── components/
│   │   ├── TaskCard.tsx           # Task UI, zombie-aware opacity
│   │   ├── CaregiverPanel.tsx     # Admin controls (add/reset/compliance)
│   │   ├── AddTaskModal.tsx       # Custom task form
│   │   ├── BrainPuzzleModal.tsx   # Simon Says cognitive game
│   │   ├── MedJournal.jsx         # Structured medical log (5 entry types)
│   │   ├── ProgressBar.tsx        # Animated daily progress bar
│   │   ├── Header.tsx             # Role toggle (VETERAN/CAREGIVER)
│   │   ├── CarWashBanner.jsx      # Even-week car wash reminder
│   │   └── shopper/               # Meal planner UI (Overview, Plan, List, Budget, Review)
│   ├── utils/
│   │   ├── haldolService.ts       # Standalone cycle calculator
│   │   ├── dateService.ts         # ISO week, car wash week
│   │   ├── soundService.ts        # Web Audio API synthesis
│   │   └── celebrations.js        # Confetti + cycle-aware motivational messages
│   ├── data/
│   │   ├── schedule.js            # Quarters, tasks, chores, restrictions, cycle anchor
│   │   └── appointments.json      # Calendar appointments
│   └── config/firebase.js         # Firestore init (env-var protected)
├── external_systems/state-server.js  # Port 3334, GET/POST /state via pops-state.json
├── governor/
│   ├── governor.py                # Gemini + Perplexity orchestration agent
│   ├── shopper_agent.py           # Gemini meal plan generator (Flask)
│   └── manifest.json              # Pillar config (Lulubear, SS_III, Growth)
├── brain-scheduler/index.js       # Port 3099, Twilio cycle-aware call scheduler (334 lines)
├── phone_system/                  # Shadow Voice (3CX + ElevenLabs — ~60% stubbed)
├── package.json                   # npm, React 18, Vite
└── .env                           # VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID
```

**Git:** Independent repo. Has remote (LEDGERGHOST90/Br-AI-n or similar). Branch: main.
**Status:** Live in daily use. Firebase project: `br-ai-n-18c62`.

---

### `Guardian-OS/` (rewrite, foundation)

```
Guardian-OS/
├── artifacts/
│   ├── api-server/                # Express 5, esbuild ESM, pino — 12 routers FULLY BUILT
│   ├── brain-app/                 # React 19 + Vite + Radix/shadcn — 6 views FULLY BUILT
│   └── mockup-sandbox/            # Design/prototyping sandbox
├── lib/
│   ├── api-spec/                  # openapi.yaml (40+ endpoints) + orval.config.ts ← SOURCE OF TRUTH
│   ├── api-zod/                   # Generated Zod schemas (DO NOT HAND-EDIT)
│   ├── api-client-react/          # Generated React Query hooks (DO NOT HAND-EDIT)
│   ├── db/                        # Drizzle schema (23 tables) + node-postgres Pool
│   ├── integrations-gemini-ai/    # Gemini 2.5 Flash client (SSE, image, batch)
│   └── integrations/              # Mirror of gemini-ai (orphan — consolidate)
├── scripts/src/seed.ts            # Full seed (schedule, scripts, haldol, pillars, 26 Qs, meals)
├── pnpm-workspace.yaml            # Catalog-based deps, Node 24, pnpm enforced
├── tsconfig.base.json             # composite: true, emitDeclarationOnly
└── .replit                        # Replit autoscale, Node 24
```

**Git:** Independent repo. Branch: main.
**Status:** Not yet in daily use. No auth. No tests. No alerting.

---

## C. Br[AI]n Findings

### Stack
- React 18 + Vite (port 3000), npm, Tailwind v3, framer-motion
- Firebase Firestore (task completions, streaks, cycle anchor)
- localStorage (alarm settings, preferences)
- Flat JSON files (pops-state.json, shopper-profile.json, cart-history.json)
- External: Node state-server (port 3334), Python Flask governor (meal gen), Node brain-scheduler (port 3099)
- No real backend API. No relational DB. No TypeScript-safe contract.

### Strengths
1. **Haldol cycle math is proven and correct.** 14-day modular arithmetic with 4 phases, written in
   two forms (context hook + standalone service). Daily use has validated the logic.
2. **Alarm system is production-quality.** Eight named alarm types, ElevenLabs TTS + browser fallback,
   NTFY push, sound sequences, and cycle-aware suppression (zombie phase = required-only alarms).
3. **Brain Puzzle is functional and cycle-triggered.** Simon Says 4-round game used as cognitive warmup.
4. **Medical Journal has a real schema.** Five structured entry types (daily obs, med change, VA note,
   incident, advocacy) with cycle-phase color coding — directly maps to VA/caregiver reporting.
5. **Shopper agent is working AI.** Flask + Gemini Flash generates 7-day meal plans from household
   profile; budget-aware.
6. **Brain-scheduler is sophisticated.** 334 lines of cycle-aware, phase-adaptive call payload logic
   with Twilio integration, daily-key deduplication, and phase-specific scripts.
7. **Celebration UX is personal.** Cycle-aware motivational messages ("⚓ SHORE LEAVE" for zombie
   mode) and confetti tied to streak milestones.

### Weaknesses
1. No typed API contract — frontend talks to Firebase, state-server, and Flask with no schema enforcement.
2. Dual hook implementations (.jsx active vs .ts stub) — dead code confusion.
3. Hardcoded Gemini API key in `governor/governor.py:22` — critical security issue.
4. Config scattered: constants.ts, schedule.js, manifest.json, BRAIN.json, .env — no single config source.
5. No server-side persistence for alarms, medical journal, or schedule mutations — Firebase or nothing.
6. `src/components/.legacy/` has 11 abandoned components still in the tree.
7. `.backup` and `.miami` files mixed in with live source.
8. No TypeScript-safe DB layer — state is a JSON blob.
9. Phone system is ~60% plumbing, ~40% wired logic.
10. No tests anywhere.

### Features Worth Preserving
- Haldol cycle math (exact day calculation + 4-phase mapping)
- Zombie mode suppression pattern (effort < 0.5 → required-only)
- Alarm system architecture (8 types, TTS stack, NTFY)
- Brain Puzzle (Simon Says, 4-round, sound/visual)
- Medical Journal (5 entry types, cycle-aware coloring)
- Shopper agent logic (Gemini meal plan prompt structure, household profile shape)
- Brain-scheduler cycle-adaptive call payloads
- Celebration system (cycle-aware messages, confetti tiers)
- Schedule data shape (quarters, rotating chores, kitchen restrictions, rest_day_tasks)
- CarWash week utility (even/odd week rotation)

### Data Models Worth Preserving
```typescript
// Haldol phases
type HaldolPhase = 'INJECTION' | 'ZOMBIE' | 'MODERATE' | 'BEST'
interface CycleStatus { day: 0-13, phase: HaldolPhase, label: string, effortLevel: 0.0-1.0 }

// Task with day/effort filtering
interface Task {
  id: string; title: string; timeSpan: TimeSpan;
  daysOfWeek?: number[]; required?: boolean;
  notificationTime?: string; soundEffect?: string;
}

// Medical journal entry types
type JournalEntryType = 'daily_obs' | 'med_change' | 'va_note' | 'incident' | 'advocacy'

// Alarm definition
interface AlarmDefinition {
  id: string; type: AlarmType; time: string;
  required: boolean; soundSequence: string[];
  message: (cycleDay: number, phase: HaldolPhase) => string;
}
```

### UI/UX Elements Worth Preserving
- Zombie mode opacity dimming on non-required tasks
- Role toggle header (VETERAN view vs CAREGIVER view)
- Animated progress bar (gold → green at 100%)
- Cycle phase badge in header
- Phase-aware motivational messages tied to effort level

### Risks
- Firebase dependency — if project `br-ai-n-18c62` goes away, all historical data (streaks, completions, cycle anchor) is lost.
- Hardcoded Gemini key in governor.py is live and exposed if repo is ever public.
- Scattered config means injection date (the most critical piece of data) lives in schedule.js AND Firestore — could drift.
- Phone system is partially wired; Twilio calls partially fire — unclear what happens on a partial failure.

---

## D. Guardian-OS Findings

### Stack
- pnpm monorepo, Node 24, TypeScript 5.9 composite projects
- React 19 + Vite 7, Radix UI / shadcn, Tailwind v4, wouter, React Query, Recharts, Framer Motion
- Express 5, esbuild ESM bundle, pino logging
- PostgreSQL + Drizzle ORM (23 tables), node-postgres Pool
- OpenAPI 3.1 → Orval codegen (Zod validators + React Query hooks)
- Gemini 2.5 Flash (SSE streaming, XML tag extraction)
- Deploy: Replit autoscale

### Strengths
1. **Full type safety end-to-end.** TypeScript on server and client, Zod validation on every route
   input, Drizzle type-inferred queries, OpenAPI contract generates both client and validators.
2. **Spec-first discipline.** OpenAPI is the single source of truth; codegen enforces the contract.
   Nothing drifts silently.
3. **Real relational persistence.** 23 Drizzle tables with proper FK relations and auto-seeding.
   No JSON blob state.
4. **Gemini SSE is sophisticated.** XML tag extraction from Jessica's streaming responses captures
   health data points, device commands, and meal cravings inline — structured AI output without
   post-processing.
5. **Health assessment system is unique.** 26 questions, cycle-day filtering, polarity-aware trend
   normalization, sustained anomaly detection (≥3 flagged sessions), 14-day heatmap. Not in Br[AI]n.
6. **Admin panel is comprehensive.** 8-tab command center (Dashboard, Schedule, Symptoms, Scripts,
   Haldol, Health Intelligence, Shopper, Governor) — 1705 lines, fully wired to React Query.
7. **E2EE intercom exists.** Encrypted family messaging (ciphertext + IV + salt) with vault passphrase gate.
8. **Smart home integration.** 8 devices (Alexa, Sonos, lights) with volume/brightness API.
9. **Quiet window enforcement.** Jessica returns HTTP 423 during sleep hours (22:00–07:00) — prevents
   cognitive disruption at night.
10. **Governor pillars in DB.** Raymo's work pillars (Lulubear Bakery, SS_III, Growth) with focus
    duration and daily notes — same as Br[AI]n manifest.json but persisted and queryable.

### Weaknesses
1. **No alarm/reminder system.** No scheduled reminders, no push notifications, no TTS callouts.
   Guardian-OS can display a schedule but cannot initiate contact with Pops.
2. **No auth.** All routes are open — single-user home assumption. Risk if ever exposed to internet.
3. **No tests.** Zero test coverage on any of the health extraction, cycle math, or anomaly logic.
4. **No outbound call scheduler.** No equivalent of brain-scheduler. Jessica is pull (Pops calls in),
   not push (system calls Pops).
5. **Voice scripts not woven into Jessica.** Scripts table exists and Jessica reads from it in principle,
   but they are not retrieved and injected into the system prompt before conversations.
6. **Shopper has no AI generation.** Routes + DB tables exist, but there is no Gemini meal-plan
   generation endpoint. The shopper routes handle CRUD + cart math but not the AI-driven plan creation
   that Br[AI]n's shopper_agent.py does.
7. **No brain puzzle or celebration UX.** No cognitive engagement pattern, no feedback moments.
8. **No medical journal.** symptom_logs table exists but no structured journal entry types, no
   cycle-phase color coding, no printable export for VA use.
9. **Image generation is orphaned.** Gemini image API is wired but exposed nowhere.
10. **`lib/integrations/` duplicates `lib/integrations-gemini-ai/`** — consolidation needed.
11. **No DB migrations.** Schema changes require manual ALTER TABLE. High risk as schema evolves.
12. **CORS is open (`cors()` with no config).** Risky if API is ever exposed.

### Missing Pieces Compared to Br[AI]n
| Missing | Priority | Port or Build |
|---------|----------|---------------|
| Alarm/reminder system | HIGH | Port from useAlarmSystem.jsx |
| Push notifications (NTFY) | HIGH | Port from useAlarmSystem.jsx |
| Outbound call scheduler | HIGH | Port from brain-scheduler/index.js |
| Shopper AI (Gemini meal gen) | MEDIUM | Port from shopper_agent.py |
| Brain Puzzle game | MEDIUM | Port from BrainPuzzleModal.tsx |
| Medical Journal (structured) | MEDIUM | Extend symptom_logs schema |
| Celebration / confetti UX | LOW | Port from celebrations.js |
| Car wash rotation utility | LOW | Port from dateService.ts |

### Risks
- No auth means a single misconfigured firewall exposes all health/medication data.
- No migrations = schema evolution is a manual, error-prone process.
- Gemini API key is an env var (good), but no rate limiting on the `/api/gemini` route.
- Replit autoscale deployment: cold start latency, no persistent disk (JSON files would not survive).
- No DB backup strategy documented.

---

## E. Consolidation Recommendation

### Target Architecture: Guardian.OS

Guardian-OS is the shell. Br[AI]n is the domain dictionary. The consolidation brings Br[AI]n's
proven patterns into Guardian-OS's typed, contracted, relational foundation.

### Recommended Frontend Structure
```
artifacts/brain-app/src/
├── pages/
│   ├── pops-view.tsx          # Existing — enhance with celebration UX, brain puzzle trigger
│   ├── jessica-phone.tsx      # Existing — weave voice scripts into pre-call system prompt
│   ├── admin-view.tsx         # Existing — add MedJournal tab, alarm settings tab
│   ├── smart-home.tsx         # Existing
│   ├── intercom.tsx           # Existing
│   └── vault-gate.tsx         # Existing
├── components/
│   ├── ui/                    # Existing Radix/shadcn primitives
│   ├── BrainPuzzleModal.tsx   # PORT from Br[AI]n
│   ├── ProgressBar.tsx        # PORT from Br[AI]n (or use existing shadcn Progress)
│   ├── CelebrationOverlay.tsx # BUILD from celebrations.js patterns
│   └── MedJournal/            # PORT and restructure from Br[AI]n MedJournal.jsx
└── lib/
    ├── haldolService.ts       # PORT from Br[AI]n haldolService.ts (validate against DB)
    ├── soundService.ts        # PORT from Br[AI]n soundService.ts
    └── celebrationService.ts  # PORT from Br[AI]n celebrations.js
```

### Recommended Backend/API Structure
Extend the existing 12-router Express server. All new features follow the spec-first rule:
**openapi.yaml → codegen → server route → db schema.**

New routes to add:
```
/api/alarms          GET/POST/PUT/DELETE alarm definitions
/api/alarms/fire     POST trigger alarm manually
/api/notifications   POST push notification via NTFY
/api/calls           POST queue outbound Twilio call
/api/calls/schedule  GET/PUT scheduled call config
/api/meals/generate  POST AI meal plan (Gemini → shopper tables)
/api/journal         GET/POST/PUT/DELETE medical journal entries
```

### Recommended Database/Schema Strategy
Extend the existing 23-table Drizzle schema:
```sql
-- New tables
alarms              (id, alarmType, time, required, soundSequence, message, enabled)
notification_log    (id, topic, message, priority, sentAt, acknowledged)
call_schedule       (id, time, payload, phaseOverride, lastFiredDate, enabled)
journal_entries     (id, entryType, cycleDay, content, tags, createdAt)
```

**Migration strategy:** Drizzle push for dev; add proper migration tooling (`drizzle-kit generate`)
before any production data exists.

### Recommended AI/Agent Layer
- **Jessica (existing):** Add voice script retrieval before conversation start; inject active scripts
  into system prompt. Add quiet window awareness on frontend (show UI hint when 423 returned).
- **Shopper agent:** Build `/api/meals/generate` route in api-server using the same Gemini client.
  Port shopper_agent.py prompt structure into a TypeScript function in the route.
- **Governor:** Already in DB. Build a `/api/governor/brief` endpoint that summarizes today's
  pillar focus and notes — Jessica can read it at call start.
- **Alarm intelligence:** Add a lightweight AI layer that adjusts alarm message phrasing based on
  current cycle phase (port brain-scheduler payload logic into the alarm route).

### Recommended Local-First/Privacy Strategy
- PostgreSQL remains the persistence layer (not Firebase). All PII stays in the DB.
- Add Drizzle migrations to make schema evolution safe.
- Add a simple passphrase-based auth (extend the existing vault-gate pattern to cover the full API)
  before any external deployment.
- NTFY push: keep using ntfy.sh topic with user-supplied topic string in app_settings table.
- CORS: lock to `localhost` + any known deploy origin. Remove wildcard.
- Secrets: DATABASE_URL, AI keys, Twilio creds — all env vars. Add a `.env.example` documenting
  every required var.

### Recommended Deployment/Dev Workflow
```bash
# Dev
pnpm --filter @workspace/api-server run dev   # Express + hot reload
pnpm --filter @workspace/brain-app run dev    # Vite dev server

# Before any schema change
pnpm --filter @workspace/db run generate      # Drizzle migration file
pnpm --filter @workspace/db run migrate       # Apply migration

# After any openapi.yaml change
pnpm --filter @workspace/api-spec run codegen # Regenerate Zod + RQ hooks

# Type check always
pnpm run typecheck                            # Root — composite project refs
```

---

## F. Migration Plan

### Phase 1 — Stabilize
**Objective:** Verify Guardian-OS builds, typechecks, and seeds without error. Capture the current
state of both repos cleanly. Freeze Br[AI]n — no new features added while migration is underway.

**Files involved:**
- `Guardian-OS/` (typecheck, build, seed verification — read scripts before running)
- `Br[AI]n/.env` (verify VITE_* vars are set, not hardcoded)
- `Br[AI]n/governor/governor.py:22` (flag hardcoded API key — rotate before repo goes public)
- `CareGiving/GUARDIAN_OS_CONTEXT.md` (keep updated)

**Risk:** LOW
**Expected outcome:** Confirmed Guardian-OS baseline. Known env var requirements documented.
**Do not break:** Guardian-OS DB schema, existing seed data, Firebase connection in Br[AI]n.

---

### Phase 2 — Inventory and Normalize Data Models
**Objective:** Produce a complete mapping of every Br[AI]n data shape to Guardian-OS Drizzle tables.
Identify gaps (missing columns, missing tables). Draft schema additions.

**Files involved:**
- `Br[AI]n/src/data/schedule.js` → map to `schedule_tasks` table
- `Br[AI]n/src/types.ts` → verify against Guardian-OS Drizzle schema
- `Br[AI]n/src/hooks/useTaskContext.jsx` → map Firestore shape to DB shape
- `Guardian-OS/lib/db/src/schema/` → add `journal_entries`, `alarms`, `call_schedule`, `notification_log`
- `Guardian-OS/lib/api-spec/openapi.yaml` → add new endpoint stubs for new tables

**Risk:** LOW (schema additions only; no existing data at risk)
**Expected outcome:** Drizzle schema extended. OpenAPI spec updated. Codegen re-run.
**Do not break:** Existing 23 tables and all currently working routes.

---

### Phase 3 — Port High-Value Br[AI]n Features
**Objective:** Bring Br[AI]n's proven domain logic into Guardian-OS one feature at a time.
Order: Haldol math validation → Alarm system → Brain Puzzle → Medical Journal → Shopper AI.

**Files involved:**
- `Guardian-OS/artifacts/api-server/src/routes/haldol.ts` — validate cycle math against Br[AI]n's
  `useCycleContext.jsx:25-30`
- `Guardian-OS/artifacts/api-server/src/routes/alarms.ts` — new route (port alarm definitions)
- `Guardian-OS/artifacts/brain-app/src/` — BrainPuzzleModal, soundService, celebrationService
- `Guardian-OS/artifacts/api-server/src/routes/journal.ts` — new route (extend symptom_logs)
- `Guardian-OS/artifacts/api-server/src/routes/shopper.ts` — add `/generate` endpoint (Gemini)

**Risk:** MEDIUM (new routes touch DB; Gemini integration requires testing)
**Expected outcome:** All high-value Br[AI]n features live in Guardian-OS, typed, behind API contract.
**Do not break:** Existing health-assessment, gemini (Jessica), haldol, symptom routes.

---

### Phase 4 — Build Guardian.OS Unified Shell
**Objective:** Finalize navigation, branding, and naming to "Guardian.OS". Add Alarm Settings tab
to admin. Wire voice scripts into Jessica pre-call prompt. Add MedJournal tab.

**Files involved:**
- `Guardian-OS/artifacts/brain-app/src/pages/admin-view.tsx` — add Alarms tab, MedJournal tab
- `Guardian-OS/artifacts/brain-app/src/pages/jessica-phone.tsx` — fetch active scripts, inject to prompt
- `Guardian-OS/artifacts/api-server/src/routes/gemini.ts` — pre-call script injection
- `Guardian-OS/replit.md` — update naming and docs

**Risk:** LOW–MEDIUM (UI changes; gemini.ts modification needs care)
**Expected outcome:** One cohesive UI. Jessica uses voice scripts. Admin has full caregiver control.
**Do not break:** Existing SSE streaming behavior in jessica-phone.tsx.

---

### Phase 5 — Add Agent/AI Workflows
**Objective:** Outbound call scheduler (port brain-scheduler logic), NTFY push notifications,
shopper AI meal generation fully wired.

**Files involved:**
- New `Guardian-OS/artifacts/api-server/src/routes/calls.ts` (Twilio + cycle-aware payloads)
- New `Guardian-OS/artifacts/api-server/src/routes/notifications.ts` (NTFY wrapper)
- `Guardian-OS/artifacts/api-server/src/routes/shopper.ts` — add `/api/meals/generate`
- `Guardian-OS/lib/integrations-gemini-ai/` — confirm image API orphan; remove or expose

**Risk:** MEDIUM (Twilio integration, external API dependencies)
**Expected outcome:** Guardian.OS can proactively reach out to Pops. Meal plans generated by AI.
**Do not break:** Existing shopper CRUD routes; guardian-OS quiet window logic.

---

### Phase 6 — Add Reporting/Export Workflows
**Objective:** Health trend exports (PDF/CSV), symptom history for VA/psychiatrist, medication
adherence summary, cycle-phase behavior correlation report.

**Files involved:**
- New `Guardian-OS/artifacts/api-server/src/routes/reports.ts`
- `Guardian-OS/lib/api-spec/openapi.yaml` — add report endpoints
- `Guardian-OS/artifacts/brain-app/src/pages/admin-view.tsx` — add Reports tab

**Risk:** LOW (read-only queries, no schema changes)
**Expected outcome:** Raymo can export structured reports for VA appointments.
**Do not break:** Health-assessment query performance (add DB indexes if needed).

---

### Phase 7 — Testing and Validation
**Objective:** Cover the safety-relevant logic with tests. Minimum: Haldol cycle math, zombie mode
transitions, health data extraction from Jessica, anomaly detection, alarm suppression.

**Files involved:**
- New `Guardian-OS/artifacts/api-server/src/__tests__/haldol.test.ts`
- New `Guardian-OS/artifacts/api-server/src/__tests__/gemini.test.ts` (XML tag parsing)
- New `Guardian-OS/artifacts/api-server/src/__tests__/health-assessment.test.ts`
- Root `package.json` or per-package — add vitest or jest

**Risk:** LOW (additive only)
**Expected outcome:** Core domain logic is regression-tested.
**Do not break:** Build pipeline (add test script without breaking typecheck or build).

---

### Phase 8 — Deployment
**Objective:** Harden for production. Add passphrase-based auth covering all routes. Lock CORS.
Document all env vars. Add DB migration tooling. Set up monitoring for flagged sessions.

**Files involved:**
- `Guardian-OS/artifacts/api-server/src/middleware/auth.ts` — new passphrase gate
- `Guardian-OS/artifacts/api-server/src/app.ts` — CORS lockdown, rate limiting on gemini route
- `Guardian-OS/lib/db/` — add `drizzle-kit generate` + `migrate` scripts
- New `.env.example` at `Guardian-OS/` root
- `Guardian-OS/artifacts/api-server/src/routes/health-assessment.ts` — add NTFY alert on flagged session

**Risk:** MEDIUM (auth addition touches all routes; CORS change can break dev flow)
**Expected outcome:** Guardian.OS is safe to expose. Raymo gets push alerts on flagged health sessions.
**Do not break:** Existing dev workflow (use env var to disable auth in development).

---

## G. Unified Guardian.OS Blueprint

### Final Directory Structure

```
Guardian-OS/                           # ← rename to Guardian.OS on deploy
├── artifacts/
│   ├── api-server/
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── state.ts           # (existing)
│   │       │   ├── schedule.ts        # (existing)
│   │       │   ├── symptoms.ts        # (existing)
│   │       │   ├── scripts.ts         # (existing)
│   │       │   ├── haldol.ts          # (existing + validated cycle math)
│   │       │   ├── health-assessment.ts # (existing)
│   │       │   ├── gemini.ts          # (existing + pre-call script injection)
│   │       │   ├── smarthome.ts       # (existing)
│   │       │   ├── intercom.ts        # (existing)
│   │       │   ├── governor.ts        # (existing)
│   │       │   ├── shopper.ts         # (existing + /generate endpoint)
│   │       │   ├── alarms.ts          # NEW — alarm definitions + fire endpoint
│   │       │   ├── notifications.ts   # NEW — NTFY push wrapper
│   │       │   ├── calls.ts           # NEW — Twilio outbound scheduler
│   │       │   ├── journal.ts         # NEW — medical journal entries
│   │       │   └── reports.ts         # NEW — export endpoints (Phase 6)
│   │       └── middleware/
│   │           └── auth.ts            # NEW — passphrase gate (Phase 8)
│   │
│   ├── brain-app/
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── pops-view.tsx      # (existing + brain puzzle trigger, celebration)
│   │       │   ├── jessica-phone.tsx  # (existing + script injection, quiet window hint)
│   │       │   ├── admin-view.tsx     # (existing + Alarms tab, MedJournal tab, Reports tab)
│   │       │   ├── smart-home.tsx     # (existing)
│   │       │   ├── intercom.tsx       # (existing)
│   │       │   └── vault-gate.tsx     # (existing → extend to cover full API in Phase 8)
│   │       ├── components/
│   │       │   ├── ui/                # (existing Radix/shadcn)
│   │       │   ├── BrainPuzzleModal.tsx  # PORT from Br[AI]n
│   │       │   ├── CelebrationOverlay.tsx # BUILD from celebrations.js
│   │       │   └── MedJournalPanel/   # PORT + restructure from Br[AI]n MedJournal.jsx
│   │       └── lib/
│   │           ├── haldolService.ts   # PORT from Br[AI]n (validate against DB)
│   │           ├── soundService.ts    # PORT from Br[AI]n
│   │           └── celebrationService.ts # PORT from Br[AI]n celebrations.js
│   │
│   └── mockup-sandbox/                # (keep for design prototyping)
│
├── lib/
│   ├── api-spec/openapi.yaml          # SOURCE OF TRUTH — add new endpoints before coding
│   ├── api-zod/                       # generated — run codegen after spec changes
│   ├── api-client-react/              # generated — run codegen after spec changes
│   ├── db/src/schema/                 # add journal_entries, alarms, call_schedule, notification_log
│   ├── integrations-gemini-ai/        # keep; remove orphaned lib/integrations/
│   └── [remove lib/integrations/]     # consolidate into integrations-gemini-ai
│
├── scripts/src/seed.ts                # extend with alarm + journal seed data
├── .env.example                       # NEW — document all required vars
└── GUARDIAN_OS_CONTEXT.md             # this living doc
```

### Module Naming Conventions
- Routes: noun-plural (alarms, notifications, calls, journal, reports)
- DB tables: snake_case plural (alarm_definitions, notification_log, call_schedule, journal_entries)
- Frontend pages: kebab-case (admin-view, pops-view, jessica-phone)
- Services: camelCase (haldolService, soundService, celebrationService)

---

## H. Immediate Next 10 Tasks

1. **Complete the data-model gap matrix** — map every Br[AI]n data shape to Guardian-OS Drizzle
   tables. Identify columns to add. (Read-only; produce a table in GUARDIAN_OS_CONTEXT.md)

2. **Validate Guardian-OS Haldol cycle math** — compare `useCycleContext.jsx:25-30` against
   `Guardian-OS/artifacts/api-server/src/routes/haldol.ts`. Confirm the 14-day modular arithmetic
   and zombie-phase day range (1-5) match exactly.

3. **Rotate the exposed Gemini API key** — `Br[AI]n/governor/governor.py:22` has a hardcoded key.
   Flag to Raymo: rotate this key in Google AI Studio before the repo is pushed anywhere public.

4. **Document all required env vars** — list every env var across both projects (DATABASE_URL,
   AI_INTEGRATIONS_GEMINI_API_KEY, AI_INTEGRATIONS_GEMINI_BASE_URL, VITE_FIREBASE_API_KEY,
   VITE_FIREBASE_APP_ID, PORT, BASE_PATH, NTFY topic, Twilio creds). Create `.env.example`.

5. **Add Drizzle migration tooling to Guardian-OS** — add `drizzle-kit` and `generate`/`migrate`
   scripts to `lib/db/package.json`. No schema changes yet; just tooling. (Low risk, additive.)

6. **Draft journal_entries table schema** — map Br[AI]n's 5 MedJournal entry types into a Drizzle
   table definition. Get approval before adding to schema.

7. **Draft alarms table schema** — map Br[AI]n's 8 alarm types + their fields into a Drizzle
   table definition. Get approval before adding to schema.

8. **Flag dead code for deletion** — produce a list of files in Br[AI]n safe to remove:
   `.legacy/` (11 files), `.backup`, `.miami`, `useAlarmSystem.ts`, `useTasks.ts`.
   No deletions yet — just produce the list and get approval.

9. **Lock CORS in Guardian-OS api-server** — change `cors()` (open) to `cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] })` in `artifacts/api-server/src/app.ts`. Low-risk, high-security value.

10. **Get approval, then begin Phase 1** — run `pnpm run typecheck` and `pnpm run build` in
    Guardian-OS to confirm the baseline is clean before any porting begins.

---

*End of report. No files have been created or modified by this audit except this document and
GUARDIAN_OS_CONTEXT.md. All changes require explicit approval before execution.*
