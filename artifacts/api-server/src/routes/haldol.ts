import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { haldolCycleTable, medicationAdjustmentsTable } from "@workspace/db/schema";
import { UpdateHaldolCycleBody } from "@workspace/api-zod";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

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
  // diffDays >= 14 means the 14-day window closed without a new injection being
  // logged — cycleDay has silently wrapped back to a low number, which reads as
  // a fresh cycle unless we surface isOverdue explicitly. See CLAUDE.md invariant:
  // haldol.ts and gemini.ts must keep this formula in sync.
  const isOverdue = diffDays >= 14;
  const daysOverdue = isOverdue ? diffDays - 13 : 0;
  return {
    cycleDay,
    isZombiePhase,
    nextInjectionDate: nextInjection.toISOString().split("T")[0],
    isOverdue,
    daysOverdue,
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
    doseMg: cycle.doseMg ?? null,
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
    const updateValues: { notes?: string; lastInjectionDate?: string; doseMg?: number | null } = {
      notes: body.notes ?? undefined,
    };
    if (body.lastInjectionDate) {
      updateValues.lastInjectionDate = body.lastInjectionDate instanceof Date
        ? body.lastInjectionDate.toISOString().split("T")[0]
        : String(body.lastInjectionDate);
    }
    if ("doseMg" in body) {
      updateValues.doseMg = body.doseMg ?? null;
    }
    const cycle = await ensureCycle();
    const [updated] = await db
      .update(haldolCycleTable)
      .set(updateValues)
      .where(eq(haldolCycleTable.id, cycle.id))
      .returning();
    res.json(serializeCycle(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update Haldol cycle");
    res.status(400).json({ error: "Failed to update Haldol cycle" });
  }
});

const AdjustmentBody = z.object({
  adjustmentDate: z.string(),
  medication: z.string().default("Haldol Decanoate"),
  previousDose: z.string().optional(),
  newDose: z.string(),
  reason: z.string().optional(),
  loggedBy: z.string().default("Ray"),
  cycleResetDate: z.string().optional(),
});

router.get("/haldol/adjustments", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(medicationAdjustmentsTable)
      .orderBy(desc(medicationAdjustmentsTable.adjustmentDate))
      .limit(50);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list adjustments");
    res.status(500).json({ error: "Failed to list adjustments" });
  }
});

router.post("/haldol/adjustments", async (req, res) => {
  try {
    const body = AdjustmentBody.parse(req.body);
    const [row] = await db
      .insert(medicationAdjustmentsTable)
      .values(body)
      .returning();
    if (body.cycleResetDate) {
      const cycle = await ensureCycle();
      await db
        .update(haldolCycleTable)
        .set({ lastInjectionDate: body.cycleResetDate, notes: `Dose adjusted to ${body.newDose} — ${body.reason ?? ""}` })
        .where(eq(haldolCycleTable.id, cycle.id));
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to log adjustment");
    res.status(400).json({ error: "Failed to log adjustment" });
  }
});

export default router;
