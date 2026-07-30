import crypto from "crypto";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  mealsTable,
  mealIngredientsTable,
  groceryCartsTable,
  cartMealsTable,
  cartItemsTable,
  mealCravingsTable,
  cartFulfillmentsTable,
  appSettingsTable,
} from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const SEED_MEALS = [
  {
    name: "Lasagna",
    description: "Classic layered pasta bake with meat sauce and ricotta",
    estimatedCostCents: 1800,
    ingredients: [
      { name: "Ground Beef (1 lb)", quantity: "1", unit: "lb", estimatedCostCents: 650 },
      { name: "Lasagna Noodles", quantity: "1", unit: "box", estimatedCostCents: 200 },
      { name: "Ricotta Cheese", quantity: "1", unit: "container", estimatedCostCents: 350 },
      { name: "Mozzarella", quantity: "2", unit: "cups shredded", estimatedCostCents: 300 },
      { name: "Tomato Sauce", quantity: "2", unit: "cans", estimatedCostCents: 300 },
    ],
  },
  {
    name: "Tacos",
    description: "Ground beef tacos with fresh toppings",
    estimatedCostCents: 1500,
    ingredients: [
      { name: "Ground Beef (1 lb)", quantity: "1", unit: "lb", estimatedCostCents: 650 },
      { name: "Corn Tortillas", quantity: "1", unit: "pack", estimatedCostCents: 200 },
      { name: "Shredded Cheese", quantity: "1", unit: "cup", estimatedCostCents: 200 },
      { name: "Salsa", quantity: "1", unit: "jar", estimatedCostCents: 250 },
      { name: "Lettuce & Tomato", quantity: "1", unit: "each", estimatedCostCents: 200 },
    ],
  },
  {
    name: "Hamburgers",
    description: "Classic beef burgers with all the fixings",
    estimatedCostCents: 1400,
    ingredients: [
      { name: "Burger Patties (4-pack)", quantity: "1", unit: "pack", estimatedCostCents: 700 },
      { name: "Hamburger Buns", quantity: "1", unit: "pack", estimatedCostCents: 200 },
      { name: "Lettuce, Tomato, Onion", quantity: "1", unit: "set", estimatedCostCents: 250 },
      { name: "Condiments (ketchup, mustard)", quantity: "1", unit: "set", estimatedCostCents: 250 },
    ],
  },
  {
    name: "Steak + California Veggies",
    description: "Sirloin steak with seasonal California vegetables",
    estimatedCostCents: 2500,
    ingredients: [
      { name: "Sirloin Steak (2 lbs)", quantity: "2", unit: "lbs", estimatedCostCents: 1600 },
      { name: "Broccoli", quantity: "1", unit: "head", estimatedCostCents: 250 },
      { name: "Zucchini", quantity: "2", unit: "each", estimatedCostCents: 200 },
      { name: "Bell Peppers", quantity: "2", unit: "each", estimatedCostCents: 250 },
      { name: "Olive Oil & Seasoning", quantity: "1", unit: "set", estimatedCostCents: 200 },
    ],
  },
  {
    name: "Pollo Asada",
    description: "Marinated grilled chicken with lime and garlic",
    estimatedCostCents: 1600,
    ingredients: [
      { name: "Chicken Thighs (2 lbs)", quantity: "2", unit: "lbs", estimatedCostCents: 850 },
      { name: "Limes", quantity: "4", unit: "each", estimatedCostCents: 150 },
      { name: "Garlic", quantity: "1", unit: "head", estimatedCostCents: 100 },
      { name: "Spices (cumin, oregano, chili)", quantity: "1", unit: "set", estimatedCostCents: 200 },
      { name: "Flour Tortillas", quantity: "1", unit: "pack", estimatedCostCents: 300 },
    ],
  },
  {
    name: "Bacon & Eggs",
    description: "Classic breakfast — crispy bacon, scrambled eggs, toast",
    estimatedCostCents: 800,
    ingredients: [
      { name: "Bacon (1 lb)", quantity: "1", unit: "lb", estimatedCostCents: 450 },
      { name: "Eggs (dozen)", quantity: "1", unit: "dozen", estimatedCostCents: 300 },
      { name: "Bread", quantity: "1", unit: "loaf", estimatedCostCents: 250 },
    ],
  },
];

