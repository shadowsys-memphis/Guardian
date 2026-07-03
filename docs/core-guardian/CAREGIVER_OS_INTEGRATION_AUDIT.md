# Caregiver OS Integration Audit

**Date:** 2026-06-29  
**Objective:** Analyze care-giver-os (AI Studio build) and map integration path into Guardian-06.28.26  
**Status:** Source project is prototype; Guardian is production-ready monorepo

---

## Executive Summary

The `care-giver-os` project (built in Google AI Studio) is a **prototype/skeleton** that contains:
- Design documentation (AGENTS.md, GUARDIAN_OS_HANDOFF.md, phase schemas)
- Useful component blueprints (TwilioAssistant, EncryptionUnlock)
- Comprehensive task templates (DEFAULT_TASKS: 30+ structured caregiving tasks)
- In-memory API stubs (hardcoded state, no database)

**Guardian-06.28.26** is the production architecture:
- Full TypeScript monorepo (pnpm)
- PostgreSQL + Drizzle ORM with 23 tables
- Express 5 API with proper routes and persistence
- OpenAPI spec + Orval codegen (React Query hooks)
- Three user views (/pops, /admin, /jessica)
- Pastel theme + LM Studio model switching (just completed)

**Integration Strategy:** Use care-giver-os as a SOURCE of design ideas and components. Guardian is the TARGET. Extract high-value pieces; ignore redundant stubs.

---

## Part 1: care-giver-os Inventory

### Project Structure

```
care-giver-os/
  server.ts                    # Express server with in-memory API stubs
  src/
    App.tsx                    # Main React app entry
    types.ts                   # TypeScript interfaces (PatientTask, HistoricalCareLog)
    components/
      TwilioAssistant.tsx      # Voice call UI with audio synthesis (14KB)
      EncryptionUnlock.tsx     # Passphrase-gated entry (6.2KB)
    lib/
      constants.ts            # DEFAULT_TASKS (30+ tasks), PRELOADED_HISTORICAL_LOGS
      encryption.ts           # Passphrase/cipher logic
  openclaw-skills/            # OpenClaw skill definitions (not explored)
  *.md                         # Design docs & schemas
```

### API Endpoints (In-Memory Stubs)

| Method | Path | Implementation | Data |
|---|---|---|---|
| GET | /api/haldol | Hardcoded object | dayOfCycle, isZombiePhase, nextInjectionDate |
| PUT | /api/haldol | Object merge | Updates globalHaldolState |
| GET | /api/schedule | Hardcoded array | 4 sample tasks |
| POST | /api/schedule/:id/complete | Find + update status | |
| POST | /api/symptoms | Log only (console) | Not persisted |
| GET | /api/scripts | Hardcoded array | 2 sample scripts |
| POST | /api/scripts | Push to array | In-memory only |
| PUT | /api/scripts/:id | Find + update | In-memory only |
| POST | /api/calendar/events | Google Calendar API | Requires OAuth token in header |

**Key Weakness:** All data in-memory; no persistence beyond app restart.

### Components

#### TwilioAssistant.tsx (13.9 KB)
**Purpose:** Voice call interface for caregiver (Ray/Emily).  
**Features:**
- Audio synthesis (dial tones, confirmation beeps via Web Audio API)
- Call state machine: idle → calling → connected → ended
- Speaker toggle
- Message history (user + assistant)
- Triggered alerts list
- Simulated connection delay (2s)

**Value:** Audio UX patterns for Jessica phone interface; could enhance current jessica-phone.tsx with tone/audio feedback.

**Guardian Analog:** artifacts/brain-app/src/pages/jessica-phone.tsx (current SSE-based interface; no audio synthesis yet)

#### EncryptionUnlock.tsx (6.2 KB)
**Purpose:** Passphrase-gated security layer for app entry.  
**Features:**
- Beautiful UI (dark slate background, emerald accent colors)
- Passphrase input with show/hide toggle
- Cipher text display option
- Fallback demo mode
- Motion animations

**Value:** CRITICAL. Guardian's CLAUDE.md Phase 4 (Hardening) explicitly requires passphrase auth. This component is production-ready for adapting.

**Guardian Analog:** No current passphrase auth; should port this component into a new `/vault` route or middleware.

### Data & Constants

#### DEFAULT_TASKS (src/lib/constants.ts)
**30+ structured caregiving tasks** organized by period (morning, afternoon, night):

