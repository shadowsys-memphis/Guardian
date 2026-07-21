# Brain Guardian OS — Shopper Positioning

**Status:** Documentation/harness lock only. Do not implement Sheets sync or new Shopper features until the Sheets audit (`tasks/shopper-sheets-audit.md`) is complete.

---

## What Shopper Is

**Shopper is the caregiver logistics engine.**

It is not a grocery list. It is the module that turns inventory, recipes, meal plans, and household supply needs into a mobile approval workflow — so the caregiver can stay out from behind a desk.

**Correct positioning:**

> Shopper / Inventory / Meal Planning — caregiver logistics engine for groceries, recipes, recurring supplies, run-out prediction, budget-aware carts, and mobile approval.

---

## What Shopper Does

| Capability | What it does |
|---|---|
| Inventory baseline | Tracks recurring household and care items by replenishment cycle |
| Run-out prediction | Estimates when important items will run out |
| Critical-item alerts | Flags essentials: hydration, food staples, hygiene, meds-adjacent supplies |
| Recipe planning | Suggests meals from patient preferences, diet needs, budget, and inventory |
| Grocery list generation | Converts recipes + inventory gaps into a shopping list |
| Cart approval | Admin approves / rejects / adjusts from iPhone — no desk required |
| Budget control | Keeps shopping aligned with weekly/monthly spend targets from tenant config |
| Substitution logic | Suggests acceptable replacements when items are missing or over budget |
| Care-context awareness | Adjusts meal/grocery planning based on patient phase, appetite, hydration, or low-energy days |
| Google Sheets sync | Uses Sheets as the current operational source if inventory/recipes live there (audit first) |

---

## Mobile Admin Split

Shopper is a primary reason the caregiver needs iPhone access. It supports the 95/5 admin/patient mobile split:

- **Caregiver (95%):** Cart approval, meal planning, critical item alerts, inventory review — all from iPhone
- **Patient (5%):** Voice craving capture via Jessica during calls — surfaces as a suggestion card only, never an automatic cart

The caregiver workflow:
```
Open phone
See "Cart pending"
Approve / edit / reject
Check today's meal plan
See missing critical items
Return to life
```

---

## Google Sheets Architecture

Google Sheets is the **current operational source / import-sync layer** for Shopper data.

```
Google Sheets (current operational source)
        ↓  sync/import
Guardian DB (eventual normalized source of truth)
        ↓  meaningful actions
Hermes Adapter → care_events
```

Rules:
- Do not blindly migrate or overwrite Sheets data.
- Treat Sheets as an external source to audit and map first (`tasks/shopper-sheets-audit.md`).
- Eventually normalize critical Shopper data into Guardian's PostgreSQL tables.
- Preserve Sheets integration if it remains useful as an admin-managed source.

Sheets tabs that likely need mapping:
- `inventory_baseline`
- `recurring_items`
- `shopping_rules`
- `recipes`
- `meal_plan`
- `budget_targets`
- `approved_items`
- `cart_history`

---

## Hermes Integration

Meaningful Shopper actions route through the **Guardian Hermes Adapter** and write to `care_events`.

### Shopper event types (future Hermes dispatch)

| Event type | When it fires |
|---|---|
| `SHOPPER_CART_SUGGESTED` | System generates a new cart for review |
| `SHOPPER_CART_APPROVED` | Admin approves a pending cart |
| `SHOPPER_CART_REJECTED` | Admin rejects a cart |
| `SHOPPER_ITEM_SUBSTITUTED` | Admin substitutes an item in an approved cart |
| `INVENTORY_LOW` | An item crosses the low-stock threshold |
| `CRITICAL_ITEM_RUNOUT_RISK` | A critical supply (hydration, hygiene, meds-adjacent) is at risk |
| `MEAL_PLAN_GENERATED` | Weekly meal plan is generated or remixed |
| `MEAL_COMPLETED` | A planned meal is marked completed |
| `HYDRATION_SUPPLY_LOW` | Hydration supplies specifically flagged low |

All events must include `tenant_id` from the active session. These event types are **not yet implemented** — they are the intended Hermes contract when Shopper is wired into the dispatch layer.

---

## What Shopper Is Not

- Not a replacement for the caregiver's judgment on care needs
- Not a patient-facing tool
- Not a real-time Walmart / DoorDash integration (V1)
- Not a nutritional tracking system (V1)

---

## Prerequisites Before Implementation

1. Google Sheets audit complete (`tasks/shopper-sheets-audit.md`) ✅ required
2. Existing Shopper DB tables reviewed against audit mapping
3. Mobile admin PWA pass merged (Shopper approval flow must work on iPhone)
