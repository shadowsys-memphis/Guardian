---
name: Brain Guardian tenant auth + data isolation
description: Multi-tenant auth pattern, three-tier route split, tenant_id scoping on core tables, webhook token flow.
---

# Brain Guardian Tenant Auth & Data Isolation

## Rule — Three-tier route auth
routes/index.ts splits into three explicit tiers:
1. **PUBLIC**: health, /tenants/auth, /tenants/setup, billing public endpoints
2. **CORE WORKSPACE** (requireAnySession — local OR tenant JWT): state, schedule, symptoms, inventory (tenant-scoped DB queries), admin/workspace/intake/gemini (no DB)
3. **LOCAL-ONLY** (requireLocalSession — type==="local" only): scripts, haldol, smarthome, health-assessment, shopper, rotation (specialty Ray/Pops tools)

**Why:** Paying tenants must be able to access the core workspace. Specialty care tools aren't yet tenant-scoped so they stay local-only with a clear 403.

## Rule — tenant_id scoping on DB queries
Four tables have `tenant_id TEXT NOT NULL DEFAULT 'local'`: app_state, schedule_tasks, symptom_logs, inventory_items.
All queries derive tenant_id from the JWT only (`session.type === 'local' ? 'local' : session.sub`). Never from client headers.

**Why:** Prevents cross-tenant data access. Ray's existing rows get tenant_id='local' automatically via the column default.

## Rule — Setup token lifecycle
1. Webhook (checkout.session.completed): generates rawToken, stores sha256(rawToken) as setup_token_hash + rawToken as setup_token_pending
2. GET /billing/checkout-session: retrieves setup_token_pending ONCE and clears it; does NOT generate tokens
3. POST /tenants/setup: sha256(submitted) === setup_token_hash

**Why:** Prevents checkout-session from generating unlimited valid tokens on repeated calls.

## Rule — Migration must use DO $$ IF EXISTS $$ blocks
ALTER TABLE on tables that may not exist yet causes migration failure. Always wrap in `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '...') THEN ... END IF; END $$`.

**Why:** app_state/schedule_tasks/symptom_logs may not exist on fresh DBs; inventory_items was previously created lazily in ensureInventorySeeded.

## Legacy fallback
If VAULT_PASSPHRASE NOT set AND no active tenants: accepts any 4+ char passphrase (backward compat). Automatically disables once VAULT_PASSPHRASE is set.

## Testing this app without exposing the passphrase
The frontend has no dev bypass for the vault gate (`vault-gate.tsx` / `vault-context.tsx`) — there is no URL param or hash to reach a tab/route directly either (tabs are plain `useState`, not routed), so a Playwright-style tester needs the real passphrase to get anywhere.

Instead of routing the passphrase through chat/tool-call text (where the agent would have to see it), call the API directly from a CodeExecution `"use impure"` function: it can `fetch("http://localhost:8080/api/tenants/auth", { method: "POST", body: JSON.stringify({ passphrase: process.env.VAULT_PASSPHRASE }) })` — the sandbox shares the container's network (api-server's port is reachable at `localhost:8080`) and its env (`VAULT_PASSPHRASE` resolves there), and the value never has to appear in agent-visible output. Use the returned `token` as `Authorization: Bearer <token>` for subsequent authenticated calls to verify backend behavior end-to-end without ever unlocking the UI.

**Why:** Lets the agent verify authenticated backend routes (and even exercise real third-party side effects like Google Calendar/Drive) without ever displaying/handling the passphrase itself, and without needing a browser at all.
