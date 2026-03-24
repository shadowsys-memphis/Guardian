import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appStateTable } from "@workspace/db/schema";
import { UpdateAppStateBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function computeCurrentQuarter(): "Q1" | "Q2" | "Q3" | "Q4" {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "Q1";
  if (hour >= 12 && hour < 18) return "Q2";
  if (hour >= 18 && hour < 22) return "Q3";
  return "Q4";
}

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
  const computed = computeCurrentQuarter();
  const effective = (state.quarterOverride as "Q1" | "Q2" | "Q3" | "Q4" | null) ?? computed;
  return {
    id: state.id,
    currentQuarter: effective,
    computedQuarter: computed,
    quarterOverride: state.quarterOverride ?? null,
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

    const updatePayload: Record<string, unknown> = { lastUpdated: new Date() };
    if (body.zombieMode !== undefined) updatePayload.zombieMode = body.zombieMode;
    if (body.motivationLevel !== undefined) updatePayload.motivationLevel = body.motivationLevel;
    if ("activeMessage" in body) updatePayload.activeMessage = body.activeMessage ?? null;
    if (body.notes !== undefined) updatePayload.notes = body.notes;
    if ("quarterOverride" in body) updatePayload.quarterOverride = body.quarterOverride ?? null;

    const [updated] = await db
      .update(appStateTable)
      .set(updatePayload)
      .where(eq(appStateTable.id, state.id))
      .returning();
    res.json(serializeState(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update app state");
    res.status(400).json({ error: "Failed to update state" });
  }
});

export default router;