```
Morning (06:00-12:00):
  - Warm fluid offer (lemon ginger, 4oz hourly)
  - Body posture alignment & shoulder stretch (bi-hourly)
  - Blood pressure & SpO2 biometric reading
  - Medication administration
  - Sore pressure check & position shift

Afternoon (12:00-18:00):
  - Pressure relief checks (bi-hourly)
  - Soft diet ingestion compliance
  - Fluid checks (berries, gelatin)
  - Posture rotation (left lateral recumbent)
  - Cognitive coordination & family board check

Night (18:00-06:00):
  - Bedtime meds & comfort routine
  - Room climate & bedding temp checks (72°F target)
  - Mattress inflation & rail safeguard checks
  - Spine alignment & ankle pillow support
  - Oxygen flow & respiration rate verification
  - Deep sleep position shifts
  - Mouth moisture inspection
```

**Value:** CRITICAL for /admin task seeding. Guardian's current task list is minimal; this is comprehensive medical caregiving baseline.

**Guardian Analog:** lib/db/src/schema/schedule_tasks table (only has sample data; could use this as seed template).

#### PRELOADED_HISTORICAL_LOGS
3 weeks of historical care compliance:
- rateOfWantsResponded (92-100%)
- medAdherence (92-100%)
- soreRotationComplete (88-94%)
- efficacyScore (8-10)

**Value:** Useful for seeding historical data; Guardian's scripts/seed.ts could reference this.

### Design Documentation

#### GUARDIAN_OS_HANDOFF.md
**Purpose:** Consolidation roadmap for migrating Br[AI]n features into Guardian-OS (pnpm monorepo).

**Phases:**
1. **Phase 1: Preparation & Schema** — Validate cycle math, map data models, define new tables
2. **Phase 2: Feature Porting** — Alarms, Shopper AI, Outbound call scheduler, Medical journal
3. **Phase 3: Frontend Porting** — React 19 UI components (Haldol UI, Cognitive warmup, Celebration patterns, MedJournal UI, Jessica phone injector)
4. **Phase 4: Hardening** — Passphrase auth, CORS, Testing

**Status in Guardian:** Phase 1-2 partially done (haldol routes exist, shopper module exists); Phase 3-4 not started.

#### AGENTS.md
**System Intelligence & Project Context** — describes the Governor system, patient core (Pops), Jessica Hub, Shopper Engine, multi-model consensus.

**Already Captured in Guardian:** CLAUDE.md files describe this; redundant.

#### PHASE_1_SCHEMA_MAPPING.md & INVENTORY_BASELINE.md
**Data migration strategy** from Firebase → PostgreSQL.  
Tables already exist in Guardian's Drizzle schema. These docs are reference material for understanding the model.

---

## Part 2: Guardian-06.28.26 Inventory (Current State)

### Architecture Strengths

| Area | Guardian | care-giver-os |
|---|---|---|
| **Database** | PostgreSQL + Drizzle (23 tables, typed) | In-memory only |
| **API Contract** | OpenAPI 3.1 spec + Orval codegen | Hardcoded stubs |
| **Frontend** | React 19 + Vite + TailwindCSS | React 19 + Vite + TailwindCSS |
| **Views** | 3 proper views (/pops, /admin, /jessica) | Single prototypal app |
| **AI Integration** | Gemini + LM Studio (just completed) | Gemini stubs only |
| **Authentication** | None (household-only, no sessions) | Passphrase (not implemented) |
| **Voice Interface** | Jessica phone (SSE streaming) | Twilio stubs |
| **Task Persistence** | DB-backed schedules | Hardcoded arrays |
| **Type Safety** | Full TypeScript + project references | TypeScript, minimal types |

**Verdict:** Guardian is production-ready; care-giver-os is a useful design document + component reference.

### Current Gaps (from GUARDIAN_OS_HANDOFF.md)

- [ ] **Phase 2a:** Alarms & Reminders (TTS, sequences, NTFY push, Zombie mode suppression)
- [ ] **Phase 2b:** Shopper AI (Gemini meal generation via /api/meals/generate)
- [ ] **Phase 2c:** Outbound Call Scheduler (Twilio + phase-adaptive logic)
- [ ] **Phase 2d:** Medical Journal (/api/journal routes + journal_entries table)
- [ ] **Phase 3a:** Haldol UI component refactoring (task dimming/opacity, ProgressBar, Zombie Mode banners)
- [ ] **Phase 3b:** Cognitive Warmup (Simon Says puzzle)
- [ ] **Phase 3c:** Celebration Patterns (confetti, phase-aware motivational messaging)
- [ ] **Phase 3d:** MedJournal UI (caregiver structured log view)
- [ ] **Phase 3e:** Jessica Phone Injector (fetch active scripts → inject into Gemini system prompt)
- [ ] **Phase 4a:** Passphrase Auth (vault-gate middleware)
- [ ] **Phase 4b:** CORS Hardening (localhost + deployment domains)
- [ ] **Phase 4c:** Testing (vitest/jest for cycle logic, XML parsing, zombie transitions)

