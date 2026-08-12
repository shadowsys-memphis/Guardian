---
name: Brain Guardian tenant auth + data isolation
description: Multi-tenant auth pattern, three-tier route split, tenant_id scoping, session lifecycle, and lessons from real cross-tenant leaks.
---

# Brain Guardian Tenant Auth & Data Isolation

## Rule — Three-tier route auth
Routes split into three tiers: PUBLIC (no auth), CORE (any valid session — local or tenant — but every route in this tier must either derive tenant_id from the session and touch only tenant-scoped tables, or be a metered/paid call with a real usage quota), and LOCAL-ONLY (the owner's own session only — anything not yet tenant-scoped, and any metered/paid call with no quota).

**Why:** Paying tenants (and any public demo) need the core workspace to work end-to-end; everything else must fail closed with a 403 rather than silently touching data or budget it shouldn't.

## Rule — re-audit every route in a tier whenever that tier gets easier to reach
Don't trust an inline comment claiming a route is "no DB" or "tenant-scoped" — comments describe the code's state when written and silently rot. Whenever a tier becomes reachable in a new, lower-friction way (e.g. adding a public no-passphrase login), re-read the actual query code of every route already mounted there before trusting its existing tier assignment.
This exact gap produced two real incidents in one task: (1) a core-tier route family read/wrote several completely unscoped tables, letting any tenant/demo session read or delete another workspace's real data; (2) other core-tier routes made unmetered, billed AI calls, so a freely-obtainable session had unlimited access to a paid API with no usage cap — issuing tokens behind a rate limit does not bound how much a single already-issued token can be used afterward. Both had to move to the local-only tier.

**Why:** A new easy entry point to a tier changes that tier's risk profile even though none of its existing code changed — recheck data scoping AND cost/abuse exposure, not just auth presence.

## Rule — a shared React Query client must be cleared on every session change
If session-switching shares one query client/cache and query keys don't encode tenant identity, switching sessions in the same browser tab can flash the previous session's cached data before the new fetch resolves. Clear the client whenever the session token changes (both establishing and clearing a session), not just on mount.

## Rule — auditing "restricted" gating must cover embedded actions, not just top-level tabs/routes
A kept/allowed tab can still contain a per-row or per-item action (a button, an upload control, a voice/text input) that calls a restricted route directly. Check every kept component's own fetch/mutation call sites against the tier split, not just its top-level data-loading hooks and the page-level nav/route list.

## Rule — model a public "try it live" workspace as an ordinary seeded session, not a new session kind
A no-passphrase demo workspace should be one ordinary row in the existing tenant-equivalent table (no password, always active), seeded via the existing idempotent seed/migration path, issued through the existing session-issuing mechanism (same token shape, same tier auth). Don't invent a new session type or new middleware. It inherits every existing isolation guarantee for free — but see the re-audit rule above, since making a tier freely reachable is precisely what exposes any latent gaps in it.

## Rule — tenant_id scoping on DB queries
Tenant-scoped tables carry a `tenant_id` column defaulting to the local workspace's fixed id. Every query must derive tenant_id from the verified session only, never from client-supplied input.

**Why:** Prevents cross-tenant data access; pre-existing single-tenant rows keep working via the column default.

## Rule — Setup token lifecycle
A one-time setup token is minted server-side on a billing webhook, handed to the client exactly once by a dedicated retrieval endpoint (which clears it after first read), and redeemed by comparing a hash — never re-issued on repeat calls.

**Why:** Prevents an endpoint from generating unlimited valid tokens on repeated calls.

## Rule — Migration must guard for tables that may not exist yet
Wrap `ALTER TABLE` (and similar DDL on possibly-absent tables) in an existence check, since fresh or partially-migrated databases may not have created that table yet.

## Legacy fallback
If the local-access secret is unset AND no tenants are active, login accepts any sufficiently long passphrase (backward compat). Disables automatically once the secret is set.

## Principle — exchange secrets for tokens server-side, never through agent-visible text
When verifying an auth-gated flow requires a real secret, exchange it for a session token via a sandboxed function that reads the secret from the environment directly — never by routing the raw secret through chat or tool-call text. Use the resulting token for subsequent requests.

**Why:** Lets the agent verify authenticated backend behavior end-to-end without ever displaying or handling the secret itself.