export async function ensureMealsSeeded() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS meals (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS meal_ingredients (
      id SERIAL PRIMARY KEY,
      meal_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity TEXT NOT NULL DEFAULT '1',
      unit TEXT NOT NULL DEFAULT 'each',
      estimated_cost_cents INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS grocery_carts (
      id SERIAL PRIMARY KEY,
      week_start_date DATE NOT NULL,
      budget_cents INTEGER NOT NULL DEFAULT 15000,
      total_estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cart_meals (
      id SERIAL PRIMARY KEY,
      cart_id INTEGER NOT NULL,
      meal_id INTEGER NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cart_items (
      id SERIAL PRIMARY KEY,
      cart_id INTEGER NOT NULL,
      ingredient_name TEXT NOT NULL,
      total_quantity TEXT NOT NULL DEFAULT '1',
      unit TEXT NOT NULL DEFAULT 'each',
      estimated_cost_cents INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS meal_cravings (
      id SERIAL PRIMARY KEY,
      meal_name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'jessica',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  const existing = await db.select().from(mealsTable).limit(1);
  if (existing.length > 0) return;

  for (const meal of SEED_MEALS) {
    const [inserted] = await db.insert(mealsTable).values({
      name: meal.name,
      description: meal.description,
      estimatedCostCents: meal.estimatedCostCents,
      active: true,
    }).returning();
    await db.insert(mealIngredientsTable).values(
      meal.ingredients.map((ing) => ({
        mealId: inserted.id,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        estimatedCostCents: ing.estimatedCostCents,
      }))
    );
  }
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

async function getOrCreateCart(): Promise<typeof groceryCartsTable.$inferSelect> {
  const weekStart = getMondayOfWeek(new Date());
  const existing = await db.select().from(groceryCartsTable)
    .where(eq(groceryCartsTable.weekStartDate, weekStart))
    .limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db.insert(groceryCartsTable).values({
    weekStartDate: weekStart,
    budgetCents: 15000,
    totalEstimatedCostCents: 0,
    status: "pending",
  }).returning();
  return created;
}

async function rebuildCartItems(cartId: number): Promise<void> {
  await db.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cartId));
  const cartMealRows = await db.select().from(cartMealsTable).where(eq(cartMealsTable.cartId, cartId));
  if (cartMealRows.length === 0) {
    await db.update(groceryCartsTable).set({ totalEstimatedCostCents: 0 }).where(eq(groceryCartsTable.id, cartId));
    return;
  }
  const mealIds = cartMealRows.map((r) => r.mealId);
  const ingredients = await db.select().from(mealIngredientsTable).where(
    mealIds.length === 1
      ? eq(mealIngredientsTable.mealId, mealIds[0])
      : sql`${mealIngredientsTable.mealId} = ANY(${sql.raw(`ARRAY[${mealIds.join(",")}]`)})`
  );
  // aggregate by name+unit across all selected meals
  const agg = new Map<string, { cost: number; qty: number; unit: string }>();
  for (const ing of ingredients) {
    const key = `${ing.name}|${ing.unit}`;
    const qty = parseFloat(ing.quantity) || 1;
    const cur = agg.get(key);
    if (cur) { cur.cost += ing.estimatedCostCents; cur.qty += qty; }
    else agg.set(key, { cost: ing.estimatedCostCents, qty, unit: ing.unit });
  }
  if (agg.size > 0) {
    await db.insert(cartItemsTable).values(
      Array.from(agg.entries()).map(([key, v]) => ({
        cartId,
        ingredientName: key.split("|")[0],
        totalQuantity: v.qty % 1 === 0 ? String(v.qty) : v.qty.toFixed(1),
        unit: v.unit,
        estimatedCostCents: v.cost,
      }))
    );
  }
  const total = Array.from(agg.values()).reduce((s, v) => s + v.cost, 0);
  await db.update(groceryCartsTable).set({ totalEstimatedCostCents: total }).where(eq(groceryCartsTable.id, cartId));
}

// GET /shopper/meals
router.get("/shopper/meals", async (req, res) => {
  try {
    await ensureMealsSeeded();
    const meals = await db.select().from(mealsTable).where(eq(mealsTable.active, true));
    const ingredients = await db.select().from(mealIngredientsTable);
    const result = meals.map((m) => ({
      ...m,
      ingredients: ingredients.filter((i) => i.mealId === m.id),
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list meals");
    res.status(500).json({ error: "Failed to list meals" });
  }
});

// POST /shopper/meals
router.post("/shopper/meals", async (req, res) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      estimatedCostCents: z.number().int().min(0).default(0),
      ingredients: z.array(z.object({
        name: z.string(),
        quantity: z.string().default("1"),
        unit: z.string().default("each"),
        estimatedCostCents: z.number().int().min(0).default(0),
      })).optional().default([]),
    }).parse(req.body);
    const [meal] = await db.insert(mealsTable).values({
      name: body.name,
      description: body.description,
      estimatedCostCents: body.estimatedCostCents,
      active: true,
    }).returning();
    if (body.ingredients.length > 0) {
      await db.insert(mealIngredientsTable).values(
        body.ingredients.map((i) => ({ ...i, mealId: meal.id }))
      );
    }
    res.status(201).json(meal);
  } catch (err) {
    req.log.error({ err }, "Failed to create meal");
    res.status(400).json({ error: "Failed to create meal" });
  }
});

// DELETE /shopper/meals/:id
router.delete("/shopper/meals/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.update(mealsTable).set({ active: false }).where(eq(mealsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete meal");
    res.status(500).json({ error: "Failed to delete meal" });
  }
});