---

## Part 3: Integration Plan

### Extract & Port (High Value)

#### 1. EncryptionUnlock Component → Guardian Vault Gate
**Effort:** Low-Medium (1-2 hours)  
**Files:**
- Copy `care-giver-os/src/components/EncryptionUnlock.tsx` → `Guardian/artifacts/brain-app/src/components/EncryptionUnlock.tsx`
- Adapt colors to Guardian's pastel theme (change emerald → sage green accents)
- Create new route `/admin/vault` or middleware that gates /admin behind passphrase
- Store passphrase hash in `app_settings` table (key="vault_passphrase")

**Guardian Change:**
```tsx
// artifacts/brain-app/src/pages/admin-view.tsx
// Wrap component with <EncryptionUnlock> gate
// On unlock, set authState in localStorage + fetch

// Or create middleware in api-server:
app.use((req, res, next) => {
  if (req.path.startsWith('/api/admin')) {
    const token = req.headers['x-vault-token'];
    if (!token) return res.status(401).json({error: "vault_locked"});
    // validate token
  }
  next();
});
```

#### 2. DEFAULT_TASKS Template → Guardian Seed Data
**Effort:** Low (30 min)  
**Files:**
- Copy care-giver-os/src/lib/constants.ts into Guardian seed
- Update `scripts/src/seed.ts` to insert DEFAULT_TASKS into schedule_tasks table
- Map task properties: id → unique, title, timeLabel (07:00 AM, etc.), quarter (Q1-Q4 based on period), category (via voice script)

**Guardian Change:**
```bash
pnpm --filter @workspace/scripts run seed
# Now creates 30+ real tasks instead of 4 placeholders
```

#### 3. TwilioAssistant Audio Patterns → Jessica Phone Enhancement
**Effort:** Medium (2-3 hours)  
**Files:**
- Extract audio synthesis code from TwilioAssistant.tsx
- Add audio feedback to jessica-phone.tsx (dial tones on message send, confirmation beeps)
- Consider: TTS (text-to-speech) for Jessica's voice responses (using Web Speech API or ElevenLabs)

**Guardian Change:**
```tsx
// artifacts/brain-app/src/pages/jessica-phone.tsx
const playDialTone = () => { /* from TwilioAssistant */ };
// On message send: playDialTone()
// On response: play confirmation tone or TTS
```

### Document & Archive (Reference Only)

#### 4. Keep Design Docs (Read-Only)
- care-giver-os/GUARDIAN_OS_HANDOFF.md → Use as Phase 2-4 task checklist
- care-giver-os/AGENTS.md → Reference for system intelligence
- care-giver-os/PHASE_1_SCHEMA_MAPPING.md → Keep for data migration reference
- care-giver-os/INVENTORY_BASELINE.md → Reference for shopper budgets

**Action:** Copy to `Guardian/docs/CAREGIVER_OS_REFERENCE/` (read-only archive).

### Phase 2-4 Implementation (Guardian Roadmap)

Prioritize in this order:

#### Phase 2 (Backend Feature Porting)
1. **Medical Journal API** — Add `/api/journal` routes + journal_entries table (refs PHASE_1_SCHEMA_MAPPING.md)
2. **Shopper AI Generation** — Implement `/api/meals/generate` using Gemini + integrations-gemini-ai service
3. **Alarms & Reminders** — Implement `/api/alarms` routes + alarm trigger logic (NTFY push, TTS, Zombie mode suppression)
4. **Call Scheduler** — Port call_schedule logic to Node Cron (optional: Twilio integration if needed)

#### Phase 3 (Frontend Component Porting)
1. **Haldol UI Refactor** — Update task opacity/dimming based on cycle day (Zombie mode visual dimming)
2. **Cognitive Warmup** — Add Simon Says puzzle modal (referenced in AGENTS.md)
3. **Celebration Patterns** — Add confetti + motivational badges on task completion
4. **MedJournal UI** — Build 5-entry-type journal view (daily_obs, med_change, va_note, incident, advocacy)

