---
title: Shopper Engine Upgrades + Inventory Baseline + Phone Intake
---
# Shopper Engine Upgrades + Inventory Baseline + Phone Intake

## What & Why
Extends the existing Shopper tab with the full caregiver-os Shopper Engine spec: explicit budget rules UI (Pepsi Factor, snack/beverage caps), AI meal remix, Google Drive export of meal plans, a structured inventory baseline system (weekly/monthly/quarterly/yearly replenishment cycles), and a Gemini-vision phone intake protocol so Raymo can text a photo of the fridge or a receipt and the AI updates the cart automatically.

## Done looks like
- The **Shopper tab** in Admin view shows a "Budget Rules" info panel at the top: $200/week cap, Pepsi Factor (exactly 4x 2L bottles/week — highlighted as critical), $25/week snack limit, $20/week beverage limit.
- Below the meal plan text area there is an **AI Meal Remix** input field. Raymo types a modification (e.g. "Low-sodium chicken instead of steak this week") and hits "Remix". The app POSTs to `/api/meals/remix` and displays the updated plan.
- An **"Export Meal Plan to Drive"** button sends the current plan to Google Drive via `/api/drive/export`.
- A new **"Inventory"** tab (or panel) within Admin view shows items grouped by replenishment cycle (Weekly / Monthly / Quarterly / Yearly), each with `item_name`, `category`, `last_restocked_date`, and `estimated_run_out_date`.
- Raymo can mark items as restocked (updates `last_restocked_date`) and the system auto-computes `estimated_run_out_date` based on cycle length.
- A **"Phone Intake"** panel (in the Inventory or Shopper section) lets Raymo upload a photo (receipt or fridge/pantry shot). The image is sent to `/api/intake/image` where Gemini Vision analyzes it, extracts detected items with quantities and prices, and returns a structured JSON payload displayed as an editable list. Raymo can approve detected items to add them to the cart or update the budget baseline.
- A **voice dictation** input field lets Raymo type a natural-language note (e.g. "Jessica, we need taco seasoning and paper towels"). The app sends it to the existing `/api/assistant` endpoint and the response contains an ADD_INVENTORY_ITEM action that updates the list.
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
- `/tmp/caregiver-os/src/App.tsx:76-505`
- `/tmp/caregiver-os/INVENTORY_BASELINE.md`
- `/tmp/caregiver-os/PHONE_INTAKE_PROTOCOL.md`
- `/tmp/caregiver-os/server.ts`