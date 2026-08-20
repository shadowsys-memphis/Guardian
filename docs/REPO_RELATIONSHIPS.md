# REPO_RELATIONSHIPS.md
# Guardian System — Verified Architecture Boundaries
# Verified against live code: 2026-07-03

---

## The Four Systems

### 1. Guardian Core
The caregiving application. Public, multi-tenant, cloud-deployable.
This repo. Do not mix external runtime components into this layer.

```
Roles:     admin (caregiver) · patient
Frontend:  React 19 + Vite — /pops · /jessica · /admin · /smarthome · /intercom
Backend:   Express 5 + PostgreSQL + Drizzle ORM (pnpm monorepo)
Auth:      JWT sessions (SESSION_SECRET) · Vault PIN gate · Stripe tenant billing
Deployed:  Replit (NixOS) — no Docker, no Python venvs
```

**Jessica layer** — patient-facing voice companion powered by Gemini 2.5 Flash
or local LM Studio model (selected via `active_ai_model` in `app_settings`).
Streams via SSE: `POST /api/gemini/conversations/:id/messages`

**Evidence ledger** — `care_events` table is the factual record of all care activity.
Doctor reports read from `care_events` only. Never from AI memory or loose summaries.

**Tenant rule** — every `care_events` row requires a real `tenantId`.
`"local"` is a development convenience only, not a production tenant fallback.

**CORS** — exact-match allowlist (`allowedOrigins.includes(origin)`).
Never relax to `startsWith`. Allowed: `VITE_PUBLIC_SITE_URL`, `localhost:5173`, `localhost:3000`.

---

### 2. Guardian Hermes Adapter
Lives inside Guardian. An in-app TypeScript module, not an external agent.
Not the same as the OpenClaw "Hermes" research persona (see §3).

```
File:     artifacts/api-server/src/lib/hermes.ts
Exports:  dispatch(action, ctx: LedgerContext)
          dispatchAll(actions, ctx: LedgerContext)
```

**Two permanent responsibilities:**

1. **Immediate dispatch** — routes Jessica's `---ACTION---` blocks to the correct
   downstream subsystem (schedule, medications, devices, alerts, health logs).

2. **Evidence ledger** — writes every dispatched event to `care_events` with full
   audit context: `tenantId · source · actor · eventType · severity · confidence ·
   outcome · doctorRelevant · learningRelevant · adminIntervention`

**Action types (v1):**
`ADD_EVENT · ADD_TASK · TOGGLE_SMART_DEVICE · MED_CONFIRMED · MED_REFUSED · WELLBEING_ALERT`

**Called from:** `gemini.ts → parseActionBlocksRaw() → dispatchAll()`
Uses `Promise.allSettled` — one failed dispatch never blocks others.
Never throws — logs warnings on failure.

**Future scope (documented in hermes.ts header, not yet built):**
- Admin approvals/overrides → `adminIntervention=true` ledger entry
- Dual med capture (Jessica + admin)
- Chore/task/device event ledger entries
- Learning loop: care_events pattern analysis

---

### 3. OpenClaw / ClawX Runtime
External local agent runtime. **Not part of Guardian's deployable product.**
Lives on the developer's Mac. Calls Guardian APIs through skills.

```
ClawX:          Electron desktop GUI
OpenClaw:       Agent runtime — port 18789 — config: ~/.openclaw/
Primary model:  Claude Sonnet 4.6
Fallbacks:      Opus 4.7 · Gemini 2.0 Flash
Interface:      Telegram bot (dmPolicy: pairing)
LM Studio:      connects to port 1234 for local inference
```

**Guardian-facing skills** (`Guardian-06.28.26/openclaw-skills/`):
```
complete_task.js  →  POST /api/schedule/:id/complete
pops_status.js    →  GET  /api/haldol
                      GET  /api/schedule
```

**The "Hermes" naming overlap:**
The OpenClaw workspace (`~/.openclaw/workspace/REPO_RELATIONSHIPS.md`) describes a
"Hermes (Paperclip/Research Node)" — a research and synthesis agent persona.
This is **conceptually related but architecturally separate** from Guardian's Hermes Adapter.

| | Guardian Hermes Adapter | OpenClaw Hermes Persona |
|---|---|---|
| Location | `artifacts/api-server/src/lib/hermes.ts` | `~/.openclaw/workspace/` |
| Role | Dispatch care events + write evidence ledger | Research, data synthesis, artifact generation |
| Scope | Inside the Guardian API server | Inside the OpenClaw agent runtime |
| Tenancy | Requires `tenantId` on every ledger write | N/A — local only |

OpenClaw is a **consumer** of Guardian's public API.
It is not part of Guardian's codebase.
Integration is through skills that call Guardian REST endpoints.

---

### 4. LM Studio
Local model inference server. Port 1234. **Not available in cloud deployments.**

```
Used by:  Guardian gemini.ts  (when active_ai_model ≠ "gemini", reads LM_STUDIO_URL)
          OpenClaw runtime    (providers.lmstudio in openclaw.json)
```

