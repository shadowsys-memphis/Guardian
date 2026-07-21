---
title: Public-Client Onboarding Flow
status: note — do not implement until harness files are committed and mobile pass is complete
---

# Public-Client Onboarding Flow

## Note

**Do not build yet.** This is a scoped task note only. Implementation begins after:
1. Cross-agent harness files are committed (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.cursor/rules/`, `.gemini/GEMINI.md`, `.codex/AGENTS.md`)
2. Mobile admin PWA pass (`mobile-admin-pwa-pass` branch) is merged

---

## What & Why

Brain Guardian OS needs a minimal public-client onboarding flow so new subscribers can self-provision without hardcoded single-tenant assumptions. Personal names belong only in tenant profile data — never in schema, routes, or default seeds.

---

## Flow (progressive disclosure)

```
1. Tenant / household creation
        ↓
2. Admin setup  (caregiver account — email, passphrase)
        ↓
3. Patient profile  (name, care context — stored in tenant profile data only)
        ↓
4. Optional caregiver invite  (secondary admin/caregiver via email)
        ↓
5. Care settings  (medication cycle, quarter schedule, AI companion preferences)
        ↓
6. Dashboard handoff  (redirect to /admin — onboarding complete)
```

Each step is a discrete screen. Do not show all fields at once. Do not require steps 4–5 to complete initial setup.

---

## Constraints

- All routes in the onboarding flow are **public** (outside VaultGate) until the tenant session is issued at step 6.
- `tenant_id` is created at step 1 and scoped to every subsequent write.
- Do not use `"local"` as a tenant fallback at any point in this flow.
- Admin email/passphrase from step 2 is the only credential; no OAuth for V1.
- Patient name entered in step 3 is stored in tenant profile data — never hardcoded in schema defaults or seeds.
- Stripe checkout is triggered post-onboarding (or inline at step 1 for paid plans), not during the flow itself.

---

## Out of scope for V1

- Multi-patient households
- SSO / OAuth login
- Mobile app onboarding (PWA share sheet is sufficient for V1)
- Caregiver role permissions beyond admin/read-only
