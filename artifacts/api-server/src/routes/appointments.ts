import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { medicalAppointmentsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const AppointmentBody = z.object({
  appointmentDate: z.string(),
  appointmentTime: z.string().default("09:00"),
  provider: z.string(),
  location: z.string().optional(),
  type: z.string().default("primary_care"),
  notes: z.string().optional(),
  calendarEventId: z.string().optional(),
});

router.get("/appointments", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(medicalAppointmentsTable)
      .orderBy(desc(medicalAppointmentsTable.appointmentDate));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list appointments");
    res.status(500).json({ error: "Failed to list appointments" });
  }
});

router.post("/appointments", async (req, res) => {
  try {
    const body = AppointmentBody.parse(req.body);
    const [row] = await db
      .insert(medicalAppointmentsTable)
      .values(body)
      .returning();
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create appointment");
    res.status(400).json({ error: "Failed to create appointment" });
  }
});

router.put("/appointments/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = AppointmentBody.partial().parse(req.body);
    const [row] = await db
      .update(medicalAppointmentsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(medicalAppointmentsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update appointment");
    res.status(400).json({ error: "Failed to update appointment" });
  }
});

router.delete("/appointments/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db
      .delete(medicalAppointmentsTable)
      .where(eq(medicalAppointmentsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete appointment");
    res.status(500).json({ error: "Failed to delete appointment" });
  }
});

export default router;
