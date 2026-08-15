/**
 * Shared grocery-cart helpers (Task #148).
 *
 * Extracted from routes/shopper.ts so voice channels (Hermes actions and
 * ElevenLabs tool calls) can add items to the current weekly cart without
 * going through the HTTP layer. routes/shopper.ts imports these too — there
 * is exactly one definition of "the current cart" and its lock invariant.
 */
import { db } from "@workspace/db";
import { groceryCartsTable, cartItemsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Cart tables are lazily created (no drizzle-kit push in this project).
 * Voice channels can hit the cart before any Shopper HTTP route has run —
 * e.g. an ElevenLabs tool call on a fresh deployment — so the cart
 * capability itself guarantees its schema exists before touching it.
 * Memoized after the first success; a failure leaves it un-memoized so the
 * next call retries.
 */
let cartSchemaReady = false;
export async function ensureCartSchema(): Promise<void> {
  if (cartSchemaReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS grocery_carts (
      id SERIAL PRIMARY KEY,
      week_start_date DATE NOT NULL,
      budget_cents INTEGER NOT NULL DEFAULT 20000,
      total_estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cart_items (
      id SERIAL PRIMARY KEY,
      cart_id INTEGER NOT NULL,
      ingredient_name TEXT NOT NULL,
      total_quantity TEXT NOT NULL DEFAULT '1',
      unit TEXT NOT NULL DEFAULT 'each',
      estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'meal'
    )
  `);
  await db.execute(sql`
    ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'meal'
  `);
  cartSchemaReady = true;
}

/** Test-only: reset the schema memo so integration tests can exercise the uninitialized-schema path. */
export function __resetCartSchemaMemoForTests(): void {
  cartSchemaReady = false;
}

export function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export async function getOrCreateCart(): Promise<typeof groceryCartsTable.$inferSelect> {
  await ensureCartSchema();
  const weekStart = getMondayOfWeek(new Date());
  const existing = await db.select().from(groceryCartsTable)
    .where(eq(groceryCartsTable.weekStartDate, weekStart))
    .limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db.insert(groceryCartsTable).values({
    weekStartDate: weekStart,
    budgetCents: 20000,
    totalEstimatedCostCents: 0,
    status: "pending",
  }).returning();
  return created;
}

/** Recompute the cart's total from all items currently in it (manual items count too, though they're unestimated for now). */
export async function updateCartTotal(cartId: number): Promise<void> {
  const items = await db.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, cartId));
  const total = items.reduce((s, i) => s + i.estimatedCostCents, 0);
  await db.update(groceryCartsTable).set({ totalEstimatedCostCents: total }).where(eq(groceryCartsTable.id, cartId));
}

export type AddManualItemsResult =
  | { ok: true; added: string[] }
  | { ok: false; reason: "no_items" | "cart_locked" };

/**
 * Adds one or more one-off named items to the current weekly cart as manual
 * items (source "manual", so meal rebuilds never delete them — same contract
 * as POST /shopper/cart/items). Enforces the cart lock invariant: approved or
 * dismissed carts are never mutated.
 */
export async function addManualItemsToCart(names: string[]): Promise<AddManualItemsResult> {
  const cleaned = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map((n) => n.slice(0, 200));
  if (cleaned.length === 0) return { ok: false, reason: "no_items" };

  const cart = await getOrCreateCart();
  if (cart.status !== "pending") return { ok: false, reason: "cart_locked" };

  await db.insert(cartItemsTable).values(
    cleaned.map((name) => ({
      cartId: cart.id,
      ingredientName: name,
      totalQuantity: "1",
      unit: "each",
      estimatedCostCents: 0, // manual items are unestimated for now
      source: "manual",
    }))
  );
  return { ok: true, added: cleaned };
}

/** "milk" / "milk and eggs" / "milk, eggs, and bread" — for spoken confirmations. */
export function speakableItemList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