**Models registered in Guardian** (`gemini.ts` lines 23–26):
```
gemini      →  Gemini 2.5 Flash       (cloud, default)
qwen35-9b   →  qwen3.5-9b    262K ctx  temp 0.0  general chat
gemma4-12b  →  gemma-4-12b   131K ctx  temp 0.2  coding / complex reasoning
gemma4-e4b  →  gemma-4-e4b   131K ctx  temp 0.2  coding / complex reasoning
```

**Model switching:** `PUT /api/ai-model` writes `active_ai_model` to `app_settings`.
Takes effect on the next Jessica call.
LM Studio must be running locally at `LM_STUDIO_URL` (default: `http://localhost:1234`).

---

## Connection Map

```
Patient (Pops) speaks
        ↓
  Jessica / Gemini SSE
  POST /api/gemini/conversations/:id/messages
        ↓ emits ---ACTION--- blocks
  Guardian Hermes Adapter  (hermes.ts)
        ↓ dispatch + evidence ledger
  care_events · schedule_tasks · health_data_points · call_sessions
        ↓
  Doctor Report  ← reads care_events only, never AI memory


  OpenClaw  (local Mac, port 18789)
        ↓ skills call Guardian REST API
  POST /api/schedule/:id/complete
  GET  /api/haldol
  GET  /api/schedule
        ↓
  Guardian PostgreSQL


  LM Studio  (local Mac, port 1234)
       ↑ used by both independently
  Guardian gemini.ts   (env: LM_STUDIO_URL)
  OpenClaw runtime     (openclaw.json providers.lmstudio)
```

---

## Imported Docs Classification

Docs from `Guardian-06.28.26/docs/` classified by which system they belong to.

### CORE_GUARDIAN — belongs in this repo's docs/
| File | What it is |
|---|---|
| `care-giver-os/PHONE_INTAKE_PROTOCOL.md` | MMS/voice pantry intake spec — shopper feature not yet built |
| `care-giver-os/GUARDIAN_OS_HANDOFF.md` | Phase 2–4 feature checklist (alarms, journal, call scheduler, cognitive warmup) |
| `care-giver-os/PHASE_1_SCHEMA_MAPPING.md` | `alarms · call_schedule · journal_entries` table designs — not yet in schema |
| `care-giver-os/INVENTORY_BASELINE.md` | Shopper budget rules, Pepsi rule, replenishment cycles |
| `CAREGIVER_OS_INTEGRATION_AUDIT.md` | Gap analysis — Phase 4 auth now done; unbuilt features still accurate |

### LM_STUDIO_SUPPORT — belongs in docs/local-runtime/
| File | What it is |
|---|---|
| `brain-guardian-no2/02_Registry/LM Studio Model Registry.md` | Model IDs matching Guardian gemini.ts lines 23–26 |
| `brain-guardian-no2/08_Decisions/Decision Log.md` | ADR-001: LM Studio as default local provider |
| `brain-guardian-no2/12_LM_Studio/LMSTUDIO.md` | AI assistant context file with domain glossary — partially superseded |

### LOCAL_RUNTIME_INTEGRATION — belongs in docs/local-runtime/
| File | What it is |
|---|---|
| `brain-guardian-no2/01_Runbooks/Daily Startup Check.md` | LM Studio + ClawX startup procedure |
| `brain-guardian-no2/01_Runbooks/Process Recovery Runbook.md` | ClawX crash recovery |
| `brain-guardian-no2/01_Runbooks/Safe Diagnostic Commands.md` | Port + config diagnostics |
| `brain-guardian-no2/01_Runbooks/Weekly Maintenance.md` | Log rotation, ESLint |
| `brain-guardian-no2/02_Registry/Port Registry.md` | All ports: OpenClaw 18789 · LM Studio 1234 · Vite 5173 |
| `brain-guardian-no2/03_Agents/Agent Roster.md` | OpenClaw main agent on Telegram |
| `brain-guardian-no2/13_Security_and_Boundaries/Do Not Touch.md` | `~/.openclaw/credentials/` protection |
| `brain-guardian-no2/System Map.md` | ClawX/OpenClaw architecture diagram |
| `RUNBOOKS.md` | Runbook index |
| `checkpoints/README.md` | Session checkpoint protocol |

### HISTORICAL_ONLY — archive, do not copy
| File | Why |
|---|---|
| `care-giver-os/AGENTS.md` | v3.0/SS_III Governor era — superseded |
| `brain-guardian-no2/06_Incidents/Incident Log.md` | Single ClawX EIO crash — no pattern |
| `LOCAL_BASELINE_2026-07-02.md` | Pre-swap repo snapshot — no longer load-bearing |
| `EXTERNAL_REFERENCES.md` | Paths reference `/Users/memphis/` — stale machine |
| `audits/CAREGIVER_OS_DISSECTION.md` | Superseded by Integration Audit |
| `checkpoints/2026-06-29_1630_tasks-1-9-11.md` | Single session log from old repo |

### DISCARD — do not copy
| File | Why |
|---|---|
| `care-giver-os/README.md` | AI Studio boilerplate |
| `brain-guardian-no2/07_Prompts/Prompt Library.md` | One line — no value |
