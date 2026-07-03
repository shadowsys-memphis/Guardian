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

All API routes (except `/healthz`, `/tenants/auth`, `/billing/checkout`, `/billing/webhook`) require a JWT in `Authorization: Bearer <token>`.

Two session types, both signed with `SESSION_SECRET`:
- **`type: "local"`** — Ray's personal workspace (`sub: "local"`). Issued via `POST /tenants/auth` when `VAULT_PASSPHRASE` matches.
- **`type: "tenant"`** — paying subscriber (`sub: <uuid>`). Issued after Stripe checkout completes.

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
/my-subscription→ MySubscriptionPage
/guardian       → GuardianPage (public sign-up/Stripe checkout — outside VaultGate)
/guardian/success → GuardianSuccessPage
```

Routes under `AppContent` (inside `VaultProvider`) require vault unlock. `/guardian` and `/guardian/success` are outside the vault — intentionally public for subscriber onboarding.

### Key Invariants

- **`import { z } from "zod/v4"`** everywhere — not `"zod"`. `drizzle-zod` requires the `/v4` subpath.
- **Haldol cycle day**: `(diffDays % 14) + 1` — no `Math.min/max` clamping. Both `haldol.ts` and `gemini.ts` must use this formula.
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
| `STRIPE_SECRET_KEY` | Billing routes |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `STRIPE_FAMILY_PRICE_ID` | Checkout |
| `STRIPE_MULTI_CARE_PRICE_ID` | Checkout |
| `STRIPE_CHECKOUT_SUCCESS_URL` | Checkout redirect |
| `STRIPE_CHECKOUT_CANCEL_URL` | Checkout redirect |
| `STRIPE_CUSTOMER_PORTAL_RETURN_URL` | Customer portal |
| `VITE_PUBLIC_SITE_URL` | CORS allowlist |
