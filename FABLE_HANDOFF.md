# br(AI)n — Comprehensive Fable Handoff
**Date:** July 3, 2026  
**Prepared by:** Replit Agent  
**For:** Fable — Major Oversight & Continuation  
**Live URL:** https://guardian-os-LedgerGhost90.replit.app  
**Repo:** Replit monorepo (pnpm workspaces)

---

## 1. WHAT THIS IS

**br(AI)n** is a medication-cycle-aware AI caregiving operating system built by Ray for his veteran father Pops (diagnosed: PTSD, Schizophrenia, Auditory Hallucinations). It is NOT a generic health app. Every feature was designed around one specific person's life.

**Brain Guardian** is the first paid vertical of br(AI)n — a SaaS product targeting other caregiver families. It launched with Stripe subscriptions and multi-tenant data isolation.

### The three people in the system
| Person | Role | Surface |
|--------|------|---------|
| **Pops** | Patient — veteran, 60s, PTSD + Schizophrenia + Auditory Hallucinations | `/pops` ambient wall display |
| **Ray (Raymo)** | Primary caregiver — Pops' son | `/admin` command center (10 tabs) |
| **Jessica** | AI voice coordinator — Gemini-powered persona | `/jessica` call interface |

### Design philosophy: Unconditional Software
Pops' view has **no tasks, no checkboxes, no completion tracking, no guilt**. It is an ambient display showing the current moment. The system works around Pops; Pops never works for the system.

---

## 2. ARCHITECTURE

### Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 7 + TailwindCSS + shadcn/ui |
| Backend | Express 5 + TypeScript 5.9 |
| Database | PostgreSQL + Drizzle ORM |
| AI | Google Gemini 2.5 Flash (via `@workspace/integrations-gemini-ai`) |
| API contract | OpenAPI 3.1 → Orval codegen → React Query hooks |
| Monorepo | pnpm workspaces |
| Deployment | Replit Autoscale (Cloud Run) |
| Payments | Stripe (Checkout, Webhooks, Customer Portal) |

### Monorepo structure
```
/
├── artifacts/
│   ├── brain-app/          # React/Vite frontend (PORT env var)
│   └── api-server/         # Express 5 backend (PORT env var)
├── lib/
│   ├── db/                 # Drizzle schema + pg pool (shared)
│   ├── api-spec/           # openapi.yaml + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks (OUTPUT of codegen)
│   └── integrations-gemini-ai/  # Gemini SDK wrapper
└── scripts/
    └── post-merge.sh       # Runs drizzle-kit pull after every task merge
```

### Codegen workflow (CRITICAL — must run in this exact order)
```bash
# Step 1: regenerate hooks from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Step 2: rebuild TypeScript references
cd lib/api-client-react && npx tsc --build
```
**If you change openapi.yaml, you MUST run both steps.** The second step is commonly skipped and causes import errors.

### API route registration
All routes are registered WITHOUT a prefix in `artifacts/api-server/src/routes/index.ts`. The frontend calls them as `/api/<path>`. The base path comes from Vite's `BASE_URL` env var — never use root-relative URLs like `/api/...` in frontend code; use `${BASE_URL}api/...`.

