import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { medicationsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

async function ensureMedicationsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS medications (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      dose TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily',
      time_of_day TEXT NOT NULL DEFAULT 'morning',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

router.get("/medications", async (req, res) => {
  try {
    await ensureMedicationsTable();
    const meds = await db.select().from(medicationsTable).orderBy(desc(medicationsTable.createdAt));
    res.json(meds);
  } catch (err) {
    req.log.error({ err }, "Failed to list medications");
    res.status(500).json({ error: "Failed to list medications" });
  }
});

router.post("/medications", async (req, res) => {
  try {
    await ensureMedicationsTable();
    const body = z.object({
      name: z.string().min(1),
      dose: z.string().min(1),
      frequency: z.string().optional().default("daily"),
      timeOfDay: z.string().optional().default("morning"),
      notes: z.string().nullable().optional(),
    }).parse(req.body);
    const [created] = await db.insert(medicationsTable).values({
      name: body.name,
      dose: body.dose,
      frequency: body.frequency,
      timeOfDay: body.timeOfDay,
      notes: body.notes ?? null,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.errors });
      return;
    }
    req.log.error({ err }, "Failed to create medication");
    res.status(500).json({ error: "Failed to create medication" });
  }
});

router.put("/medications/:id", async (req, res) => {
  try {
    await ensureMedicationsTable();
    const id = parseInt(req.params.id, 10);
    const body = z.object({
      name: z.string().optional(),
      dose: z.string().optional(),
      frequency: z.string().optional(),
      timeOfDay: z.string().optional(),
      notes: z.string().nullable().optional(),
      active: z.boolean().optional(),
    }).parse(req.body);
    const [updated] = await db.update(medicationsTable).set(body).where(eq(medicationsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed" });
      return;
    }
    req.log.error({ err }, "Failed to update medication");
    res.status(500).json({ error: "Failed to update medication" });
  }
});

router.delete("/medications/:id", async (req, res) => {
  try {
    await ensureMedicationsTable();
    const id = parseInt(req.params.id, 10);
    await db.update(medicationsTable).set({ active: false }).where(eq(medicationsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to archive medication");
    res.status(500).json({ error: "Failed to archive medication" });
  }
});

export default router;
