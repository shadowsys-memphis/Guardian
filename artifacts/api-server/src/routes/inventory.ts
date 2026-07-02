import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { inventoryItemsTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const CYCLE_DAYS: Record<string, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  yearly: 365,
};

function computeRunOut(lastRestockedDate: string, cycle: string): string {
  const d = new Date(lastRestockedDate);
  d.setDate(d.getDate() + (CYCLE_DAYS[cycle] ?? 30));
  return d.toISOString().split("T")[0];
}

const INVENTORY_BASELINE = [
  { itemName: "Milk (1 gallon)", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Eggs (dozen)", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Bread (sandwich loaf)", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Fresh Fruit (apples/bananas)", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Vegetables (mixed)", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Lunch Meat (deli)", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Orange Juice (64oz)", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Butter (1 lb)", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Coffee Creamer", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Yogurt (multipack)", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Pepsi 2L bottles (×4)", category: "food", replenishmentCycle: "weekly", notes: "PEPSI FACTOR — Critical: exactly 4×2L per week. Non-negotiable." },
  { itemName: "Snacks (chips/crackers)", category: "food", replenishmentCycle: "weekly" },
  { itemName: "Paper Towels (6-pack)", category: "paper", replenishmentCycle: "monthly" },
  { itemName: "Toilet Paper (12-pack)", category: "paper", replenishmentCycle: "monthly" },
  { itemName: "Dish Soap", category: "cleaning", replenishmentCycle: "monthly" },
  { itemName: "Laundry Detergent", category: "cleaning", replenishmentCycle: "monthly" },
  { itemName: "All-Purpose Cleaner", category: "cleaning", replenishmentCycle: "monthly" },
  { itemName: "Garbage Bags (tall kitchen)", category: "cleaning", replenishmentCycle: "monthly" },
  { itemName: "Shampoo", category: "toiletry", replenishmentCycle: "monthly" },
  { itemName: "Body Wash", category: "toiletry", replenishmentCycle: "monthly" },
  { itemName: "Deodorant", category: "toiletry", replenishmentCycle: "monthly" },
  { itemName: "Toothpaste", category: "toiletry", replenishmentCycle: "monthly" },
  { itemName: "Hand Soap (refill)", category: "toiletry", replenishmentCycle: "monthly" },
  { itemName: "Razor Blades / Disposable Razors", category: "toiletry", replenishmentCycle: "quarterly" },
  { itemName: "Mouthwash", category: "toiletry", replenishmentCycle: "quarterly" },
  { itemName: "Cotton Balls / Cotton Swabs", category: "medical", replenishmentCycle: "quarterly" },
  { itemName: "Multivitamins", category: "medical", replenishmentCycle: "quarterly" },
  { itemName: "First Aid Kit Resupply (bandages/antiseptic)", category: "medical", replenishmentCycle: "quarterly" },
  { itemName: "Hand Sanitizer (large bottle)", category: "cleaning", replenishmentCycle: "quarterly" },
  { itemName: "Antacids (Tums)", category: "medical", replenishmentCycle: "quarterly" },
  { itemName: "Smoke Detector Batteries (AA/9V assorted)", category: "medical", replenishmentCycle: "yearly" },
  { itemName: "Bed Sheet Set (full/queen)", category: "paper", replenishmentCycle: "yearly" },
  { itemName: "Extra Bath Towels", category: "paper", replenishmentCycle: "yearly" },
] as const;

export async function ensureInventorySeeded() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      item_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'food',
      replenishment_cycle TEXT NOT NULL DEFAULT 'weekly',
      last_restocked_date DATE,
      estimated_run_out_date DATE,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  const existing = await db.select().from(inventoryItemsTable).limit(1);
  if (existing.length > 0) return;

  const today = new Date().toISOString().split("T")[0];
  for (const item of INVENTORY_BASELINE) {
    await db.insert(inventoryItemsTable).values({
      itemName: item.itemName,
      category: item.category,
      replenishmentCycle: item.replenishmentCycle,
      lastRestockedDate: today,
      estimatedRunOutDate: computeRunOut(today, item.replenishmentCycle),
      notes: "notes" in item ? item.notes : null,
    });
  }
}

router.get("/inventory", async (req, res) => {
  try {
    await ensureInventorySeeded();
    const items = await db.select().from(inventoryItemsTable).orderBy(asc(inventoryItemsTable.createdAt));
    res.json(items);
  } catch (err) {
    req.log.error({ err }, "Failed to list inventory");
    res.status(500).json({ error: "Failed to list inventory" });
  }
});

router.post("/inventory", async (req, res) => {
  try {
    await ensureInventorySeeded();
    const body = z.object({
      itemName: z.string().min(1),
      category: z.enum(["food", "paper", "toiletry", "cleaning", "medical"]),
      replenishmentCycle: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
      notes: z.string().optional(),
    }).parse(req.body);
    const today = new Date().toISOString().split("T")[0];
    const [item] = await db.insert(inventoryItemsTable).values({
      itemName: body.itemName,
      category: body.category,
      replenishmentCycle: body.replenishmentCycle,
      lastRestockedDate: today,
      estimatedRunOutDate: computeRunOut(today, body.replenishmentCycle),
      notes: body.notes ?? null,
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    req.log.error({ err }, "Failed to create inventory item");
    res.status(400).json({ error: "Failed to create inventory item" });
  }
});

router.patch("/inventory/:id/restock", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Not found" }); return; }
    const today = new Date().toISOString().split("T")[0];
    const runOut = computeRunOut(today, existing[0].replenishmentCycle);
    const [updated] = await db.update(inventoryItemsTable)
      .set({ lastRestockedDate: today, estimatedRunOutDate: runOut })
      .where(eq(inventoryItemsTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to restock item");
    res.status(500).json({ error: "Failed to restock" });
  }
});

export default router;