#### Phase 4 (Hardening)
1. **Passphrase Auth** — Port EncryptionUnlock.tsx; add vault-gate middleware
2. **CORS Hardening** — Restrict Express to localhost + deployment domains
3. **Test Suite** — Add vitest/jest for cycle math, XML parsing, Zombie transition

---

## Part 4: Action Items

### Immediate (This Week)

- [ ] **Copy design docs** to Guardian/docs/CAREGIVER_OS_REFERENCE/ (read-only archive)
- [ ] **Extract EncryptionUnlock.tsx** — Port to Guardian with pastel theme colors
- [ ] **Update seed data** — Add DEFAULT_TASKS to scripts/src/seed.ts
- [ ] **Create Phase 2-4 checkpoint** — Document implementation tasks in docs/checkpoints/

### This Sprint (Week 1-2)

- [ ] Port EncryptionUnlock component with passphrase middleware
- [ ] Enhance jessica-phone.tsx with audio feedback (playTone logic from TwilioAssistant)
- [ ] Implement /api/journal routes + UI in admin-view

### Future (Planned, Not Urgent)

- [ ] Phase 2: Shopper AI, Alarms, Call Scheduler
- [ ] Phase 3: UI component refactors, Cognitive Warmup, Celebration Patterns
- [ ] Phase 4: CORS hardening, Test suite

---

## Part 5: Files to Keep / Archive

### Keep in care-giver-os (Reference)
- GUARDIAN_OS_HANDOFF.md
- AGENTS.md
- PHASE_1_SCHEMA_MAPPING.md
- INVENTORY_BASELINE.md
- openclaw-skills/ (if using OpenClaw)

### Extract to Guardian
- EncryptionUnlock.tsx → artifacts/brain-app/src/components/
- DEFAULT_TASKS from constants.ts → scripts/src/seed.ts
- TwilioAssistant audio patterns → artifacts/brain-app/src/pages/jessica-phone.tsx

### Archive (Copy to docs/CAREGIVER_OS_REFERENCE/)
- All .md design docs
- server.ts (as reference for endpoint shapes)
- types.ts (as reference for interfaces)

### Ignore (Too Coupled to AI Studio)
- vite.config.ts (Guardian's is better)
- firebase-applet-config.json (Firebase is deprecated)
- fix_indigo.js, modernize_classes*.js, rename_classes*.js (refactoring scripts, not needed)

---

## Summary Table: care-giver-os → Guardian Mapping

| care-giver-os | Guardian | Status | Priority |
|---|---|---|---|
| EncryptionUnlock.tsx | /vault passphrase gate | Not implemented | HIGH |
| TwilioAssistant.tsx | jessica-phone.tsx enhancement | Partial (SSE only) | MEDIUM |
| DEFAULT_TASKS | schedule seed data | Minimal | HIGH |
| /api/haldol (stub) | artifacts/api-server/src/routes/haldol.ts | Implemented | — |
| /api/schedule (stub) | artifacts/api-server/src/routes/schedule.ts | Implemented | — |
| /api/scripts (stub) | artifacts/api-server/src/routes/scripts.ts | Implemented | — |
| /api/symptoms (stub) | artifacts/api-server/src/routes/health-assessment.ts | Implemented | — |
| /api/calendar/events | Not in scope (Google Calendar integration) | Deferred | LOW |
| GUARDIAN_OS_HANDOFF.md | Task checklist for Phase 2-4 | Reference | — |

---

## Conclusion

**care-giver-os is valuable for:**
1. ✅ Component blueprints (EncryptionUnlock, TwilioAssistant patterns)
2. ✅ Task templates & domain constants
3. ✅ Design documentation (Phases 2-4 roadmap)

**Guardian is production-ready for:**
1. ✅ All core routes (haldol, schedule, scripts, state, health-assessment)
2. ✅ Database persistence (PostgreSQL + Drizzle)
3. ✅ API contract (OpenAPI + codegen)
4. ✅ Three user views (/pops, /admin, /jessica)
5. ✅ AI integration (Gemini + LM Studio model switching)
6. ✅ Theme (Pastel caregiving colors)

**Next Step:** Extract high-value pieces (EncryptionUnlock, DEFAULT_TASKS) and integrate into Guardian. Use care-giver-os docs as implementation spec for Phases 2-4.
