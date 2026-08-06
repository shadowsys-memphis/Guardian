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

```
/               → redirect to /pops
/pops           → PopsView (zero-touch display for Pops; auto-refreshes every 30s)
/jessica        → JessicaPhone (live Gemini call UI with SSE streaming)
/scripts        → JessicaView (terminal-style script manifest)
/admin          → AdminView (Raymo's dashboard — 7 tabs)
/admin/report   → DoctorReport
/smarthome      → SmartHomePanel
/intercom       → E2EE intercom (AES-GCM; ciphertext+iv+salt only in DB)
/my-subscription→ MySubscriptionPage (static "self-hosted, no billing" notice)
/guardian       → GuardianPage (stub — outside VaultGate)
/guardian/success → GuardianSuccessPage (stub — outside VaultGate)
```

Routes under `AppContent` (inside `VaultProvider`) require vault unlock. `/guardian` and `/guardian/success` are outside the vault. They were the public sign-up/checkout funnel; since billing was removed they are inert stubs that make no API calls, but they still have their own Vite HTML entries and SSR prerender step (`vite.config.ts`) — that build cost is now unearned, so collapsing them into the main SPA is a safe cleanup if anyone wants it.

### Key Invariants

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
