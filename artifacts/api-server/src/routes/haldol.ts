import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { haldolCycleTable, medicationAdjustmentsTable } from "@workspace/db/schema";
import { UpdateHaldolCycleBody } from "@workspace/api-zod";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { computeHaldolCycle } from "../lib/haldol-cycle";

const router: IRouter = Router();

// Cycle math lives in lib/haldol-cycle.ts — do not reimplement it here.

async function ensureCycle() {
  // A historical duplicate must never make the app fall back to an older
  // injection date. The most recently created row is the current authority.
  const rows = await db.select().from(haldolCycleTable).orderBy(desc(haldolCycleTable.id)).limit(1);
  if (rows.length === 0) {
    const today = new Date().toISOString().split("T")[0];
    await db.insert(haldolCycleTable).values({ lastInjectionDate: today });
    const created = await db.select().from(haldolCycleTable).orderBy(desc(haldolCycleTable.id)).limit(1);
    return created[0];
  }
  return rows[0];
}

function serializeCycle(cycle: typeof haldolCycleTable.$inferSelect) {
  const computed = computeHaldolCycle(cycle.lastInjectionDate, {
    intervalDays: cycle.intervalDays,
    zombiePhaseDays: cycle.zombiePhaseDays,
  });
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
    const updateValues: {
      notes?: string;
      lastInjectionDate?: string;
      doseMg?: number | null;
      intervalDays?: number;
      zombiePhaseDays?: number;
    } = {
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
    if (typeof body.intervalDays === "number") {
      updateValues.intervalDays = body.intervalDays;
    }
    if (typeof body.zombiePhaseDays === "number") {
      updateValues.zombiePhaseDays = body.zombiePhaseDays;
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
