# Brain Guardian OS — Public-Client Onboarding Flow

**Status:** Approved specification — documentation/harness lock only. Do not implement UI or modify backend/schema/Hermes until explicitly scoped.

---

## Purpose

- Lock the public/multi-tenant setup path before any implementation begins.
- Prevent personal names or single-tenant assumptions from leaking into schema, routes, seeds, prompts, or harness files.
- Define the client-side onboarding sequence so all agents (Claude, Cursor, Gemini, Codex) follow the same flow.
- Keep the flow progressive and minimal — get the tenant to the dashboard with as little friction as possible.

---

## Approved V1 Flow

```
1. Tenant / household creation
        ↓
2. Admin setup
        ↓
3. Patient profile
        ↓
4. Optional caregiver invite
        ↓
5. Care settings
        ↓
6. Dashboard handoff  →  /admin
```

Each step is a discrete screen. Steps 4 and 5 are skippable. Do not surface all fields at once.

---

## Step Definitions

| Step | What happens | Data written |
|---|---|---|
| 1. Tenant / household creation | Tenant row created; `tenant_id` issued | `tenants` — id, name, plan, `provisioned_at`, `onboarding_complete: false` |
| 2. Admin setup | Caregiver account created; onboarding JWT issued | `users` — email, hashed passphrase, role: admin, `tenant_id` |
| 3. Patient profile | Care recipient details entered | Tenant profile data only — name, care context, never schema defaults |
| 4. Optional caregiver invite | Secondary admin/caregiver invited by email | `invites` — email, role: caregiver, `tenant_id`, expiry |
| 5. Care settings | Medication cycle, quarter schedule, AI companion preferences | `haldol_cycle`, `app_settings`, `schedule_tasks` seeded to tenant scope |
| 6. Dashboard handoff | Full tenant session issued; `onboarding_complete: true` | Session JWT replaces onboarding JWT; redirect to `/admin` |

---

## Rules — All Agents Must Follow

- **Generalized roles only:** `admin`, `caregiver`, `patient`. Never hardcode personal names in schema, routes, seeds, or prompts.
- **`tenant_id` scoping:** Created at step 1, written to every subsequent row. No row in a tenant-scoped table is ever written without it.
- **No `"local"` fallback:** `"local"` is a legacy single-tenant shortcut. It must never appear as a `tenant_id` value in the onboarding flow or any tenant-scoped route.
- **Public routes until step 6:** All onboarding routes are outside `VaultGate`. The full tenant session is issued only at step 6 — not before.
- **Onboarding JWT pattern:** A short-lived signed JWT (claim `type: "onboarding"`, payload `{ tenant_id, step }`) is issued at step 1 and validated server-side on each subsequent step. `SESSION_SECRET` signs it — no new auth mechanism. At step 6 it is replaced by the standard `type: "tenant"` session.
- **V1 credential path:** Admin email + passphrase only. No OAuth, no SSO.
- **Stripe is non-blocking:** Checkout is triggered post-onboarding or inline at plan selection (step 1). It is never a blocker for reaching the dashboard in the minimal flow.
- **Orphaned tenant cleanup:** Rows where `onboarding_complete = false` and `provisioned_at < now() - 48h` are candidates for pruning. Implement as a scheduled job when backend work opens.

---

## What This Document Is Not

- Not a UI spec — layout, component names, and styling are deferred.
- Not a backend implementation plan — no routes, schema migrations, or Hermes changes in this commit.
- Not a mobile-specific spec — the PWA mobile pass (`mobile-admin-pwa-pass`) is a separate lane.

---

## Prerequisites Before Implementation

1. Cross-agent harness files committed and pushed (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.cursor/rules/`, `.gemini/GEMINI.md`, `.codex/AGENTS.md`) ✅
2. Mobile admin PWA pass (`mobile-admin-pwa-pass`) merged to `master`
3. Explicit implementation scope approved — do not begin without it
