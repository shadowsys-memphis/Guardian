# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Mission

The **br(AI)n App** is a unified AI caregiver system, originally built for a Veteran named **Pops** (PTSD, Schizophrenia, Auditory Hallucinations) and his caregiver **Raymo**. **Jessica** is the AI companion (Gemini-powered) who calls Pops daily, checks on his health, and routes data to Raymo's admin dashboard.

The product is now dual-mode: Raymo's original personal deployment ("local" session) plus **Brain Guardian**, a multi-tenant SaaS version sold to other caregivers via Stripe subscription (`/guardian` marketing site + tenant signup/login).

---

## Commands

```bash
pnpm run typecheck                              # typecheck all packages (ALWAYS run from repo root)
pnpm run typecheck:libs                         # tsc --build for lib/db, lib/api-client-react, lib/api-zod only
pnpm run build                                  # typecheck + build every package that has a build script
pnpm --filter @workspace/api-spec run codegen   # regenerate API client + Zod schemas from openapi.yaml
pnpm --filter @workspace/db run push            # push Drizzle schema to PostgreSQL (see gotcha below — often hangs)
pnpm --filter @workspace/scripts run seed       # seed initial schedule/scripts/haldol data
pnpm --filter @workspace/api-server run dev     # build + start the API server
pnpm --filter @workspace/brain-app run dev      # Vite dev server (frontend), --host 0.0.0.0
```

There is no test framework configured in this repo (no vitest/jest config, no `*.test.*` files). Don't assume one exists — verify changes via `pnpm run typecheck` and manual exercising of the route/page.

Single-package typecheck (only when debugging in isolation — cross-package type errors require the root command):
```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/brain-app run typecheck
```

---

## Monorepo Layout

```
/
├── artifacts/
│   ├── api-server/          # Express 5 API — src/routes/, src/middlewares/, src/index.ts
│   ├── brain-app/           # React + Vite frontend — src/pages/, src/lib/, multi-entry build
│   └── mockup-sandbox/      # standalone Vite/Radix sandbox for UI mockups, not wired to the API
├── lib/
│   ├── api-spec/             # openapi.yaml + orval.config.ts (source of truth for API types)
│   ├── api-client-react/     # GENERATED — React Query hooks (do not hand-edit)
│   ├── api-zod/               # GENERATED — Zod schemas from OpenAPI (do not hand-edit)
│   ├── db/                    # Drizzle ORM schema + PostgreSQL connection (exports `pool` too)
│   ├── integrations/gemini_ai_integrations/
│   └── integrations-gemini-ai/  # Replit-managed Gemini SDK wrapper (exports ai, generateImage, batchProcess...)
├── scripts/                  # seed.ts — run with pnpm --filter @workspace/scripts run seed
├── .agents/memory/           # cross-session agent notes (architecture decisions, migration gotchas)
├── pnpm-workspace.yaml
├── tsconfig.json              # root — composite project references: lib/db, lib/api-client-react, lib/api-zod
└── tsconfig.base.json          # shared compiler options (strict, ES2022, bundler) — no composite/emitDeclarationOnly here
```

**Package names** follow `@workspace/<dir-name>` (e.g. `@workspace/db`, `@workspace/api-server`).

`.agents/memory/*.md` holds prior-session architecture notes (E2EE vault, tenant auth, LM Studio integration, DB migration workaround) — worth reading before touching those areas; treat it as historical context, not a spec, and verify against current source since it can drift.

---

## Multi-Tenant Auth — Three-Tier Route Split

`artifacts/api-server/src/routes/index.ts` splits every route into three explicit tiers via `middlewares/tenant-auth.ts`:

1. **PUBLIC** (no auth): `health`, `tenants` (`/tenants/auth`, `/tenants/setup`), `billing` public endpoints (`/billing/checkout`, `/billing/webhook`, `/billing/checkout-session`).
2. **CORE WORKSPACE** (`requireAnySession` — local session OR tenant JWT; there is no separate subscription-gating middleware currently wired in): `state`, `schedule`, `symptoms`, `inventory` (tenant-scoped DB queries), `admin`/`workspace`/`intake`/`gemini` (AI proxies, no direct DB queries).
3. **LOCAL-ONLY** (`requireLocalSession` — `session.type === "local"` only): `scripts`, `haldol`, `smarthome`, `health-assessment`, `shopper`, `rotation`, `appointments`, `reports`, `actions`, `medications`, `auth` — Ray's specialty care tools that aren't yet tenant-scoped.

