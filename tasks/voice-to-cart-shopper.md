# Admin Shopper Module (Meal Planning + Cart)

**Status:** Implementation pending harness + Sheets audit. See `tasks/shopper-sheets-audit.md` before building Google Sheets sync.

## What & Why
The **caregiver logistics engine** for weekly meal planning, grocery cart management, and household supply tracking. The real work — recipe sync, cart building, budget tracking, and order approval — happens entirely in the admin panel. The patient never interacts with the shopping system directly.

Shopper is a primary caregiver tool, not a side feature. It reduces desk time by surfacing a mobile approval workflow: the caregiver opens their phone, sees a pending cart, approves or adjusts, and returns to care.

## Done looks like
- Admin panel ("Shopper" tab) lets the caregiver view the meal lineup for the week and add/remove meals
- Google Sheets integration: caregiver pastes a Sheet ID and clicks "Sync" to pull meals + ingredients into the DB (see `tasks/shopper-sheets-audit.md` — audit Sheets data before implementing this)
- Cart builder automatically calculates ingredient quantities and estimates cost against the weekly budget
- Budget bar shows $X of weekly budget used
- Caregiver sees one "Approve" button per cart — tapping it marks the order ready; works from iPhone
- Meal favorites seeded from tenant profile data — never hardcoded in schema defaults
- Jessica has a single optional "ask" she can make during a check-in: "Any cravings this week?" — if the patient names something, it appears as a suggestion in the caregiver's Shopper tab (not an automatic cart)

## Out of scope
- Patient-facing shopping UI
- Automatic Walmart / DoorDash cart submission
- Nutritional tracking

## Steps
1. **Google Sheets audit first** — Run `tasks/shopper-sheets-audit.md` before touching the Sheets integration. Do not blindly sync or overwrite existing Sheets data.
2. **Google Sheets integration** — After audit is complete, wire the Sheets connector. Create an API helper that fetches rows from a configurable Sheet ID and returns structured meal + ingredient data.
3. **DB schema** — Add `meals`, `meal_ingredients`, `grocery_carts`, `cart_items` tables. Seed from tenant profile data only — never hardcode personal meal preferences in schema defaults.
4. **Shopper API routes** — GET meals list, POST sync from Sheets, GET pending carts, POST approve/dismiss.
5. **Admin Shopper tab** — Meal week view, ingredient breakdown, budget progress bar, and cart approval cards. Admin-only, behind the `/admin` route. Must be usable from iPhone (mobile admin PWA pass).
6. **Jessica craving hook** — Add one optional question Jessica can ask during a daily check-in ("Any cravings this week?"). If the patient names a meal, it appears as a low-priority suggestion card in the caregiver's Shopper tab.

## Relevant files
- `artifacts/api-server/src/routes/gemini.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/brain-app/src/App.tsx`
- `lib/db/src/schema/index.ts`
