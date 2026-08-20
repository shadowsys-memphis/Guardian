# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> A more detailed reference (DB schema, all 54 API operationIds, Jessica AI architecture, Hermes dispatch layer) lives in `.claude/CLAUDE.md`. Read both files when working on new features.

---

## Dev Commands

```bash
# Typecheck everything (always run from root)
pnpm run typecheck

# Run codegen after editing lib/api-spec/openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes to PostgreSQL
pnpm --filter @workspace/db run push

# Seed initial data
pnpm --filter @workspace/scripts run seed

# Start API server (build + run)
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/brain-app run dev
```

Codegen must run before typecheck whenever `openapi.yaml` changes — stale generated files will cause type errors. See `.claude/CLAUDE.md` → "Orval → tsc rebuild sequence".

---

## Architecture Overview

### Monorepo Layout

```
/
├── artifacts/
│   ├── api-server/       # Express 5 API (src/routes/, src/lib/, src/middlewares/)
│   └── brain-app/        # React 19 + Vite 7 frontend
├── lib/
│   ├── api-spec/         # openapi.yaml — single source of truth for all API types
│   ├── api-client-react/ # GENERATED — React Query hooks (never hand-edit)
│   ├── api-zod/          # GENERATED — Zod schemas (never hand-edit)
│   ├── db/               # Drizzle ORM schema + PostgreSQL connection
│   └── integrations-gemini-ai/  # Gemini SDK wrapper (exports: ai, batchProcessWithSSE)
└── scripts/              # seed.ts
```

Package names: `@workspace/<dir-name>` (e.g. `@workspace/db`, `@workspace/api-client-react`).

### Auth & Multi-Tenancy

All API routes (except `/healthz`, `/tenants/auth`, `/tenants/setup`, `/jessica/elevenlabs-webhook`) require a JWT in `Authorization: Bearer <token>`.

Two session types, both signed with `SESSION_SECRET`:
- **`type: "local"`** — Ray's personal workspace (`sub: "local"`). Issued via `POST /tenants/auth` when `VAULT_PASSPHRASE` matches.
- **`type: "tenant"`** — additional tenant workspace (`sub: <uuid>`). Issued via `POST /tenants/auth` once a tenant row has a passphrase set through `POST /tenants/setup`.

There is **no billing or payment layer.** Stripe checkout, the `/billing/*` routes, and the subscription flow were removed — do not re-add references to them, and don't assume a tenant row implies a paid subscription. Tenant rows are provisioned directly.

Route middleware split in `artifacts/api-server/src/routes/index.ts`:
- `requireAnySession` — local **or** tenant sessions (core workspace routes: state, schedule, symptoms, Gemini, etc.)
- `requireLocalSession` — local only (care-specific routes not yet multi-tenant: scripts, haldol, smarthome, health-assessment, shopper)

**Tenant scoping rule**: Routes under `requireAnySession` must derive `tenant_id` from `req.tenantSession.sub` — never from client-supplied fields.

### Frontend Route Map

Verified against `App.tsx` on 2026-08-06 — this is the complete list:

```
/               → redirect to /pops
/pops           → PopsView (zero-touch display for Pops; auto-refreshes every 30s)
/jessica        → JessicaPhone (live Gemini call UI with SSE streaming)
/calls          → CallsView (call session history + transcripts)
/shopper        → ShopperView (meals / grocery carts)
/admin          → AdminView (Raymo's dashboard — tabbed)
/admin/report   → DoctorReport
/scripts        → JessicaView (terminal-style script manifest)
/my-subscription→ MySubscriptionPage (static "self-hosted, no billing" notice)
/settings       → SettingsView
/guardian       → GuardianPage (stub — outside VaultGate)
/guardian/success → GuardianSuccessPage (stub — outside VaultGate)
```