Sessions are JWTs signed with `SESSION_SECRET`, verified (async) in `extractSession()`. `session.type` is `"local"` (Ray) or `"tenant"` (paying subscriber, `session.sub` = tenant UUID). Tokens carry a `sessionVersion` claim checked against a live DB value on every request (`tenants.session_version` for tenant sessions, `app_settings['local_session_version']` for local) — bumping that counter revokes every outstanding token of that type immediately, without waiting for the 24h JWT expiry. Revoke via `POST /tenants/:id/revoke-sessions` (local-only, per-tenant) or `POST /auth/revoke-sessions` (local session, "sign out everywhere"); changing the local passphrase (`POST /auth/change-passphrase`) also bumps the local version automatically.

**tenant_id scoping rule**: `app_state`, `schedule_tasks`, `symptom_logs`, `inventory_items` each carry a `tenant_id TEXT NOT NULL DEFAULT 'local'` column. Every query on these tables must derive `tenant_id` from `req.tenantSession` (`"local"` for local sessions, `session.sub` for tenant sessions) — **never from client-supplied headers/body**, or tenants can read/write each other's data.

**Setup token lifecycle** (Stripe → account activation): webhook (`checkout.session.completed`) generates a raw token, stores `sha256(rawToken)` as `setup_token_hash` and the raw token as `setup_token_pending`; `GET /billing/checkout-session` retrieves `setup_token_pending` **once** and clears it (never re-generates); `POST /tenants/setup` confirms `sha256(submitted) === setup_token_hash`. This prevents replay from minting unlimited valid setup tokens.

**Legacy local-passphrase fallback**: if `VAULT_PASSPHRASE` is unset AND no tenant rows exist, any 4+ char passphrase is accepted for the local vault. This disables itself automatically once `VAULT_PASSPHRASE` is set or a tenant is created — don't rely on it in new code.

**Brute-force protection**: `POST /tenants/auth` and `POST /auth/change-passphrase` are rate-limited via `middlewares/rate-limit.ts` (`loginRateLimit` — in-memory sliding window, 10 attempts/15min per IP, single-process only). Apply the same middleware to any new passphrase-guessing surface.

---

## Vault Gate (frontend)

**All brain-app routes are gated behind a PIN-based vault.** `VaultProvider` (`@/lib/vault-context`) wraps the entire app in `App.tsx`; if `isUnlocked === false`, only `<VaultGate>` (`@/pages/vault-gate`) renders. AES-256-GCM key is derived client-side via PBKDF2 (100k iterations, Web Crypto API); salt lives in `localStorage`, the derived key lives only in React context (never persisted). Do **not** remove this gate or bypass `useVault().isUnlocked` for convenience — this is separate from and layered on top of the server-side JWT session auth described above.

---

## Brain Guardian Marketing Site (`/guardian`)

`/guardian` and `/guardian/success` are public SEO-facing landing pages, **not** behind the vault gate, and built as a **separate lightweight Vite entry point** from the main SPA to avoid bloating the marketing page's bundle with authed-app code:

