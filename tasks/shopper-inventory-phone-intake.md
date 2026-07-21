# Shopper Engine Upgrades + Inventory Baseline + Phone Intake

**Status:** Implementation pending Sheets audit. See `tasks/shopper-sheets-audit.md` before implementing any inventory baseline or Drive export. Budget rules (caps, per-item limits) come from tenant profile data — never hardcoded.

## What & Why
Extends the existing Shopper tab into the full caregiver logistics engine: explicit budget rules UI, AI meal remix, a structured inventory baseline system (weekly/monthly/quarterly/yearly replenishment cycles), and a Gemini-vision phone intake protocol so the caregiver can photograph a fridge or receipt and the AI updates the cart automatically.

Shopper is a primary caregiver tool. The caregiver should be able to check cart status, review critical household needs, and approve or adjust from their iPhone without sitting at a desk.

## Done looks like
- The **Shopper tab** in Admin view shows a "Budget Rules" info panel at the top: weekly budget cap, snack/beverage sub-limits, and any critical recurring items — all pulled from tenant config, not hardcoded.
- Below the meal plan text area there is an **AI Meal Remix** input field. The caregiver types a modification (e.g. "Low-sodium option this week") and hits "Remix". The app POSTs to `/api/meals/remix` and displays the updated plan.
- An **"Export Meal Plan"** button sends the current plan to Google Drive via `/api/drive/export` (requires Sheets audit first — see `tasks/shopper-sheets-audit.md`).
- A new **"Inventory"** tab (or panel) within Admin view shows items grouped by replenishment cycle (Weekly / Monthly / Quarterly / Yearly), each with `item_name`, `category`, `last_restocked_date`, and `estimated_run_out_date`.
- Caregiver can mark items as restocked (updates `last_restocked_date`) and the system auto-computes `estimated_run_out_date` based on cycle length.
- A **"Phone Intake"** panel lets the caregiver upload a photo (receipt or fridge/pantry shot). The image is sent to `/api/intake/image` where Gemini Vision extracts detected items with quantities and prices, returning a structured editable list. Caregiver approves detected items to add to the cart or update the budget baseline.
- A **voice/text dictation** input field lets the caregiver log a natural-language note (e.g. "Need taco seasoning and paper towels"). Routes through the assistant endpoint and produces an ADD_INVENTORY_ITEM action.
- All inventory items persist in a new `inventory_items` Drizzle table.

## Out of scope
- Actual real-time Twilio SMS/MMS bridge (the phone intake is UI-based image upload, not a real phone number).
- Google Drive OAuth credential setup.
- The Rotation Dashboard and Dialer upgrades (separate tasks).

## Steps
1. **Schema & OpenAPI** — Add `inventory_items` table (id, item_name, category enum: food/paper/toiletry/cleaning/medical, replenishment_cycle enum: weekly/monthly/quarterly/yearly, last_restocked_date, estimated_run_out_date) to Drizzle. Add CRUD endpoints and `/api/meals/remix` and `/api/intake/image` to `openapi.yaml`, then run codegen.

2. **Backend: Inventory routes** — Implement `GET /api/inventory`, `POST /api/inventory`, `PATCH /api/inventory/:id/restock`. Seed the baseline items from `INVENTORY_BASELINE.md` on first startup.

3. **Backend: Meal remix route** — Implement `POST /api/meals/remix` using the Gemini integration. Takes the current meal plan text and a remix prompt, returns an updated meal plan string.

4. **Backend: Phone intake route** — Implement `POST /api/intake/image`. Accept a base64-encoded image, send to Gemini Vision with the structured extraction prompt from `PHONE_INTAKE_PROTOCOL.md`, return the parsed JSON (items_detected array with name, quantity, price_per_unit, category, replenishment_cycle).

5. **Shopper tab UI upgrades** — Add the Budget Rules panel, AI Meal Remix field, and Drive export button to the existing Shopper tab in `admin-view.tsx`. Wire to new API hooks.

6. **Inventory tab/panel UI** — Build an Inventory section in Admin view with cycle-grouped cards. Add "Mark Restocked" buttons and estimated run-out badges. Add the Phone Intake panel with image upload + voice dictation input.

## Relevant files
- `artifacts/brain-app/src/pages/admin-view.tsx`
- `artifacts/api-server/src/routes/shopper.ts`
- `artifacts/api-server/src/routes/gemini.ts`
- `artifacts/api-server/src/routes/index.ts`
- `docs/core-guardian/INVENTORY_BASELINE.md`
- `docs/core-guardian/PHONE_INTAKE_PROTOCOL.md`
- `docs/core-guardian/shopper-positioning.md`
