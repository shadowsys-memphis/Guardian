import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  mealsTable,
  mealIngredientsTable,
  groceryCartsTable,
  cartMealsTable,
  cartItemsTable,
  mealCravingsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";

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
      return res.status(422).json({ error: "Could not fetch sheet. Make sure it is shared publicly (View access for anyone with link)." });
    }
    const csvText = await response.text();
    const lines = csvText.trim().split("\n").map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
    if (lines.length < 2) return res.status(422).json({ error: "Sheet appears empty." });

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
      return res.status(409).json({ error: "Cart is already approved or dismissed. Create a new week." });
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

export default router;