// POST /shopper/sync — sync meals from a publicly-shared Google Sheet (CSV export)
router.post("/shopper/sync", async (req, res) => {
  try {
    const { sheetId } = z.object({ sheetId: z.string().min(10) }).parse(req.body);
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    const response = await fetch(csvUrl);
    if (!response.ok) {
      res.status(422).json({ error: "Could not fetch sheet. Make sure it is shared publicly (View access for anyone with link)." });
      return;
    }
    const csvText = await response.text();
    const lines = csvText.trim().split("\n").map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
    if (lines.length < 2) {
      res.status(422).json({ error: "Sheet appears empty." });
      return;
    }

    let imported = 0;
    let currentMealId: number | null = null;
    let currentMealName: string | null = null;

    for (let i = 1; i < lines.length; i++) {
      const [mealName, ingName, quantity, unit, costStr] = lines[i];
      if (!ingName) continue;

      if (mealName && mealName !== currentMealName) {
        currentMealName = mealName;
        const costCents = mealName ? 0 : 0;
        const existing = await db.select().from(mealsTable).where(eq(mealsTable.name, mealName)).limit(1);
        if (existing[0]) {
          currentMealId = existing[0].id;
          await db.update(mealsTable).set({ active: true }).where(eq(mealsTable.id, currentMealId));
        } else {
          const [inserted] = await db.insert(mealsTable).values({
            name: mealName,
            estimatedCostCents: costCents,
            active: true,
          }).returning();
          currentMealId = inserted.id;
          imported++;
        }
      }

      if (currentMealId && ingName) {
        const costCents = costStr ? Math.round(parseFloat(costStr) * 100) : 0;
        const existingIng = await db.select().from(mealIngredientsTable)
          .where(and(eq(mealIngredientsTable.mealId, currentMealId), eq(mealIngredientsTable.name, ingName)))
          .limit(1);
        if (!existingIng[0]) {
          await db.insert(mealIngredientsTable).values({
            mealId: currentMealId,
            name: ingName,
            quantity: quantity || "1",
            unit: unit || "each",
            estimatedCostCents: isNaN(costCents) ? 0 : costCents,
          });
        }
      }
    }
    res.json({ ok: true, mealsImported: imported, rowsProcessed: lines.length - 1 });
  } catch (err) {
    req.log.error({ err }, "Failed to sync from Sheets");
    res.status(500).json({ error: "Sync failed" });
  }
});

