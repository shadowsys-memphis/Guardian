---
name: Grocery cart lock invariant
description: Any cart mutation endpoint must verify current-cart ownership AND pending status
---

Every endpoint that mutates grocery cart contents (items, meals) must:
1. Load the current cart via `getOrCreateCart()` and require the target row's `cartId` matches it (404 otherwise — historical carts are immutable).
2. Require `cart.status === "pending"` (409 otherwise — approved/dismissed carts are locked).

**Why:** completion code review rejected a delete endpoint that skipped these guards — a known item ID could silently mutate a locked or historical cart.

**How to apply:** whenever adding cart-mutation routes (voice add, staples, barcode scan follow-ons), copy both guards from the existing `/shopper/cart/items` routes. Also note: `rebuildCartItems` deletes only `source='meal'` rows so manual/staple items survive meal add/remove, and the item-delete route rejects only `source='meal'` (any non-meal source is user-removable).

**Atomicity:** if a slow external call (Gemini, etc.) sits between the status check and the insert, a plain pre-check is not enough — completion review rejects it. Re-verify atomically at write time with a conditional `INSERT … SELECT … WHERE status='pending'` and return 409 when no row is inserted (see the barcode scan route). Also strictly zod-validate any model output before persisting it.

**Confidence-gated writes:** when a route only auto-persists above some confidence/quality threshold, keep the atomic insert-at-write-time guard *only* on the auto-persist branch — a branch that returns without writing needs no cart-lock check at all (nothing to race). Empirically, the barcode-scan Gemini prompt (`gemini-2.5-flash`, "identify a grocery product") is bimodal in practice: real test photos came back either clearly `"high"` confidence or `identified:false` ("can't tell what this is"), essentially never `"medium"`/`"low"` — don't expect casual manual testing to naturally exercise a medium/low-confidence branch; treat the branch's correctness as provable by reading the code (does the early-return sit textually before the INSERT?) rather than by trying to coax the model into a specific confidence tier.
