import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { haldolCycleTable } from "@workspace/db/schema";
import { UpdateHaldolCycleBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function computeCycleInfo(lastInjectionDate: string) {
  const injection = new Date(lastInjectionDate);
  const now = new Date();
  const diffMs = now.getTime() - injection.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const cycleDay = (diffDays % 14) + 1;
  const isZombiePhase = cycleDay <= 5;
  const nextInjection = new Date(injection);
  nextInjection.setDate(injection.getDate() + 14 * Math.ceil((diffDays + 1) / 14));
  return {
    cycleDay,
    isZombiePhase,
    nextInjectionDate: nextInjection.toISOString().split("T")[0],
  };
}

async function ensureCycle() {
  const rows = await db.select().from(haldolCycleTable).limit(1);
  if (rows.length === 0) {
    const today = new Date().toISOString().split("T")[0];
    await db.insert(haldolCycleTable).values({ lastInjectionDate: today });
    const created = await db.select().from(haldolCycleTable).limit(1);
    return created[0];
  }
  return rows[0];
}

function serializeCycle(cycle: typeof haldolCycleTable.$inferSelect) {
  const computed = computeCycleInfo(cycle.lastInjectionDate);
  return {
    id: cycle.id,
    lastInjectionDate: cycle.lastInjectionDate,
    notes: cycle.notes ?? undefined,
    ...computed,
  };
}

router.get("/haldol", async (req, res) => {
  try {
    const cycle = await ensureCycle();
    res.json(serializeCycle(cycle));
  } catch (err) {
    req.log.error({ err }, "Failed to get Haldol cycle");
    res.status(500).json({ error: "Failed to get Haldol cycle" });
  }
});

router.put("/haldol", async (req, res) => {
  try {
    const body = UpdateHaldolCycleBody.parse(req.body);
    const cycle = await ensureCycle();
    const [updated] = await db
      .update(haldolCycleTable)
      .set(body)
      .where(eq(haldolCycleTable.id, cycle.id))
      .returning();
    res.json(serializeCycle(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update Haldol cycle");
    res.status(400).json({ error: "Failed to update Haldol cycle" });
  }
});

export default router;