// GET /shopper/cart
router.get("/shopper/cart", async (req, res) => {
  try {
    await ensureMealsSeeded();
    const cart = await getOrCreateCart();
    const cartMealRows = await db.select().from(cartMealsTable).where(eq(cartMealsTable.cartId, cart.id));
    const mealIds = cartMealRows.map((r) => r.mealId);
    let meals: any[] = [];
    if (mealIds.length > 0) {
      const mealRows = await db.select().from(mealsTable).where(
        mealIds.length === 1
          ? eq(mealsTable.id, mealIds[0])
          : sql`${mealsTable.id} = ANY(${sql.raw(`ARRAY[${mealIds.join(",")}]`)})`
      );
      const ingredients = await db.select().from(mealIngredientsTable).where(
        mealIds.length === 1
          ? eq(mealIngredientsTable.mealId, mealIds[0])
          : sql`${mealIngredientsTable.mealId} = ANY(${sql.raw(`ARRAY[${mealIds.join(",")}]`)})`
      );
      meals = mealRows.map((m) => ({
        ...m,
        ingredients: ingredients.filter((i) => i.mealId === m.id),
        cartMealId: cartMealRows.find((r) => r.mealId === m.id)?.id,
      }));
    }
    const items = await db.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));
    res.json({ ...cart, meals, items });
  } catch (err) {
    req.log.error({ err }, "Failed to get cart");
    res.status(500).json({ error: "Failed to get cart" });
  }
});

// POST /shopper/cart/meals — add a meal to the current cart
router.post("/shopper/cart/meals", async (req, res) => {
  try {
    const { mealId } = z.object({ mealId: z.number().int() }).parse(req.body);
    const cart = await getOrCreateCart();
    if (cart.status !== "pending") {
      res.status(409).json({ error: "Cart is already approved or dismissed. Create a new week." });
      return;
    }
    await db.insert(cartMealsTable).values({ cartId: cart.id, mealId });
    await rebuildCartItems(cart.id);
    res.status(201).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to add meal to cart");
    res.status(400).json({ error: "Failed to add meal" });
  }
});

// DELETE /shopper/cart/meals/:cartMealId — remove a meal from cart
router.delete("/shopper/cart/meals/:cartMealId", async (req, res) => {
  try {
    const cartMealId = parseInt(req.params.cartMealId, 10);
    const [removed] = await db.delete(cartMealsTable).where(eq(cartMealsTable.id, cartMealId)).returning();
    if (removed) await rebuildCartItems(removed.cartId);
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove meal from cart");
    res.status(500).json({ error: "Failed to remove meal" });
  }
});

