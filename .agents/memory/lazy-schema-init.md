---
name: Lazy cart/table schema initialization
description: Tables in this project are created lazily by route-level ensure* functions, not migrations — shared capabilities must self-initialize.
---
Several tables (shopper/cart, care_events, documents, etc.) are created lazily via `CREATE TABLE IF NOT EXISTS` inside route-level `ensure*()` functions, not by drizzle-kit migrations.

**Why:** A completion review rejected voice cart-adding because the ElevenLabs tool path could run on a fresh deployment before any Shopper HTTP route had created the cart tables — the capability failed with a generic error.

**How to apply:** When extracting or adding a shared capability (lib/ helper, Hermes handler, webhook tool) that touches one of these tables, make the capability itself await a memoized schema-ensure (see `ensureCartSchema()` in api-server `lib/cart.ts`) instead of assuming an HTTP route ran first. Also: the drizzle schema in lib/db may declare columns the live dev DB lacks until the relevant ensure/ALTER runs.