### Auth architecture (as of Task #40 + #42)
Three-tier route split:
1. **PUBLIC** — `/api/healthz`, `/api/tenants/auth`, `/api/tenants/setup`, `/api/billing/*`
2. **CORE WORKSPACE** (`requireAnySession`) — state, schedule, symptoms, inventory + admin/workspace/intake/gemini routes (tenant-scoped where applicable)
3. **LOCAL-ONLY** (`requireLocalSession`) — scripts, haldol, smarthome, health-assessment, shopper, rotation (Ray's private tools; tenants get 403)

Ray unlocks his workspace with a **passphrase** stored as a bcrypt hash. Paying subscribers get their own passphrase set during the Stripe checkout → setup flow. Sessions are JWT tokens. The vault gate UI is in `artifacts/brain-app/src/lib/vault-context.tsx`.

---

## 3. DATABASE — 19 TABLES

| Table | Purpose |
|-------|---------|
| `app_state` | Global system state (zombie mode, broadcast, quarter override) |
| `schedule_tasks` | Q1–Q4 daily care schedule items |
| `symptom_logs` | Hallucination intensity, PTSD triggers, behavior notes |
| `voice_scripts` | Jessica's persona/instruction scripts |
| `haldol_cycle` | 14-day injection cycle tracking |
| `smart_home_devices` | Alexa, Sonos, lights — key/value toggle state |
| `health_questions` | Structured question library for Jessica's assessments |
| `call_sessions` | Each Jessica call — date, cycle day, duration, summary |
| `health_data_points` | Parsed health data per call (mood, voices, sleep, etc.) |
| `app_settings` | Key-value app config (active AI model, LM Studio URL, quiet window) |
| `meals` | Meal catalog (pre-seeded with Pops' favorites) |
| `meal_ingredients` | Ingredients per meal with estimated cost |
| `grocery_carts` | Weekly shopping carts |
| `cart_meals` | Meals added to a cart |
| `cart_items` | Ingredient line items in a cart |
| `meal_cravings` | Pops' voiced meal preferences (from Jessica intake) |
| `rotation_tasks` | Caregiver rotation task checklist by period |
| `historical_care_logs` | Weekly efficacy summaries (med adherence, completion %) |
| `inventory_items` | Household inventory with replenishment cycles |

### ⚠️ CRITICAL: inventory_items migration issue
`inventory_items` was added to the Drizzle schema but `drizzle-kit push` consistently stalls on an interactive TTY prompt asking whether to CREATE or RENAME the table. The table is currently created by a raw `CREATE TABLE IF NOT EXISTS` guard inside `inventory.ts` on first request. This bypasses Drizzle's migration system entirely. **The correct fix is a raw SQL startup migration** using the `node -e` pattern with pg Pool (see `.agents/memory/db-migration-raw-sql.md`).

### Tenants table (added in Task #40)
`tenants` table holds: id, name, email, stripe_customer_id, stripe_subscription_id, plan, status, passphrase_hash, setup_token_hash, setup_token_pending, setup_completed_at, trial_ends_at, current_period_end, created_at, updated_at.

---

## 4. API SURFACE — 46+ ENDPOINTS

### By domain
| Domain | Key endpoints |
|--------|--------------|
| State | `GET/PUT /api/state` |
| Schedule | `GET/POST/PUT/DELETE /api/schedule`, `POST /api/schedule/:id/complete` |
| Symptoms | `GET/POST /api/symptoms` |
| Scripts | `GET/POST/PUT/DELETE /api/scripts`, `GET /api/scripts/active` |
| Haldol | `GET/PUT /api/haldol` |
| Smarthome | `GET /api/smarthome/devices`, `PUT /api/smarthome/devices/:key` |
| Gemini | 7 endpoints — conversations, messages (SSE streaming), end session |
| Health Assessment | 15 endpoints — questions, sessions, data points, trends, anomalies, reports, AI model, LM Studio |
| Shopper | 11 endpoints — meals, cart, cravings, sync, approve, dismiss |
| Inventory | `GET/POST /api/inventory`, `PATCH /api/inventory/:id/restock` |
| Intake | `POST /api/intake/image` (Gemini Vision, 15mb body limit) |
| Meals | `POST /api/meals/remix` (AI meal plan remix) |
| Admin | `POST /api/admin/summary`, `POST /api/assistant` |
| Workspace | `POST /api/calendar/events`, `POST /api/drive/export` |
| Rotation | `GET/POST /api/rotation/tasks`, `PATCH/DELETE /api/rotation/tasks/:id`, `GET/POST /api/rotation/logs` |
| Billing | `POST /api/billing/checkout`, `POST /api/billing/webhook`, `GET /api/billing/checkout-session`, `GET /api/billing/status`, `POST /api/billing/customer-portal` |
| Tenants | `POST /api/tenants/auth`, `POST /api/tenants/setup` |
| Intercom | `GET/POST /api/intercom/messages` |
| Health | `GET /api/healthz` |

---

## 5. FRONTEND PAGES

| Route | File | Description |
|-------|------|-------------|
| `/` | `vault-gate.tsx` | Passphrase unlock screen |
| `/pops` | `pops-view.tsx` | Pops' ambient wall display |
| `/jessica` | `jessica-view.tsx` | Jessica SSE streaming call interface |
| `/jessica-phone` | `jessica-phone.tsx` | Full TwilioAssistant-style call UI |
| `/admin` | `admin-view.tsx` | Ray's 10-tab command center (3,245 lines) |
| `/admin/report` | `doctor-report.tsx` | Printable clinical report |
| `/smarthome` | `smart-home.tsx` | Smart home device controls |
| `/guardian` | `guardian.tsx` | Brain Guardian public landing page |
| `/guardian/success` | (in guardian.tsx or App.tsx) | Post-checkout passphrase setup |
| `/my-subscription` | `my-subscription.tsx` | Stripe plan management |

### Admin tabs (all in admin-view.tsx)
1. **Dashboard** — system overview, broadcast, Haldol cycle counter, zombie mode
2. **Schedule Editor** — Q1–Q4 tasks, Google Calendar per-row push
3. **Symptom Log** — hallucination intensity, PTSD triggers
4. **Voice Scripts** — Jessica persona instructions
5. **Haldol Tracker** — 14-day injection cycle, rest phase countdown
6. **Health Intel** — AI trend charts, anomalies, weekly/monthly reports, LM Studio
7. **Shopper** — budget rules ($200/wk, Pepsi Factor), meal catalog, cart, AI Remix, craving log
8. **Inventory** — 33-item baseline by cycle (weekly/monthly/quarterly/yearly), Phone Intake, restock
9. **Rotation** — caregiver task checklist, medication response logging, clinical AI summary
10. **Calendar Sync** — batch-push schedule/meds/shopping to Google Calendar

---

## 6. HALDOL CYCLE — The Core Logic

Pops receives a Haldol injection every 14 days. The cycle has phases:
- **Days 1–3**: Loading phase (max efficacy building)
- **Days 4–10**: Peak efficacy
- **Days 11–13**: Tapering / vulnerability window
- **Day 14**: Re-injection day

Jessica's health assessment questions, symptom alert thresholds, and behavioral context in Ray's dashboard all adjust based on which cycle day it is. This is the defining feature of br(AI)n over any generic caregiving app.

**Time quarters (auto-detected from wall clock):**
- Q1: 06:00–12:00 (Morning)
- Q2: 12:00–18:00 (Afternoon)
- Q3: 18:00–22:00 (Evening)
- Q4: 22:00–06:00 (Night)

---

## 7. AI INTEGRATION (JESSICA)

Jessica is a Gemini-powered AI persona. She speaks to Pops during daily calls. Her system prompt instructs her to:
1. Weave health assessment questions naturally into conversation
2. Extract structured data points and emit them as `<health_data>{json}</health_data>` XML tags
3. Detect meal cravings and emit `<craving>meal name</craving>` tags
4. Parse `---ACTION--- ... ---END_ACTION---` blocks for dispatching commands (ADD_TASK, TOGGLE_SMART_DEVICE, ADD_EVENT, etc.)

The API server intercepts these tags, persists the data, and strips them before sending to the client via SSE.

**AI model selector:** Ray can switch between Gemini 2.5 Flash and local LM Studio models (Qwen3.5 9B, Gemma 4 12B, Gemma 4 E4B) from the Admin Health Intel tab. The active model is stored in `app_settings`.

**LM Studio:** Requires a tunnel (ngrok, Cloudflare) when using the deployed app. Ray pastes the tunnel URL in Admin → AI Brain. Falls back to `LM_STUDIO_URL` env var, then `http://localhost:1234`.

---

## 8. MONETIZATION (Brain Guardian)

### Stripe products
- **Family Plan** — $19/mo, 14-day trial (`STRIPE_FAMILY_PRICE_ID`)
- **Multi-Care Plan** — $39/mo, 14-day trial (`STRIPE_MULTI_CARE_PRICE_ID`)

### Subscriber flow
1. Visitor hits `/guardian` landing page → clicks "Start Free Trial"
2. Stripe Checkout session created → subscriber pays
3. Stripe fires `checkout.session.completed` webhook
4. Server activates tenant, generates one-time setup token
5. Subscriber lands on `/guardian/success?session_id=...`
6. Page shows passphrase creation form → `POST /api/tenants/setup` stores bcrypt hash only
7. Subscriber can now unlock their private workspace with their passphrase

### Required env vars (production)
| Var | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_FAMILY_PRICE_ID` | Family Plan price ID |
| `STRIPE_MULTI_CARE_PRICE_ID` | Multi-Care Plan price ID |
| `STRIPE_CUSTOMER_PORTAL_RETURN_URL` | Portal redirect after billing management |
| `STRIPE_CHECKOUT_SUCCESS_URL` | Redirect after successful checkout |
| `STRIPE_CHECKOUT_CANCEL_URL` | Redirect if checkout cancelled |
| `VITE_PUBLIC_SITE_URL` | Production URL (required at Vite build time) — currently set to `https://guardian-os-LedgerGhost90.replit.app` |
| `DATABASE_URL` | PostgreSQL connection string |
| `GEMINI_API_KEY` (secret) | Google Gemini API key |

---

## 9. COMPLETED TASKS (full chronological record)

Tasks reconstructed from git commit history where the project task system no longer holds records. Confidence level noted per row.

| # | Title | What shipped | Status | Source |
|---|-------|-------------|--------|--------|
| Task #1 | Unconditional Software Reframe | Pops ambient wall display (no checkboxes, clock-driven quarters), Governor panel in Admin, auto-quarter state machine | ✅ MERGED | Commit + plan file |
| Task #2 | Admin Shopper Module | Meal planning, Google Sheets sync, grocery cart, budget bar, Jessica craving hook, Pops' favorites pre-seeded | ✅ MERGED | Commit + plan file |
| Task #3 | Health Intelligence System | Jessica health assessment pipeline, question library, call session management, 30-day trend dashboard, anomaly alerts | ✅ MERGED | Commit + plan file |
| Task #4 | Weekly & Monthly Doctor Health Report | `/admin/report` page, weekly/monthly data aggregation endpoints, print layout | ✅ MERGED | Commit + plan file |
| Task #5 | Core Functional Enhancements | Biometric tracker, E2EE ledger, AI coordinator, group chat, Frosted Glass UI theme — portions later removed or superseded | ⚠️ MERGED then partially removed | Git commit `d6ea70c` |
| Task #6 | Smart Home + Secure Intercom | Gemini AI assistant integration, end-to-end encrypted intercom messages, smart home device control — intercom later removed | ⚠️ MERGED then partially removed | Git commit `987850b` |
| Task #7 | Back-navigation on Doctor Report | "← Back to Admin" button in Doctor Report header, hidden in print mode | ✅ MERGED | Commit + plan file |
| Task #8 | AI Agent Init Files | `.claude/CLAUDE.md`, `.gemini/GEMINI.md`, `.codex/AGENTS.md` — full codebase audit for AI assistant onboarding | ✅ MERGED | Commit `2dce750` + plan file |
| Task #9 | LM Studio Local Model Integration | Qwen3.5 9B, Gemma 4 12B, Gemma 4 E4B support; model selector in Admin; Jessica phone model badge; OpenAI-compatible adapter | ✅ MERGED | Commit `7426290` + plan file |
| Task #10 | Governor + Vault + Encryption Removal | Removed governor_pillars/notes tables, removed E2EE vault/intercom encryption, cleaned dead routes | ✅ MERGED (cleanup) | Commits `654729f`, `71d7db4`, `4d43192` |
| Task #11 | Private App Crawl Governance | `robots.txt` + `sitemap.xml` configured to block crawlers from private workspace routes; SEO strategy documented | ✅ MERGED | Commit `a41079b` (explicit label) |
| Task #12 | Social Preview + SEO Metadata | `opengraph.jpg`, OG/Twitter meta tags in `index.html`, social share card configured | ✅ MERGED | Commit `ec00b6a` (explicit label) |
| Task #13 | Google Sheets Integration | Google Sheets meal sync wired into Shopper tab — paste Sheet ID → pull meals + ingredients into DB | ✅ MERGED | Commit `26b9817` |
| Task #14 | SEO Follow-up Audit | Second-pass SEO scan, updated strategy docs to reflect build-time URL dependency | ✅ MERGED | Commit `b038fe7` |
| Task #15 | (Unknown — no commit label or plan file found) | Gap in numbering; likely a cancelled or renamed task | ❓ UNKNOWN | — |
| Task #16 | Caregiver Rotation Dashboard + AI Clinical Summary | Rotation tab (morning/afternoon/night tasks), med response buttons, clinical notes, 1-button AI summary, historical efficacy logs | ✅ MERGED | Commit + plan file |
| Task #17 | Google Workspace + Enhanced Zero-Touch Dialer | Calendar/Drive export endpoints, TwilioAssistant-style Jessica phone UI, TTS audio playback, action dispatch stream | ✅ MERGED | Commit + plan file |
| Task #18 | Shopper Engine Upgrades + Inventory + Phone Intake | Budget rules panel, AI Meal Remix, 33-item inventory baseline with replenishment cycles, Gemini Vision phone intake | ✅ MERGED | Commit + plan file |
| Task #19 | (Unknown — no commit label or plan file found) | Gap in numbering | ❓ UNKNOWN | — |
| Task #20 | LM Studio Tunnel URL Config | Editable LM Studio URL field in Admin (saved to app_settings), connection-test button, fallback chain | ✅ MERGED | Commit `a818d82` + plan file |
| Tasks #21–#27 | (Unknown — no commit labels or plan files found) | Gap in numbering; likely cancelled, renamed, or internal planning tasks | ❓ UNKNOWN | — |
| Task #28 | iOS Calendar Push (CalendarSyncTab) | Per-row "Sync Cal" on Schedule tab, bulk CalendarSyncTab, per-event-type reminder defaults, urgent cart item toggle | ✅ MERGED | Commit `a11d9aa` + plan file |
| Task #29 | Public Shell Share Preview | Fixed hardcoded Replit preview hostname in OG/Twitter meta tags → `%VITE_PUBLIC_SITE_URL%` | ✅ MERGED | Commit `e8ea05d` |
| Tasks #30–#35 | (Unknown — no commit labels or plan files found) | Gap in numbering | ❓ UNKNOWN | — |
| Task #36 | SEO Scan | Automated SEO scan run; 1 new issue identified | ✅ MERGED | Commit `a38d12a` |
| Task #37 | VITE_PUBLIC_SITE_URL Build Validation | Vite config now throws at build time if env var is absent or malformed; normalizes to origin | ✅ MERGED | Commit `836cce8` |
| Task #38 | Pastel Color Scheme Redesign | Navy/gold → pastel green + light red + off-white; updated all pages and component tokens | ✅ MERGED (was proposed as #1-pastel) | Commit `821bd4a` |
| Task #39 | (Open — TypeScript types fix) | Fix broken TS exports across api-server and brain-app | 🟡 PROPOSED | — |
| Task #40 | Brain Guardian Launch | Public landing page at `/guardian`, Stripe Checkout, multi-tenant DB isolation, webhook handler, setup token flow | ✅ MERGED | Commit `c1d0625` |
| Task #41 | Activate Stripe Checkout | Wire real Stripe price IDs and secrets so checkout actually completes | 🟡 PROPOSED | — |
| Task #42 | Lock Ray's Workspace | bcrypt passphrase hash, JWT session tokens, vault-context updated, three-tier route auth split | ✅ MERGED | Commit `e720303` |
| Task #43 | Harden Tenant Sessions | Session expiry + revocation for paying tenants | 🟡 PROPOSED | — |
| Task #44 | Subscriber Dashboard | Ray can see who signed up, plan status, trial dates | 🟡 PROPOSED | — |
| Task #45 | Passphrase Persistence After Restart | Keep Ray's passphrase working across server restarts | ❌ CANCELLED | — |
| Task #46 | Self-Service Passphrase Change | Let Ray change passphrase without redeploying | ❌ CANCELLED | — |

---

## 10. OPEN / PROPOSED TASKS

| # | Title | Status | Priority |
|---|-------|--------|----------|
| Task #38 | Fix the app not loading so the new color scheme is visible | 🟡 PROPOSED | HIGH — blocks visual |
| Task #39 | Fix broken TypeScript types blocking long-term reliability | 🟡 PROPOSED | HIGH — blocking TS build |
| Task #41 | Activate Stripe checkout so families can actually subscribe | 🟡 PROPOSED | HIGH — monetization gap |
| Task #43 | Harden paying tenant sessions (expiry + revocation) | 🟡 PROPOSED | MEDIUM |
| Task #44 | Subscriber dashboard for Ray (see who signed up) | 🟡 PROPOSED | MEDIUM |
| Task #45 | Keep Ray's passphrase working after server restarts | ❌ CANCELLED | — |
| Task #46 | Let Ray change his passphrase without redeploying | ❌ CANCELLED | — |

---

## 11. KNOWN BUGS & TECHNICAL DEBT

### 🔴 Must fix before demo/production

**1. `buttonVariants` missing from button.tsx**
Task #1 (pastel color scheme) removed the `buttonVariants` export. Three shadcn/ui components still import it: `alert-dialog.tsx`, `calendar.tsx`, `pagination.tsx`. This causes a hard Vite bundle failure.
- **Fix:** Add `buttonVariants` back to `artifacts/brain-app/src/components/ui/button.tsx` as a standalone export function matching the existing Button variant logic.

**2. inventory_items table not formally migrated**
The table exists in Drizzle schema but was never applied via drizzle-kit push (interactive TTY stall). It only gets created by `ensureInventorySeeded()` lazy guard on first request.
- **Fix:** Add a raw SQL startup migration using pg Pool (non-interactive), following the same pattern used for the `tenants` table migration.

**3. TypeScript errors across api-server routes**
Known errors in: `intercom.ts` (missing `intercomeMessagesTable` export), `schedule.ts` / `scripts.ts` / `state.ts` (missing Zod schema exports from `@workspace/api-zod`), `shopper.ts` / `smarthome.ts` (not all code paths return a value). The API server uses esbuild (build.mjs) which ignores TS errors, so these don't block the build — but they signal missing exports and should be fixed.

**4. TypeScript errors in brain-app**
- `jessica-view.tsx` and `pops-view.tsx`: `queryKey` missing in UseQueryOptions (Orval codegen change)
- `intercom.tsx`: Uint8Array type mismatch on crypto.subtle.deriveKey

### 🟠 Functional gaps

**5. No `DELETE /inventory/:id`**  
Ray can add inventory items and mark them restocked but cannot remove one.

**6. AI Meal Remix disabled with empty cart**  
Remix requires meals in the cart first. Should allow free-text remix plan input.

**7. Intake → Cart path missing**  
Items detected from phone photo (Gemini Vision) can go to inventory baseline only — not directly into the shopping cart.

**8. Google auth token is session-only**  
The Google OAuth access token for Calendar/Drive is manually pasted by Ray each session. It's stored in component state only — lost on page refresh. No refresh token flow.

### 🟡 Architecture / maintenance

**9. `admin-view.tsx` is 3,245 lines**  
All 10 tab components are defined inline in one file. Needs to be split into per-tab component files. This is a maintenance and context window hazard for any future agent.

**10. No pagination on list endpoints**  
All GET list endpoints return unbounded result sets. As data grows this will cause slow queries and large payloads.

**11. No auth on several routes**  
Despite Task #42 adding the vault, several routes in the LOCAL-ONLY tier still rely on the frontend not navigating there rather than true server-enforced session checks. The `requireLocalSession` middleware enforces this properly — confirm all sensitive routes are correctly tiered.

---

## 12. ENVIRONMENT & SECRETS

### Development (already set in Replit)
- `DATABASE_URL` — PostgreSQL connection string (Replit managed)
- `GEMINI_API_KEY` — Google Gemini API key (secret)
- `PORT` — auto-assigned by Replit per artifact
- `BASE_PATH` — routing prefix per artifact
- `VITE_PUBLIC_SITE_URL` — set in **production** environment only (`https://guardian-os-LedgerGhost90.replit.app`)

### Stripe (must be set for monetization to work)
- `STRIPE_SECRET_KEY` — not yet set (Stripe not fully activated)
- `STRIPE_WEBHOOK_SECRET` — not yet set
- `STRIPE_FAMILY_PRICE_ID` — not yet set
- `STRIPE_MULTI_CARE_PRICE_ID` — not yet set
- `STRIPE_CHECKOUT_SUCCESS_URL` — not yet set
- `STRIPE_CHECKOUT_CANCEL_URL` — not yet set
- `STRIPE_CUSTOMER_PORTAL_RETURN_URL` — not yet set

---

## 13. PATTERNS TO FOLLOW (non-obvious conventions)

1. **No `console.log` in backend** — use Pino logger (`import { logger } from "../lib/logger"`)
2. **No `@ts-ignore`** anywhere
3. **Explicit serialize functions** for DB→API responses — never return raw Drizzle rows directly
4. **No `drizzle-kit push` for migrations that add columns to existing tables** — it always stalls on TTY. Use raw SQL `ALTER TABLE IF NOT EXISTS` blocks via pg Pool at startup.
5. **Zod v4 import** — use `import { z } from "zod/v4"` not `from "zod"` (the monorepo has zod v4)
6. **API client in frontend** — use `import { apiClient } from "@/lib/api-client"` not direct fetch
7. **All routes registered without prefix in index.ts** — paths in openapi.yaml must match exactly what Express sees
8. **15mb body limit** is set on the express app for image intake — do not reduce this

---

## 14. WHAT "DONE" LOOKS LIKE FOR FABLE

For Fable to consider this project ready for public presentation, the following must be true:

1. ✅ Published to `guardian-os-LedgerGhost90.replit.app` (done)
2. ⬜ `buttonVariants` fix applied — app loads without bundle errors
3. ⬜ Stripe secrets configured — families can actually complete checkout
4. ⬜ Passphrase persists across server restarts (stored in DB, not memory — check Task #45 scope)
5. ⬜ `admin-view.tsx` split into per-tab files — maintainable by a new agent
6. ⬜ TypeScript errors resolved — `tsc --noEmit` exits clean
7. ⬜ inventory_items formal migration — no more lazy guard
8. ⬜ Demo data seeded — the live app should look lived-in, not empty

---

## 15. QUICK START FOR A NEW AGENT

```bash
# Install dependencies
pnpm install

# Run dev servers (both must be running)
# Terminal 1:
pnpm --filter @workspace/api-server run dev
# Terminal 2:
pnpm --filter @workspace/brain-app run dev

# After ANY openapi.yaml change:
pnpm --filter @workspace/api-spec run codegen
cd lib/api-client-react && npx tsc --build

# Check TypeScript errors:
cd artifacts/brain-app && npx tsc --noEmit
cd artifacts/api-server && npx tsc --noEmit

# Run a raw SQL migration (non-interactive):
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'local'\`)
  .then(() => { console.log('done'); pool.end(); })
  .catch(e => { console.error(e); pool.end(); });
"
```

---

*This handoff was generated on July 3, 2026. The codebase is at commit `a1bf3c65` (pastel color scheme merge). The most recent successful deployment is build `963d030a` (July 3, 04:31 UTC).*