// POST /shopper/cart/approve
router.post("/shopper/cart/approve", async (req, res) => {
  try {
    const cart = await getOrCreateCart();
    await db.update(groceryCartsTable)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(groceryCartsTable.id, cart.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to approve cart");
    res.status(500).json({ error: "Failed to approve cart" });
  }
});

// POST /shopper/cart/dismiss
router.post("/shopper/cart/dismiss", async (req, res) => {
  try {
    const cart = await getOrCreateCart();
    await db.update(groceryCartsTable)
      .set({ status: "dismissed" })
      .where(eq(groceryCartsTable.id, cart.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to dismiss cart");
    res.status(500).json({ error: "Failed to dismiss cart" });
  }
});

// GET /shopper/cravings
router.get("/shopper/cravings", async (req, res) => {
  try {
    await ensureMealsSeeded();
    const cravings = await db.select().from(mealCravingsTable)
      .where(eq(mealCravingsTable.status, "pending"))
      .orderBy(desc(mealCravingsTable.createdAt));
    res.json(cravings);
  } catch (err) {
    req.log.error({ err }, "Failed to list cravings");
    res.status(500).json({ error: "Failed to list cravings" });
  }
});

// POST /shopper/cravings — called by Jessica when Pops names a craving
router.post("/shopper/cravings", async (req, res) => {
  try {
    const { mealName, source } = z.object({
      mealName: z.string().min(1),
      source: z.enum(["jessica", "ray"]).default("jessica"),
    }).parse(req.body);
    const [craving] = await db.insert(mealCravingsTable).values({ mealName, source, status: "pending" }).returning();
    res.status(201).json(craving);
  } catch (err) {
    req.log.error({ err }, "Failed to save craving");
    res.status(400).json({ error: "Failed to save craving" });
  }
});

// PATCH /shopper/cravings/:id — update status (added | dismissed)
router.patch("/shopper/cravings/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = z.object({ status: z.enum(["pending", "added", "dismissed"]) }).parse(req.body);
    await db.update(mealCravingsTable).set({ status }).where(eq(mealCravingsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update craving");
    res.status(400).json({ error: "Failed to update craving" });
  }
});

// POST /shopper/cart/reset — reset current week's cart back to pending so meals can be changed
router.post("/shopper/cart/reset", async (req, res) => {
  try {
    const cart = await getOrCreateCart();
    await db.update(groceryCartsTable)
      .set({ status: "pending", approvedAt: null })
      .where(eq(groceryCartsTable.id, cart.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reset cart");
    res.status(500).json({ error: "Failed to reset cart" });
  }
});

async function ensureFulfillmentMigrated() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cart_fulfillments (
      id SERIAL PRIMARY KEY,
      cart_id INTEGER NOT NULL,
      store TEXT NOT NULL DEFAULT 'walmart',
      checkout_url TEXT,
      total_estimated_cents INTEGER NOT NULL DEFAULT 0,
      items_json TEXT NOT NULL DEFAULT '[]',
      over_budget_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      fallback_mode INTEGER NOT NULL DEFAULT 1,
      initiated_by TEXT NOT NULL DEFAULT 'ray',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Add new columns if table already exists from a previous run
  await db.execute(sql`ALTER TABLE cart_fulfillments ADD COLUMN IF NOT EXISTS fallback_mode INTEGER NOT NULL DEFAULT 1`);
  await db.execute(sql`ALTER TABLE cart_fulfillments ADD COLUMN IF NOT EXISTS initiated_by TEXT NOT NULL DEFAULT 'ray'`);
}

interface FulfillmentItem {
  itemName: string;
  productId: string;
  priceCents: number;
  quantity: number;
  status: "found" | "over_budget" | "not_found";
  affiliateUrl?: string;
}

// Search Walmart Open API (affiliate) with HMAC-SHA256 signing when WALMART_PRIVATE_KEY is set,
// or simplified header auth with just WALMART_API_KEY. Returns null on any failure.
async function searchWalmartItem(
  itemName: string,
  zip: string,
  apiKey: string
): Promise<{ product_id: string; product_name: string; price_cents: number; item_url: string } | null> {
  try {
    const timestamp = Date.now();
    const privateKey = process.env.WALMART_PRIVATE_KEY ?? "";

    let authSignature: string;
    if (privateKey) {
      // Full HMAC-SHA256 signature (RSA) per Walmart Open API spec
      const stringToSign = `${apiKey}\n${timestamp}\n`;
      try {
        authSignature = crypto.createSign("RSA-SHA256").update(stringToSign).sign(privateKey, "base64");
      } catch {
        authSignature = apiKey;
      }
    } else {
      authSignature = apiKey;
    }

    // Walmart Open API product search — zip filters local availability
    const url = `https://developer.api.walmart.com/api-proxy/service/affil/product/v2/search?query=${encodeURIComponent(itemName)}&numItems=5&format=json&zip=${encodeURIComponent(zip)}`;
    const res = await fetch(url, {
      headers: {
        "WM_CONSUMER.ID": apiKey,
        "WM_TIMESTAMP": String(timestamp),
        "WM_SEC.AUTH_SIGNATURE": authSignature,
        "WM_CONSUMER.INTIMESTAMP": String(timestamp),
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const item = data?.items?.[0] ?? data?.search?.items?.item?.[0];
    if (!item) return null;
    const itemId = String(item.itemId ?? item.ItemID ?? "");
    const productName = String(item.name ?? item.productName ?? itemName);
    return {
      product_id: itemId,
      product_name: productName,
      price_cents: Math.round(Number(item.salePrice ?? item.regularPrice ?? 5) * 100),
      item_url: itemId ? `https://www.walmart.com/ip/${productName.replace(/\s+/g, "-")}/${itemId}` : "",
    };
  } catch {
    return null;
  }
}

// Build Walmart cart deep-link from accumulated real product IDs.
// Falls back to grocery storefront with zip when no real IDs are available.
function buildWalmartCheckoutUrl(foundItems: FulfillmentItem[], zip: string): string {
  const realItems = foundItems.filter((i) => i.status === "found" && i.productId && !/^walmart_/.test(i.productId));
  if (realItems.length > 0) {
    // Walmart add-to-cart deep link: /cart/add?itemId=ID&quantity=QTY (repeatable)
    const params = realItems.flatMap((i) => [`itemId=${encodeURIComponent(i.productId)}`, `quantity=${i.quantity}`]).join("&");
    return `https://www.walmart.com/cart/add?${params}`;
  }
  return zip ? `https://www.walmart.com/grocery?zip=${encodeURIComponent(zip)}` : "https://www.walmart.com/grocery";
}

// Generate Instacart affiliate search URL for a single ingredient at Stater Bros.
function buildInstacartItemUrl(itemName: string): string {
  return `https://www.instacart.com/store/stater-brothers-markets/search_v3/${encodeURIComponent(itemName)}`;
}

// Build Instacart checkout URL: storefront URL (Instacart Connect required for true deep-link cart).
function buildInstacartCheckoutUrl(): string {
  return "https://www.instacart.com/store/stater-brothers-markets/storefront";
}

async function runFulfillmentLoop(
  items: Array<{ ingredientName: string; totalQuantity: string; unit: string; estimatedCostCents: number }>,
  store: string,
  zip: string,
  budgetCents: number
): Promise<{
  items: FulfillmentItem[];
  totalEstimatedCents: number;
  overBudgetCount: number;
  checkoutUrl: string;
  store: string;
  status: string;
  fallbackMode: boolean;
}> {
  const walmartKey = process.env.WALMART_API_KEY ?? "";
  const instacartKey = process.env.INSTACART_API_KEY ?? "";
  const targetStore = store === "stater_bros" ? "stater_bros" : "walmart";
  const hasApiKey = targetStore === "walmart" ? !!walmartKey : !!instacartKey;
  const fallbackMode = !hasApiKey;

  const cartAccumulator: FulfillmentItem[] = [];
  let runningTotalCents = 0;
  // Tracks affiliate/item URLs returned by search so add_to_cart can attach them
  const affiliateUrlMap = new Map<string, string>();

  const toolDefinitions = [{
    functionDeclarations: [
      {
        name: "search_local_inventory",
        description: fallbackMode
          ? "Estimate price for a grocery item using known cart data (no live API key configured)."
          : "Search live store inventory for a grocery item by name and zip code.",
        parameters: {
          type: "object" as const,
          properties: {
            store: { type: "string" as const, description: "Store identifier: 'walmart' or 'stater_bros'" },
            item_name: { type: "string" as const, description: "Name of the grocery item to search for" },
            zip: { type: "string" as const, description: "Zip code for local store inventory lookup" },
          },
          required: ["store", "item_name", "zip"],
        }
      },
      {
        name: "add_to_cart",
        description: "Add a product to the fulfillment cart. Reject if price_cents × quantity would exceed remaining budget.",
        parameters: {
          type: "object" as const,
          properties: {
            store: { type: "string" as const, description: "Store identifier" },
            product_id: { type: "string" as const, description: "Product ID returned from search" },
            product_name: { type: "string" as const, description: "Product name" },
            price_cents: { type: "number" as const, description: "Price in cents" },
            quantity: { type: "number" as const, description: "Quantity to add (default 1)" },
          },
          required: ["store", "product_id", "product_name", "price_cents", "quantity"],
        }
      }
    ]
  }];

  const itemsText = items.map((i) => `- ${i.ingredientName} (${i.totalQuantity} ${i.unit})`).join("\n");
  const modeNote = fallbackMode
    ? "(No live API key — using estimated prices from cart data. Fallback mode.)"
    : "(Live inventory search enabled.)";

  const initialPrompt = `You are a grocery fulfillment agent. ${modeNote}
For each item in the shopping list: call search_local_inventory, then call add_to_cart if found and within budget.
Store: "${targetStore}", Zip: "${zip}", Budget: $${(budgetCents / 100).toFixed(2)}.
If adding an item would exceed the remaining budget, do NOT add it — mark it over_budget.

Shopping list:
${itemsText}

Process every item in order.`;

  let messages: Array<{ role: "user" | "model"; parts: any[] }> = [
    { role: "user", parts: [{ text: initialPrompt }] }
  ];

  const MAX_ITERATIONS = items.length * 4 + 6;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let response: any;
    try {
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: messages,
        config: { tools: toolDefinitions } as any,
      });
    } catch {
      break;
    }

    const candidate = response?.candidates?.[0];
    if (!candidate?.content) break;

    const parts: any[] = candidate.content.parts ?? [];
    const functionCalls = parts.filter((p: any) => p.functionCall);
    if (functionCalls.length === 0) break;

    messages.push({ role: "model", parts });

    const functionResponses: any[] = [];
    for (const part of parts) {
      if (!part.functionCall) continue;
      const { name, args } = part.functionCall as { name: string; args: Record<string, unknown> };
      let result: Record<string, unknown>;

      if (name === "search_local_inventory") {
        const itemName = String(args.item_name ?? "");

        if (!fallbackMode && targetStore === "walmart" && walmartKey) {
          // Live Walmart Open API search with zip for local inventory
          const liveResult = await searchWalmartItem(itemName, zip, walmartKey);
          if (liveResult) {
            if (liveResult.item_url) affiliateUrlMap.set(liveResult.product_id, liveResult.item_url);
            result = { found: true, product_id: liveResult.product_id, product_name: liveResult.product_name, price_cents: liveResult.price_cents, in_stock: true, store: targetStore, source: "walmart_api", item_url: liveResult.item_url };
          } else {
            // API failed — fall back to estimated
            const match = items.find((ci) => ci.ingredientName.toLowerCase().includes(itemName.toLowerCase().split(" ")[0]) || itemName.toLowerCase().includes(ci.ingredientName.toLowerCase().split(" ")[0]));
            const pid = `walmart_${itemName.replace(/\s+/g, "_").toLowerCase().slice(0, 40)}`;
            result = { found: true, product_id: pid, product_name: itemName, price_cents: match?.estimatedCostCents ?? 500, in_stock: true, store: targetStore, source: "estimated_fallback" };
          }
        } else if (targetStore === "stater_bros") {
          // Stater Bros: build Instacart affiliate search URL per ingredient
          const pid = `stater_${itemName.replace(/\s+/g, "_").toLowerCase().slice(0, 40)}`;
          const affiliateUrl = buildInstacartItemUrl(itemName);
          affiliateUrlMap.set(pid, affiliateUrl);
          const match = items.find((ci) => ci.ingredientName.toLowerCase().includes(itemName.toLowerCase().split(" ")[0]) || itemName.toLowerCase().includes(ci.ingredientName.toLowerCase().split(" ")[0]));
          result = { found: true, product_id: pid, product_name: itemName, price_cents: match?.estimatedCostCents ?? 500, in_stock: true, store: targetStore, source: "instacart_affiliate", item_url: affiliateUrl };
        } else {
          // Walmart fallback (no API key)
          const match = items.find((ci) => ci.ingredientName.toLowerCase().includes(itemName.toLowerCase().split(" ")[0]) || itemName.toLowerCase().includes(ci.ingredientName.toLowerCase().split(" ")[0]));
          const pid = `walmart_${itemName.replace(/\s+/g, "_").toLowerCase().slice(0, 40)}`;
          result = { found: true, product_id: pid, product_name: itemName, price_cents: match?.estimatedCostCents ?? 500, in_stock: true, store: targetStore, source: "estimated" };
        }
      } else if (name === "add_to_cart") {
        const priceCents = Number(args.price_cents ?? 0);
        const quantity = Number(args.quantity ?? 1);
        const itemTotal = priceCents * quantity;
        const wouldExceed = runningTotalCents + itemTotal > budgetCents;
        const productId = String(args.product_id ?? "");
        const affiliateUrl = affiliateUrlMap.get(productId);
        // Flag over_budget from item 1 correctly (no length guard)
        if (wouldExceed) {
          cartAccumulator.push({ itemName: String(args.product_name ?? ""), productId, priceCents, quantity, status: "over_budget", affiliateUrl });
          result = { added: false, reason: "over_budget", budget_remaining_cents: budgetCents - runningTotalCents };
        } else {
          runningTotalCents += itemTotal;
          cartAccumulator.push({ itemName: String(args.product_name ?? ""), productId, priceCents, quantity, status: "found", affiliateUrl });
          result = { added: true, running_total_cents: runningTotalCents, budget_remaining_cents: budgetCents - runningTotalCents };
        }
      } else {
        result = { error: "unknown_function" };
      }

      functionResponses.push({ functionResponse: { name, response: result } });
    }

    messages.push({ role: "user", parts: functionResponses });
  }

  const foundItems = cartAccumulator.filter((i) => i.status === "found");
  let checkoutUrl: string;
  if (targetStore === "stater_bros") {
    checkoutUrl = "https://www.instacart.com/store/stater-brothers-markets/storefront";
  } else {
    checkoutUrl = buildWalmartCheckoutUrl(foundItems, zip);
  }

  const overBudgetCount = cartAccumulator.filter((i) => i.status === "over_budget").length;

  return {
    items: cartAccumulator,
    totalEstimatedCents: runningTotalCents,
    overBudgetCount,
    checkoutUrl,
    store: targetStore,
    status: cartAccumulator.length > 0 ? "ready" : "empty",
    fallbackMode,
  };
}

// POST /shopper/fulfill — run agentic fulfillment loop for current cart
router.post("/shopper/fulfill", async (req, res) => {
  try {
    await ensureMealsSeeded();
    await ensureFulfillmentMigrated();

    const cart = await getOrCreateCart();
    const cartItems = await db.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));

    if (cartItems.length === 0) {
      res.status(400).json({ error: "Cart is empty — add meals first" });
      return;
    }

    const [storeRow, zipRow] = await Promise.all([
      db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "preferred_store")).limit(1),
      db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "zip_code")).limit(1),
    ]);
    const store = storeRow[0]?.value ?? "walmart";
    const zip = zipRow[0]?.value ?? "";
    const budgetCents = cart.budgetCents ?? 15000;

    const initiatedBy = (req.body?.initiatedBy === "pops") ? "pops" : "ray";

    const result = await runFulfillmentLoop(cartItems, store, zip, budgetCents);

    await db.execute(sql`
      INSERT INTO cart_fulfillments (cart_id, store, checkout_url, total_estimated_cents, items_json, over_budget_count, status, fallback_mode, initiated_by)
      VALUES (${cart.id}, ${result.store}, ${result.checkoutUrl}, ${result.totalEstimatedCents}, ${JSON.stringify(result.items)}, ${result.overBudgetCount}, ${result.status}, ${result.fallbackMode ? 1 : 0}, ${initiatedBy})
    `);

    res.json({ ...result, budgetCents, initiatedBy });
  } catch (err) {
    req.log.error({ err }, "Fulfillment failed");
    res.status(500).json({ error: "Fulfillment agent failed — check Gemini API availability" });
  }
});