**Removed features — do not reintroduce.** `/smarthome` and `/intercom` were previously listed here but no longer exist on the frontend. The E2EE intercom and the client-side `crypto.ts` were deleted in `61c5421` ("Remove encryption and vault features"), the smart-home page in `62f16ac`, and the governor routes in `98a0acd`. (The stale `Knowledgebase/` pre-removal snapshot that used to shadow these was deleted in the 2026-08-20 repo sweep — it lives only in git history now.) The api-server *does* still register `smarthomeRouter` under the local-only tier, so those endpoints exist with no UI in front of them.

Routes under `AppContent` (inside `VaultProvider`) require vault unlock. `/guardian` and `/guardian/success` are outside the vault. They were the public sign-up/checkout funnel; since billing was removed they are inert stubs that make no API calls, but they still have their own Vite HTML entries and SSR prerender step (`vite.config.ts`) — that build cost is now unearned, so collapsing them into the main SPA is a safe cleanup if anyone wants it.

### Key Invariants

- **Quarter boundaries are Ray's, not clock-even** (since 2026-08-14): Q1 6–10, Q2 10–14, Q3 14–18, Q4 18–6. Defined identically in `lib/jessica-tools.ts` (`quarterForHour`), `routes/state.ts` (`computeCurrentQuarter`), and `lib/call-scheduler.ts` (`computeQuarterForHour`) — change all three together.
- **Task tiers & escalation ladder** live in `artifacts/api-server/src/lib/task-tiers.ts`; day-type resolution in `lib/day-type.ts`. `schedule_tasks` carries `tier`/`status`/`completion_source` — `isCompleted` is a legacy mirror of `status === "done"`, always write both.
- **`rotation_tasks` is deliberately NOT tier-governed** — this is a decision, not an oversight. The tier/ladder system answers "how hard does Jessica push, and how fast does Ray hear about it"; Jessica never calls on rotation tasks (Ray checks them off on the dashboard), so tier and `completion_source` would drive nothing there. The scheduler's only contact with the table is the nightly reset job in `call-scheduler.ts` (`status → pending`, `completedAt → null`). **Trap:** `rotation_tasks.status` uses an overlapping-but-different vocabulary from the tier system's `pending | done | refused | no_answer | missed` — both have `pending`, and they are *not* the same enum. Don't write shared code across the two tables assuming they are.
- **The automated daily call stays OFF** until Ray's admin-number dry-run passes and he explicitly enables it — never flip `dailyCallEnabled` on your own (see STATUS.md).
- **`import { z } from "zod/v4"`** everywhere — not `"zod"`. `drizzle-zod` requires the `/v4` subpath.
- **Haldol cycle day**: `(diffDays % intervalDays) + 1` — no `Math.min/max` clamping. The interval is prescriber-set in `haldol_cycle.interval_days` (monthly, 28, per Dr Uddin 2026-07-28); all cycle math goes through `lib/haldol-cycle.ts` (`computeHaldolCycle`) — never recompute locally or hardcode an interval.
- **`/scripts/active` must be registered before `/:id`** in the Express router or "active" gets matched as an ID.
- **Gemini SSE route** (`sendGeminiMessage`) returns `text/event-stream` — don't add JSON content-type expectations.
- **CORS is exact-match** — do not relax to `startsWith`. Allowed origins: `VITE_PUBLIC_SITE_URL`, `localhost:5173`, `localhost:3000`.

### Required Environment Variables

| Variable | Required by |
|---|---|
| `PORT` | API server startup |
| `SESSION_SECRET` | `tenant-auth.ts` — throws at startup if unset |
| `VAULT_PASSPHRASE` | Ray's local login (optional if using tenant auth only) |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini wrapper (Replit-injected) |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini wrapper (Replit-injected) |
| `ELEVENLABS_API_KEY` | Outbound calls to Pops (`routes/jessica.ts`) |
| `ELEVENLABS_AGENT_ID` | Outbound calls to Pops |
| `ELEVENLABS_PHONE_NUMBER_ID` | Outbound calls to Pops |
| `VITE_PUBLIC_SITE_URL` | CORS allowlist |

No `STRIPE_*` variables are used anywhere — billing was removed.
