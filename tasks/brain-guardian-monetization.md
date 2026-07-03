# Brain Guardian — Monetization Launch

## What & Why
Launch Brain Guardian as the first paid vertical of the broader br(AI)n platform, targeting caregiver families. The pain is specific, urgent, emotionally clear, and subscription-worthy: medication routines, meals, appointments, care notes, family coordination, document tracking, daily logs, and caregiver handoffs.

The underlying architecture must stay generic. The core br(AI)n platform is not hard-coded as caregiver-only.

Strategic structure:
- **br(AI)n** = the core private life-operations platform (people, tasks, routines, documents, logs, roles, workspaces, AI summaries, tenant-scoped data)
- **Brain Guardian** = first paid vertical for caregiver families
- **Future verticals** = Home Guardian, Finance Guardian, Business Guardian, Wellness Guardian, etc.

Public-facing language uses caregiver terms (Brain Guardian, Care Circle, Care Routines, Care Notes). Core architecture uses generic terms (tenant, workspace, routines, tasks, roles, sessions, subscriptions).

## Done looks like
- A public Brain Guardian landing page at `/guardian` — visible without a passphrase — with hero, feature grid, pricing cards, "Start Free Trial" CTA, and Brain Guardian by br(AI)n branding
- Stripe Checkout integrated for Family Plan ($19/mo, 14-day trial) and Multi-Care Plan ($39/mo, 14-day trial)
- After successful checkout, subscriber lands on a `/guardian/success` setup page that lets them create their own passphrase (raw passphrase never stored — only bcrypt hash)
- API server has a `tenants` table; each paying family is an isolated tenant with scoped data
- Server-side tenant middleware enforces data isolation — no private route reads/writes without a valid tenant session; X-Tenant-ID header is treated as a hint only, not trusted identity
- `vault-context.tsx` updated so `unlock()` calls `POST /api/tenants/auth` — the server validates passphrase and returns a session token
- A "My Subscription" page inside the private workspace shows plan, status, trial/renewal date, and a Stripe Customer Portal button for self-service billing management
- Stripe webhook handler processes `checkout.session.completed` (activate tenant, generate setup token), `customer.subscription.deleted` (suspend/cancel), and `invoice.payment_failed` (mark past_due)
- Existing Ray/local instance is not broken or merged with public customer tenants

## Out of scope
- Other verticals (Home Guardian, Finance Guardian, etc.) — architecture supports them, none ship now
- OAuth / social login
- Full admin subscriber dashboard for Ray
- Mobile companion app monetization
- Enterprise compliance layer or B2B sales portal
- Advanced past-due access policy (warn only for now; hard suspension is a follow-up task)

## Steps

1. **Stripe environment secrets & SDK** — Record required secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_FAMILY_PRICE_ID`, `STRIPE_MULTI_CARE_PRICE_ID`, `STRIPE_CUSTOMER_PORTAL_RETURN_URL`, `STRIPE_CHECKOUT_SUCCESS_URL`, `STRIPE_CHECKOUT_CANCEL_URL`). Install the Stripe Node SDK on the API server. Two Stripe Products/Prices (Family Plan $19/mo, Multi-Care $39/mo, each with 14-day trial) should be created in the Stripe dashboard and their Price IDs stored as env vars.

2. **Tenant database schema & migration** — Add a `tenants` table with fields: id, name, email, stripe_customer_id, stripe_subscription_id, plan, status (`pending_checkout` | `trialing` | `active` | `past_due` | `suspended` | `cancelled`), passphrase_hash, setup_token_hash, setup_completed_at, trial_ends_at, current_period_end, created_at, updated_at. Use the raw-SQL pg Pool migration pattern (not drizzle-kit push — TTY issues). Run migration on server startup.

3. **Stripe Checkout API route** — Add `POST /api/billing/checkout` accepting plan, email, optional family_name. Flow: validate plan → create pending tenant record → create Stripe Checkout session with `tenant_id` in metadata → return session URL. Tenant must exist before checkout so the webhook has a record to activate.

4. **Stripe Webhook handler** — Add `POST /api/billing/webhook`. Handle: `checkout.session.completed` (find tenant by metadata tenant_id, store Stripe customer/subscription IDs, mark trialing/active, generate hashed one-time setup token); `customer.subscription.deleted` (find by subscription ID, mark cancelled/suspended); `invoice.payment_failed` (find tenant, mark past_due, warn-only for now).

5. **Checkout success / setup page** — Add public route `/guardian/success`. The page calls `GET /api/billing/checkout-session?session_id=...` which verifies with Stripe, finds the tenant, and returns setup context. The page presents a passphrase creation form (user sets their own passphrase). On submit, `POST /api/tenants/setup` stores only the bcrypt hash and marks `setup_completed_at`. Raw passphrase is never stored or returned by the server.

6. **Tenant authentication & server-side middleware** — Add `POST /api/tenants/auth` that bcrypt-compares the passphrase against all active tenant hashes, returning a signed session token (tenant ID, plan, status) on match. Add tenant middleware that resolves tenant identity from the session token on every private route — no route trusts a raw client-supplied tenant ID. All tenant-owned tables must include `tenant_id` on queries.

7. **Vault context update** — Update `artifacts/brain-app/src/lib/vault-context.tsx` so `unlock()` calls `POST /api/tenants/auth` and stores the returned session token. All existing API calls should include the session credential. Public-facing UI labels shift to "workspace" / "private workspace" / "care workspace" — internal code names may keep `vault-context` to avoid unnecessary breakage.

8. **Brain Guardian landing page** — Build `artifacts/brain-app/src/pages/guardian.tsx` as a public route with: Hero ("A private AI care workspace for families managing real-life care." + Start Free Trial CTA), feature grid (care routines, medication organization, meal planning, appointment tracking, family handoffs, AI care summaries, notes & logs, documents & emergency info), pricing cards (14-day trial, Family $19/mo, Multi-Care $39/mo), and footer (privacy-first language, "not medical advice," built for family care coordination).

9. **Subscription management page** — Build `artifacts/brain-app/src/pages/my-subscription.tsx` as a private route. Calls `GET /api/billing/status` (returns plan, status, trial end, renewal date, payment status) and `POST /api/billing/customer-portal` (creates Stripe Customer Portal session, returns redirect URL). Renders current plan, status badge, renewal/trial date, and "Manage Billing" button.

10. **App routing update** — Update `artifacts/brain-app/src/App.tsx` so `/guardian`, `/guardian/success`, and `/my-subscription` are registered correctly: public routes (`/guardian`, `/guardian/success`) placed before the private workspace gate; `/my-subscription` sits inside the authenticated workspace. Existing private routes remain behind the gate unchanged.

## Relevant files
- `artifacts/brain-app/src/App.tsx`
- `artifacts/brain-app/src/pages/vault-gate.tsx`
- `artifacts/brain-app/src/lib/vault-context.tsx`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/routes/index.ts`
