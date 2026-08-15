/**
 * Integration tests for the voice grocery-item capability (Task #148).
 *
 * Run via: RUN_INTEGRATION_TESTS=1 pnpm test:integration
 * Hits the real DATABASE_URL Postgres instance.
 *
 * Covers the two reviewer-flagged paths:
 *  1. The Hermes ADD_GROCERY_ITEMS handler works even when the cart schema
 *     has not been initialized by any Shopper HTTP route (fresh deployment,
 *     first contact is an ElevenLabs tool call).
 *  2. The cart lock invariant — approved carts are never mutated and the
 *     caller gets a spoken clarification, not a silent failure.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "@workspace/db";

const RUN = process.env.RUN_INTEGRATION_TESTS === "1";
const d = RUN ? describe : describe.skip;

d("voice grocery items (ADD_GROCERY_ITEMS)", () => {
  let dispatch: typeof import("../lib/hermes").dispatch;
  let cartLib: typeof import("../lib/cart");
  const ctx = { tenantId: "local", source: "jessica" as const, actor: "patient" as const };

  beforeAll(async () => {
    dispatch = (await import("../lib/hermes")).dispatch;
    cartLib = await import("../lib/cart");
  });

  afterAll(async () => {
    // Clean up only what these tests inserted.
    await pool.query(`DELETE FROM cart_items WHERE ingredient_name LIKE 'itest-%'`);
  });

  it("adds items even against an uninitialized cart schema", async () => {
    // Simulate a fresh deployment: cart tables absent and the lazy-init
    // memo reset. (Renaming instead of dropping preserves existing data.)
    await pool.query(`ALTER TABLE IF EXISTS cart_items RENAME TO cart_items_bak_itest`);
    await pool.query(`ALTER TABLE IF EXISTS grocery_carts RENAME TO grocery_carts_bak_itest`);
    cartLib.__resetCartSchemaMemoForTests();
    try {
      const result = await dispatch({ type: "ADD_GROCERY_ITEMS", items: ["itest-milk", "itest-eggs"] }, ctx);
      expect(result.ok).toBe(true);
      expect(result.message).toContain("itest-milk");
      expect(result.message).toContain("itest-eggs");

      const rows = await pool.query(
        `SELECT ingredient_name, source FROM cart_items WHERE ingredient_name LIKE 'itest-%' ORDER BY id`
      );
      expect(rows.rows.map((r) => r.ingredient_name)).toEqual(["itest-milk", "itest-eggs"]);
      expect(rows.rows.every((r) => r.source === "manual")).toBe(true);
    } finally {
      // Restore original tables; merge freshly created rows back if needed.
      const fresh = await pool.query(`SELECT to_regclass('cart_items_bak_itest') IS NOT NULL AS has_bak`);
      if (fresh.rows[0]?.has_bak) {
        await pool.query(`DROP TABLE IF EXISTS cart_items`);
        await pool.query(`DROP TABLE IF EXISTS grocery_carts`);
        await pool.query(`ALTER TABLE cart_items_bak_itest RENAME TO cart_items`);
        await pool.query(`ALTER TABLE grocery_carts_bak_itest RENAME TO grocery_carts`);
      }
      cartLib.__resetCartSchemaMemoForTests();
    }
  });

  it("refuses to add to a non-pending (locked) cart with a spoken clarification", async () => {
    const cart = await cartLib.getOrCreateCart();
    const originalStatus = cart.status;
    await pool.query(`UPDATE grocery_carts SET status = 'approved' WHERE id = $1`, [cart.id]);
    try {
      const result = await dispatch({ type: "ADD_GROCERY_ITEMS", items: ["itest-locked-bread"] }, ctx);
      expect(result.ok).toBe(false);
      expect(result.outcome).toBe("skipped");
      expect(result.message.toLowerCase()).toContain("locked");
      const rows = await pool.query(`SELECT 1 FROM cart_items WHERE ingredient_name = 'itest-locked-bread'`);
      expect(rows.rowCount).toBe(0);
    } finally {
      await pool.query(`UPDATE grocery_carts SET status = $1 WHERE id = $2`, [originalStatus, cart.id]);
    }
  });

  it("asks for clarification when no items were caught", async () => {
    const result = await dispatch({ type: "ADD_GROCERY_ITEMS", items: [] }, ctx);
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("skipped");
  });
});