// GET /shopper/fulfill/current — latest fulfillment for current week's cart
router.get("/shopper/fulfill/current", async (req, res) => {
  try {
    await ensureFulfillmentMigrated();
    const cart = await getOrCreateCart();
    const rows = await db.select().from(cartFulfillmentsTable)
      .where(eq(cartFulfillmentsTable.cartId, cart.id))
      .orderBy(desc(cartFulfillmentsTable.createdAt))
      .limit(1);
    if (!rows[0]) {
      res.json(null);
      return;
    }
    const row = rows[0];
    let items: FulfillmentItem[] = [];
    try { items = JSON.parse(row.itemsJson ?? "[]"); } catch {}
    const [storeRow] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "preferred_store")).limit(1);
    const budgetCents = cart.budgetCents ?? 15000;
    res.json({ ...row, items, budgetCents, preferredStore: storeRow?.value ?? "walmart" });
  } catch (err) {
    req.log.error({ err }, "Failed to get fulfillment");
    res.status(500).json({ error: "Failed to fetch fulfillment" });
  }
});

// POST /shopper/remix — AI-powered meal plan remix using Gemini
router.post("/shopper/remix", async (req, res) => {
  try {
    const { currentPlan, remixPrompt } = z.object({
      currentPlan: z.string().min(1),
      remixPrompt: z.string().min(1),
    }).parse(req.body);

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user" as const,
        parts: [{
          text: `You are a practical meal planning assistant for a veteran caregiver household with a $200/week budget.

Current meal plan:
${currentPlan}

Remix instruction: "${remixPrompt}"

Respond with ONLY the updated meal plan text in the same format as the original. Be budget-conscious and practical. Keep Pepsi (4×2L bottles/week) in mind as a weekly staple for Pops.`,
        }],
      }],
    });

    const updatedPlan = ((result as any).text ?? "").trim();
    if (!updatedPlan) throw new Error("Gemini returned an empty response");
    res.json({ updatedPlan });
  } catch (err) {
    req.log.error({ err }, "Meal remix failed");
    res.status(500).json({ error: "Meal remix failed" });
  }
});

export default router;