- Entry: `src/guardian-main.tsx` (vs. the main app's entry for the vault-gated SPA)
- HTML shells: `guardian.html`, `guardian-success.html` at the `brain-app` package root, wired as `rollupOptions.input` in `vite.config.ts`
- SSR prerender: `src/entry-server-guardian.tsx` renders the page to a string via `react-dom/server`; `scripts/prerender-guardian.mjs` runs post-build, injects that markup into `dist/public/guardian.html`'s `<div id="root">` so crawlers get real HTML instead of an empty shell. The build script (`vite build --ssr src/entry-server-guardian.tsx ... && node scripts/prerender-guardian.mjs`) fails loudly if the rendered markup is suspiciously short or the injection point isn't found — don't silently swallow that.

If you touch guardian marketing content, keep the client component (`pages/guardian.tsx`) and the SSR entry in sync — the prerender step re-renders the same component tree, it doesn't share runtime state with the client bundle.

---

## Database Gotchas

1. **`drizzle-kit push` hangs in this environment.** It prompts an interactive arrow-key menu ("create new" vs "renamed from") that can't be answered via piped stdin. When adding a new `pgTable()`, prefer running the raw `CREATE TABLE` SQL directly against `DATABASE_URL` with `pg`'s `Pool` (see `@workspace/db`'s exported `pool`) instead of `pnpm --filter @workspace/db run push`.
2. **Migrations touching tables that may not exist on fresh DBs** (`app_state`, `schedule_tasks`, `symptom_logs`, any lazily-created table) must wrap `ALTER TABLE` in a `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '...') THEN ... END IF; END $$;` block, or the migration fails outright on a DB where that table hasn't been created yet.
3. **Not every table lives in `lib/db/src/schema/index.ts`.** `tenants` (and some other tenant/billing tables) were created via raw SQL per gotcha #1 and are queried with raw `pool.query(...)` in the relevant routes (e.g. `routes/tenants.ts`), not through Drizzle's query builder. Grep the routes directory for `FROM <table>` before assuming a table has a Drizzle definition.
4. Zod import path is **inconsistent across the api-server routes** — some files use `from "zod"`, others `from "zod/v4"` (mixed as the codebase evolved). Match whatever the file you're editing already uses; don't "fix" it to the other form as a drive-by change. `@workspace/db`'s `drizzle-zod` usage and the generated `@workspace/api-zod` package are the parts that actually require the `/v4` subpath.

---

## Database Schema (partial — grep `lib/db/src/schema/index.ts` for the full/current list, it changes often)

Core original tables: `app_state`, `schedule_tasks`, `symptom_logs`, `voice_scripts`, `haldol_cycle`, `conversations`/`messages` (Gemini chat), `smart_home_devices`, `health_questions`, `call_sessions`, `health_data_points`, `app_settings`, `meals`/`meal_ingredients`/`grocery_carts`/`cart_meals`/`cart_items`/`meal_cravings` (shopper), `rotation_tasks`, `historical_care_logs`, `inventory_items`, `medical_appointments`, `medication_adjustments`, `medications`, `cart_fulfillments`, `action_logs`.

Tenant/billing tables (`tenants` and related) are **not** in this file — see gotcha #3 above.

`app_state`, `schedule_tasks`, `symptom_logs`, `inventory_items` carry `tenant_id` (see tenant scoping rule above); the rest are currently local-only / ungoverned by tenant scoping.

---

## Jessica AI Phone Gateway

Jessica is a Gemini-powered AI companion (`artifacts/api-server/src/routes/gemini.ts`, system prompt in `buildJessicaSystemPrompt()`; uses `@workspace/integrations-gemini-ai`'s `ai` client — `@google/genai` must stay a **direct** dependency of `api-server`, since it's externalized from the esbuild bundle and needs a runtime link, see `build.mjs`).

Call lifecycle:
1. `POST /gemini/conversations` → creates a `conversations` row and auto-creates a linked `call_sessions` row in the same handler.
2. `POST /gemini/conversations/:id/messages` → streams the Gemini response as SSE (`text/event-stream`; consume with `fetch` + `ReadableStream` on the client, not a JSON-expecting React Query hook).
3. Jessica's system prompt emits invisible XML tags parsed server-side: `<health_data>{...}</health_data>` → `health_data_points`, `<device_command>{...}</device_command>` → smart home commands, `<craving>{...}</craving>` → meal craving capture.
4. `POST /gemini/conversations/:id/end` closes the session and computes a summary. Anomaly detection: a category flagged in 3+ of the last 5 sessions → `sustainedAnomalies`.

`/health-assessment/sessions` endpoints exist as a standalone admin API, but the `/jessica` phone UI drives the whole call lifecycle through `/gemini/conversations`.

---

## Codegen Workflow — Orval

Source of truth for all API types: `lib/api-spec/openapi.yaml`. **Never hand-edit** `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` — fully regenerated each run.

```bash
# 1. Edit openapi.yaml
# 2. Regenerate hooks + Zod schemas
pnpm --filter @workspace/api-spec run codegen
# 3. Rebuild declaration files so brain-app's TS compiler sees new hooks
cd lib/api-client-react && npx tsc -p tsconfig.json && cd -
# 4. Rebuild TypeScript project references
pnpm run typecheck
```
Step 3 is easy to skip and causes "hook doesn't exist" errors in `brain-app` even though codegen succeeded — the generated `.ts` files exist but their `.d.ts` output in `dist/` is stale.

Orval config: `lib/api-spec/orval.config.ts` — `api-client-react` target → react-query split mode, `zod` target → zod client split mode. Custom fetch mutator: `lib/api-client-react/src/custom-fetch.ts`.

---

## TypeScript Composite Project Rules

- Every package extends `tsconfig.base.json`; `composite: true` / `emitDeclarationOnly: true` are set per-package, not in the base.
- Root `tsconfig.json` only lists project references for the generated/consumer packages: `lib/db`, `lib/api-client-react`, `lib/api-zod`.
- **Always typecheck from root** (`pnpm run typecheck`) — never run `tsc` in a sub-package alone when debugging cross-package type errors; declarations from upstream packages may be stale.

---

## esbuild Bundling Gotcha (api-server)

`build.mjs` bundles `api-server` to a single ESM file via esbuild, with a long `external` allowlist for native/unbundleable packages (sharp, bcrypt, `@google/*`, etc. — see the file for the full list) plus a banner that shims `require`/`__filename`/`__dirname` for CJS deps pulled into the ESM bundle. If you add a dependency that uses native bindings, dynamic `require`, or path-traversal-based asset loading (proto files, native `.node` addons), add it to `external` in `build.mjs` rather than letting esbuild silently mis-bundle it.

---

## Critical Gotchas (quick reference)

1. **Vault gate** (frontend) — never bypass `useVault().isUnlocked`; separate from the JWT session auth on the API.
2. **Three-tier route auth** (backend) — new routes must be placed in PUBLIC / CORE WORKSPACE / LOCAL-ONLY in `routes/index.ts` deliberately; core-workspace routes touching new tables need `tenant_id` scoping from day one.
3. **`drizzle-kit push` hangs** — use raw SQL via `pool` instead (see DB Gotchas above).
4. **Orval → tsc rebuild sequence** — codegen, then rebuild `api-client-react` declarations, then root typecheck.
5. **Intercom E2EE** — `intercom_messages`-style storage is ciphertext/iv/salt only; decryption is entirely client-side, never add server-side decryption.
6. **Quarter system** — `currentQuarter` in `app_state` is the *effective* quarter (override if set, else wall-clock); `computedQuarter` is always the wall-clock value. Both returned by `getAppState`.
7. **Haldol cycle days 1–5** — `isZombiePhase` computed from `lastInjectionDate`; Jessica's tone shifts to "soft/brief/low-pressure" automatically via the system prompt.
8. **`/scripts/active` before `/scripts/:id`** — Express route registration order matters; the literal path must come first.
9. **SSE for Gemini messages** — `sendGeminiMessage` is `text/event-stream`, not JSON.
10. **No virtual envs, no Docker** — runs on Replit NixOS; `pnpm` only.

---

## Preferred Patterns

### Adding a new API endpoint
1. Add path + operationId to `lib/api-spec/openapi.yaml`.
2. Add handler in `artifacts/api-server/src/routes/<domain>.ts`.
3. Register the router in `routes/index.ts` under the correct tier (PUBLIC / CORE WORKSPACE / LOCAL-ONLY) — see Multi-Tenant Auth above.
4. `pnpm --filter @workspace/api-spec run codegen`, then rebuild `api-client-react` declarations, then `pnpm run typecheck`.

### Adding a new DB table
1. Add the table definition to `lib/db/src/schema/index.ts` (export insert schema + types from the same file) — unless it's a tenant/billing table following the raw-SQL pattern (see DB Gotchas #3).
2. Push it via raw SQL through `pool` (DB Gotchas #1), not `drizzle-kit push`.
3. If it needs tenant isolation, add `tenant_id TEXT NOT NULL DEFAULT 'local'` and scope all queries from `req.tenantSession`.

### Adding a new frontend page
1. Create `artifacts/brain-app/src/pages/<page>.tsx`.
2. Add a `<Route>` in `App.tsx` inside `AppContent` (within `VaultProvider` scope) — unless it's a public marketing page like `/guardian`, which uses its own Vite entry instead.
3. Optionally add to `NAV_ITEMS` for the bottom nav.

### Using the Gemini integration
```typescript
import { ai } from "@workspace/integrations-gemini-ai";
// ai is a pre-configured Gemini client (Replit-managed)
// Requires two platform-injected env vars (Replit integration panel):
//   AI_INTEGRATIONS_GEMINI_API_KEY, AI_INTEGRATIONS_GEMINI_BASE_URL
// Do not reference these vars directly in app code — the wrapper handles them.
```
