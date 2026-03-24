import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appStateTable } from "@workspace/db/schema";
import { UpdateAppStateBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function ensureState() {
  const rows = await db.select().from(appStateTable).limit(1);
  if (rows.length === 0) {
    await db.insert(appStateTable).values({
      currentQuarter: "Q1",
      zombieMode: false,
      motivationLevel: 3,
      activeMessage: "Good morning, friend. Let's take it one step at a time.",
    });
    const created = await db.select().from(appStateTable).limit(1);
    return created[0];
  }
  return rows[0];
}

function serializeState(state: typeof appStateTable.$inferSelect) {
  return {
    id: state.id,
    currentQuarter: state.currentQuarter,
    zombieMode: state.zombieMode,
    motivationLevel: state.motivationLevel,
    lastUpdated: state.lastUpdated.toISOString(),
    activeMessage: state.activeMessage ?? undefined,
    notes: state.notes ?? undefined,
  };
}

router.get("/state", async (req, res) => {
  try {
    const state = await ensureState();
    res.json(serializeState(state));
  } catch (err) {
    req.log.error({ err }, "Failed to get app state");
    res.status(500).json({ error: "Failed to get state" });
  }
});

router.put("/state", async (req, res) => {
  try {
    const body = UpdateAppStateBody.parse(req.body);
    const state = await ensureState();
    const [updated] = await db
      .update(appStateTable)
      .set({ ...body, lastUpdated: new Date() })
      .where(eq(appStateTable.id, state.id))
      .returning();
    res.json(serializeState(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update app state");
    res.status(400).json({ error: "Failed to update state" });
  }
});

export default router;
