# Guardian.OS Consolidation Handoff & Tasks

## Objective
Migrate proven features and domain logic from the legacy `Br[AI]n` React/Firebase application into the new `Guardian-OS` pnpm monorepo architecture (React 19, TypeScript, Express 5, PostgreSQL, Drizzle).

## Core Task List (The Road to Guardian.OS Parity)

### Phase 1: Preparation & Schema
- [ ] **Validate Cycle Math**: Compare Br[AI]n's 14-day `haldolService.ts` and `useCycleContext.jsx` math against Guardian-OS `haldol` routes.
- [ ] **Data Model Mapping**: Ensure all Br[AI]n schedules, quarters, rotating chores, restrictions, and rest_day_tasks map to Guardian-OS's 23 Drizzle tables.
- [ ] **Define New Tables**: Draft Drizzle schemas for `alarms`, `notification_log`, `call_schedule`, and `journal_entries` (based on Br[AI]n's 5 MedJournal entry types).

### Phase 2: Feature Porting & API Construction
- [ ] **Alarms & Reminders**: Port `useAlarmSystem.jsx` (TTS, sequences, NTFY push, Zombie mode suppression) to the new backend as scheduled services and an `/api/alarms` contract.
- [ ] **Shopper AI (Governor)**: Re-create the Gemini AI meal generation (from `shopper_agent.py`) inside an `/api/meals/generate` Express route using the `integrations-gemini-ai` service.
- [ ] **Outbound Call Scheduler**: Port the Twilio & phase-adaptive logic from `brain-scheduler/index.js` into an `/api/calls` API and Node Cron service.
- [ ] **Medical Journal**: Build the `/api/journal` API utilizing the new `journal_entries` Drizzle table with proper schema enforcement.

### Phase 3: Frontend Porting (React 19)
- [ ] **Haldol UI & Progress**: Adapt `TaskCard.tsx` (task dimming/opacity), `ProgressBar.tsx`, and Zombie Mode banners.
- [ ] **Cognitive Warmup**: Port `BrainPuzzleModal.tsx` (Simon Says).
- [ ] **Celebration Patterns**: Reimplement `celebrations.js` (confetti and phase-aware motivational messaging).
- [ ] **MedJournal UI**: Reconstruct the medical reporting UI so the Caregiver can view structured logs.
- [ ] **Jessica Phone Injector**: Fetch active scripts dynamically to inject into Jessica's Gemini system prompt before conversation.

### Phase 4: Hardening
- [ ] **Passphrase Auth**: Expand `vault-gate.tsx`/middleware to lock behind a caregiver passphrase.
- [ ] **CORS Settings**: Restrict the Express server to `localhost` and specific remote deployment domains.
- [ ] **Testing**: Create vitest/jest specs for haldol-cycle logic, Gemini XML parsing, and zombie transition conditions.

## Execution Rules
1. **DO NOT** write application code, logic hooks, or APIs right now.
2. Maintain spec-first flow: edit `openapi.yaml`, run codegen (`pnpm --filter @workspace/api-spec run codegen`), write backend, implement frontend.
3. Keep the "Zero-Tech" rule strict for Pops' display components.
4. Remove/Ignore orphans like the `.legacy` Br[AI]n components or duplicate integrations folders.

> Note: Make sure to rotate any exposed Gemini API keys previously found in legacy Python scripts before deploying.
