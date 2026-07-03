# Admin Shopper Module (Meal Planning + Cart)

## What & Why
Ray's backend tool for managing Pops' weekly meals and grocery shopping. Jessica may ask Pops "Is there anything you'd like this week?" as a conversational touch, but the real work — recipe sync, cart building, budget tracking, and order approval — happens entirely in Ray's admin panel. Pops never interacts with the shopping system directly.

## Done looks like
- Admin panel ("Shopper" tab) lets Ray view the meal lineup for the week and add/remove meals
- Google Sheets integration: Ray can paste his Sheet ID and click "Sync" to pull meals + ingredients into the DB
- Cart builder automatically calculates ingredient quantities and estimates cost against the $150/week budget
- Budget bar shows $X of $150 used
- Ray sees one "Approve" button per cart — tapping it marks the order ready
- Pre-seeded with Pops' favorites: Lasagna, Tacos, Hamburgers, Steak + California veggies, Pollo Asada, Bacon & Eggs
- Jessica has a single optional "ask" she can make during a check-in: "Pops, any cravings this week?" — if he names something, it appears as a suggestion in Ray's Shopper tab (not an automatic cart)

## Out of scope
- Patient-facing shopping UI
- Automatic Walmart / DoorDash cart submission
- Nutritional tracking

## Steps
1. **Google Sheets integration** — Wire the Replit Google Sheets connector. Create an API helper that fetches rows from a configurable Sheet ID and returns structured meal + ingredient data.
2. **DB schema** — Add `meals`, `meal_ingredients`, `grocery_carts`, `cart_items` tables. Seed with Pops' known favorites and estimated per-item costs.
3. **Shopper API routes** — GET meals list, POST sync from Sheets, GET pending carts, POST approve/dismiss.
4. **Admin Shopper tab** — Meal week view, ingredient breakdown, budget progress bar, and cart approval cards. Ray-only, behind the `/admin` route.
5. **Jessica craving hook** — Add one optional question Jessica can ask during a daily check-in ("Any cravings this week?"). If Pops names a meal, it appears as a low-priority suggestion card in Ray's Shopper tab.

## Relevant files
- `artifacts/api-server/src/routes/gemini.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/brain-app/src/App.tsx`
- `lib/db/src/schema/index.ts`
