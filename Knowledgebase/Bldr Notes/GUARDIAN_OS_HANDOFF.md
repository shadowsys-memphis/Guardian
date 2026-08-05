# Guardian.OS — Consolidation Handoff Note
> Last updated: 2026-06-22
> Status: Audit complete. Ready to begin Phase 1 implementation on next session.

## Where We Left Off

Both codebases fully audited. All three phases planned and approved. Phase 1 implementation
was begun (haldolService.ts draft) but Raymo paused — we are still in documentation-only mode.
No source files have been modified in either project.

## What Has Been Written (Documentation Only)

| File | Purpose |
|------|---------|
| `CareGiving/CLAUDE.md` | Codebase guidance for all future Claude sessions |
| `CareGiving/GUARDIAN_OS_CONTEXT.md` | Living working context: foundation decision, stack, phases, next 10 tasks |
| `CareGiving/GUARDIAN_OS_CONSOLIDATION_REPORT.md` | Full A–H audit report (Executive Summary → Blueprint → Migration Plan) |
| `CareGiving/GUARDIAN_OS_HANDOFF.md` | This file — return-to-work context |

## Foundation Decision (Final)

**Guardian-OS is the foundation.** Do not touch Br[AI]n except to read from it.

## Critical Pre-Code Notes

### 1. Haldol Math Bug (DO NOT MISS)
`Guardian-OS/artifacts/api-server/src/routes/haldol.ts:14` has an off-by-one error:
```
// WRONG — produces cycle days 1–14
const cycleDay = (diffDays % 14) + 1;

// CORRECT — matches Br[AI]n validated logic, 0-indexed (0–13)
const cycleDay = diffDays >= 0 ? diffDays % 14 : 14 + (diffDays % 14);
```
Zombie phase = days 1–5 (0-indexed). Injection day = day 0. Fix this before anything else.

### 2. Hardcoded API Key (SECURITY)
`Br[AI]n/governor/governor.py:22` — live Gemini API key hardcoded in source.
**Rotate this key before Br[AI]n repo is ever pushed anywhere public.**

### 3. CORS — Already Locked
`Guardian-OS/artifacts/api-server/src/app.ts:28` — already restricts to localhost:5173 and :3000.
No action needed here.

### 4. TypeScript PATH Issue
`pnpm run typecheck` fails with `tsc: command not found` — tsc is pnpm-local, not in PATH.
Run via `pnpm exec tsc --build` or through the script. Not a real error, just a PATH issue.

## Approved Phase Plan

### Phase 1 — Core Foundation & Safety Parity
1. Extract canonical Haldol math → `lib/db/src/haldolService.ts` (shared, used by routes + frontend)
2. Fix the off-by-one bug in `artifacts/api-server/src/routes/haldol.ts`
3. Create `.env.example` at `Guardian-OS/` root — all required vars documented
4. Draft schema additions: `journal_entries` table + `alarms` table (in `lib/db/src/schema/index.ts`)

### Phase 2 — High-Value Feature Porting
1. Medical Journal — `artifacts/brain-app/src/components/MedJournalPanel/` + `api-server/src/routes/journal.ts`
2. Shopper AI — add `/api/meals/generate` to `artifacts/api-server/src/routes/shopper.ts` (Gemini meal plan)
3. Alarm Orchestration — new `api-server/src/routes/alarms.ts` + NTFY push wrapper; zombie suppression
4. Brain Puzzle — port `BrainPuzzleModal.tsx` into `artifacts/brain-app/src/components/`

### Phase 3 — Agentic Subsystems
1. Pre-call script injection — update `gemini.ts` to fetch active scripts before conversation start
2. Outbound call scheduler — new `api-server/src/routes/calls.ts` (Twilio + cycle-aware payloads)
3. Health reports — new `api-server/src/routes/reports.ts` + PDF/CSV export for VA appointments

## Files to Touch First (Phase 1)

```
Guardian-OS/
├── lib/db/src/haldolService.ts          ← NEW shared service (canonical cycle math)
├── lib/db/src/schema/index.ts           ← ADD journal_entries + alarms tables
├── artifacts/api-server/src/routes/
│   └── haldol.ts                        ← FIX off-by-one bug (line 14)
├── lib/api-spec/openapi.yaml            ← ADD journal + alarms endpoints (spec-first)
└── .env.example                         ← NEW (no secrets, just var names + descriptions)
```

## Required Environment Variables (All Projects)

### Guardian-OS
| Variable | Required | Used By |
|----------|----------|---------|
| `DATABASE_URL` | YES | lib/db (Drizzle/Postgres) |
| `PORT` | YES | api-server + brain-app Vite |
| `BASE_PATH` | YES | brain-app Vite config |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | YES | Jessica (gemini.ts) |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | YES | Jessica (gemini.ts) |

### Br[AI]n (legacy — for reference)
| Variable | Required | Used By |
|----------|----------|---------|
| `VITE_FIREBASE_API_KEY` | YES | Firebase Firestore |
| `VITE_FIREBASE_APP_ID` | YES | Firebase Firestore |
| ElevenLabs voice ID | hardcoded | useAlarmSystem.jsx (should be env var) |
| NTFY topic | localStorage | useAlarmSystem.jsx (should be env var) |
| Twilio creds | macOS Keychain | brain-scheduler (OK) |

## Key Source Files for Reference (Br[AI]n — do not edit)

| File | Why it matters |
|------|----------------|
| `src/hooks/useCycleContext.jsx:25-30` | Proven Haldol cycle math to port |
| `src/hooks/useAlarmSystem.jsx:538-540` | Zombie suppression gate logic |
| `src/hooks/useAlarmSystem.jsx` (631 lines) | Full alarm architecture to port |
| `src/components/BrainPuzzleModal.tsx` | Simon Says game to port |
| `src/components/MedJournal.jsx` | 5 entry types + cycle color coding |
| `src/components/shopper/*` | Meal planner UI to port |
| `src/utils/celebrations.js` | Cycle-aware confetti + messages |
| `governor/shopper_agent.py` | Gemini meal plan prompt structure |
| `brain-scheduler/index.js` | Cycle-adaptive Twilio call payloads |

## Rules for Next Session

- Spec-first always: `openapi.yaml` → codegen → route → schema. Never the reverse.
- Do not hand-edit `lib/api-zod/` or `lib/api-client-react/` — run codegen.
- Quote `"Br[AI]n"` in all shell commands (glob chars).
- Medical/Haldol logic is safety-critical — validate date math against both implementations.
- No auth exists yet — do not expose API externally until Phase 8 (passphrase gate).
