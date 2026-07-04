---
title: Google Sheets Shopper Data Audit
status: prerequisite — must complete before implementing Sheets sync or inventory migration
---

# Google Sheets Shopper Data Audit

## What & Why

Before any Google Sheets sync is implemented in Guardian, the existing Sheets-backed Shopper data must be audited and mapped. Migrating blindly risks overwriting, duplicating, or losing data that is the current operational source of truth.

Google Sheets is the current import-sync layer for Shopper data. Brain Guardian OS's PostgreSQL database is the eventual normalized target — but the migration must be intentional, not automatic.

## Goal

Produce a mapping document (`docs/core-guardian/shopper-sheets-mapping.md`) that captures:

| Sheet tab / range | Data type | Columns present | Maps to Guardian table | Notes / conflicts |
|---|---|---|---|---|
| (fill in after audit) | | | | |

## Steps

1. **Identify all relevant Sheets** — List every Google Sheet currently used for Shopper data (inventory baseline, recurring items, shopping rules, recipes, meal plans, budget targets, approved items, cart history).
2. **Document each tab's structure** — For each Sheet: tab name, column headers, row count estimate, data format (free text vs structured).
3. **Map to Guardian DB tables** — For each Sheet tab, identify which Guardian table it should map to: `meals`, `meal_ingredients`, `grocery_carts`, `cart_items`, `cart_meals`, `meal_cravings`, or a new `inventory_items` table.
4. **Flag conflicts** — Note any data in Sheets that has no equivalent Guardian table yet, or that conflicts with the current schema.
5. **Produce the mapping doc** — Write `docs/core-guardian/shopper-sheets-mapping.md` with the completed table above.

## Rules

- Do not migrate or overwrite Sheets data during this audit.
- Do not modify the Guardian DB schema during this audit.
- This audit is read-only. The output is a document, not code.
- Sheets integration implementation (`tasks/voice-to-cart-shopper.md` step 2) is blocked until this audit is complete.

## Out of scope

- Implementing the Sheets sync endpoint
- Migrating data to PostgreSQL
- Modifying any existing Sheets structure

## Relevant files

- `docs/core-guardian/INVENTORY_BASELINE.md` — existing baseline reference
- `docs/core-guardian/shopper-positioning.md` — Shopper architecture and Hermes event types
- `tasks/voice-to-cart-shopper.md` — blocked on this audit
- `tasks/shopper-inventory-phone-intake.md` — blocked on this audit
