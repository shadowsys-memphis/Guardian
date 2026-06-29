import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { rotationTasksTable, historicalCareLogsTable } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

let seeded = false;

const DEFAULT_TASKS = [
  { title: "Haldol Medication", period: "morning", timeSlot: "6:00 AM", isHourly: false, category: "Medication" },
  { title: "Breakfast", period: "morning", timeSlot: "8:00 AM", isHourly: false, category: "Food Intake" },
  { title: "Blood Pressure Read", period: "morning", timeSlot: "8:30 AM", isHourly: false, category: "Biometric Read" },
  { title: "Reposition / Sore Rotation", period: "morning", timeSlot: "8:00 AM", isHourly: true, category: "Physical Rotation" },
  { title: "Morning Check-in Chat", period: "morning", timeSlot: "9:00 AM", isHourly: false, category: "Cognitive" },
  { title: "Reposition / Sore Rotation", period: "morning", timeSlot: "10:00 AM", isHourly: true, category: "Physical Rotation" },
  { title: "Midday Snack", period: "morning", timeSlot: "11:00 AM", isHourly: false, category: "Food Intake" },
  { title: "Weight Check", period: "morning", timeSlot: "11:30 AM", isHourly: false, category: "Biometric Read" },
  { title: "Lunch", period: "afternoon", timeSlot: "12:30 PM", isHourly: false, category: "Food Intake" },
  { title: "Reposition / Sore Rotation", period: "afternoon", timeSlot: "12:00 PM", isHourly: true, category: "Physical Rotation" },
  { title: "Afternoon Medication Check", period: "afternoon", timeSlot: "2:00 PM", isHourly: false, category: "Medication" },
  { title: "Reposition / Sore Rotation", period: "afternoon", timeSlot: "2:00 PM", isHourly: true, category: "Physical Rotation" },
  { title: "Afternoon Snack", period: "afternoon", timeSlot: "4:00 PM", isHourly: false, category: "Food Intake" },
  { title: "Reposition / Sore Rotation", period: "afternoon", timeSlot: "4:00 PM", isHourly: true, category: "Physical Rotation" },
  { title: "Dinner", period: "night", timeSlot: "6:00 PM", isHourly: false, category: "Food Intake" },
  { title: "Evening Medication", period: "night", timeSlot: "8:00 PM", isHourly: false, category: "Medication" },
  { title: "Reposition / Sore Rotation", period: "night", timeSlot: "8:00 PM", isHourly: true, category: "Physical Rotation" },
] as const;

const DEFAULT_LOGS = [
  { dateLabel: "Mon Jun 23", wantsRespondedRate: 85, medAdherence: 100, soreRotationComplete: 75, efficacyScore: 8, generalNotes: "Good day overall — calm morning, engaged in conversation." },
  { dateLabel: "Tue Jun 24", wantsRespondedRate: 70, medAdherence: 100, soreRotationComplete: 50, efficacyScore: 6, generalNotes: "Agitated early, voices more active. Settled by afternoon." },
  { dateLabel: "Wed Jun 25", wantsRespondedRate: 90, medAdherence: 100, soreRotationComplete: 100, efficacyScore: 9, generalNotes: "Excellent responsiveness. Full rotation completed. Best day this week." },
];

async function ensureSeeded() {
  if (seeded) return;
  try {
    const existing = await db.select().from(rotationTasksTable).limit(1);
    if (existing.length === 0) {
      await db.insert(rotationTasksTable).values(DEFAULT_TASKS.map((t) => ({ ...t })));
    }
    const existingLogs = await db.select().from(historicalCareLogsTable).limit(1);
    if (existingLogs.length === 0) {
      await db.insert(historicalCareLogsTable).values(DEFAULT_LOGS.map((l) => ({ ...l })));
    }
    seeded = true;
  } catch { /* ignore */ }
}

function serializeTask(t: typeof rotationTasksTable.$inferSelect) {
  return {
    id: t.id,
    title: t.title,
    period: t.period,
    timeSlot: t.timeSlot,
    isHourly: t.isHourly,
    category: t.category,
    status: t.status,
    medResponse: t.medResponse ?? null,
    loggedNote: t.loggedNote ?? null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

function serializeLog(l: typeof historicalCareLogsTable.$inferSelect) {
  return {
    id: l.id,
    dateLabel: l.dateLabel,
    wantsRespondedRate: l.wantsRespondedRate,
    medAdherence: l.medAdherence,
    soreRotationComplete: l.soreRotationComplete,
    generalNotes: l.generalNotes ?? null,
    efficacyScore: l.efficacyScore,
    createdAt: l.createdAt.toISOString(),
  };
}

router.get("/rotation/tasks", async (req, res) => {
  await ensureSeeded();
  try {
    const tasks = await db.select().from(rotationTasksTable).orderBy(asc(rotationTasksTable.createdAt));
    res.json(tasks.map(serializeTask));
  } catch (err) {
    req.log.error({ err }, "Failed to list rotation tasks");
    res.status(500).json({ error: "Failed to list rotation tasks" });
  }
});

router.post("/rotation/tasks", async (req, res) => {
  try {
    const body = z.object({
      title: z.string(),
      period: z.enum(["morning", "afternoon", "night"]),
      timeSlot: z.string(),
      isHourly: z.boolean().optional().default(false),
      category: z.string().optional().default("Physical Rotation"),
    }).parse(req.body);
    const [created] = await db.insert(rotationTasksTable).values(body).returning();
    res.status(201).json(serializeTask(created));
  } catch (err) {
    req.log.error({ err }, "Failed to create rotation task");
    res.status(400).json({ error: "Failed to create rotation task" });
  }
});

router.patch("/rotation/tasks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = z.object({
      status: z.string().optional(),
      medResponse: z.string().nullable().optional(),
      loggedNote: z.string().nullable().optional(),
    }).parse(req.body);

    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) {
      updateData.status = body.status;
      updateData.completedAt = body.status === "done" ? new Date() : null;
    }
    if (body.medResponse !== undefined) updateData.medResponse = body.medResponse;
    if (body.loggedNote !== undefined) updateData.loggedNote = body.loggedNote;

    const [updated] = await db.update(rotationTasksTable).set(updateData).where(eq(rotationTasksTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(serializeTask(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update rotation task");
    res.status(400).json({ error: "Failed to update rotation task" });
  }
});

router.delete("/rotation/tasks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(rotationTasksTable).where(eq(rotationTasksTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete rotation task");
    res.status(500).json({ error: "Failed to delete rotation task" });
  }
});

router.get("/rotation/logs", async (req, res) => {
  await ensureSeeded();
  try {
    const logs = await db.select().from(historicalCareLogsTable).orderBy(desc(historicalCareLogsTable.createdAt)).limit(30);
    res.json(logs.map(serializeLog));
  } catch (err) {
    req.log.error({ err }, "Failed to list care logs");
    res.status(500).json({ error: "Failed to list care logs" });
  }
});

router.post("/rotation/logs", async (req, res) => {
  try {
    const body = z.object({
      dateLabel: z.string(),
      wantsRespondedRate: z.number().int().min(0).max(100),
      medAdherence: z.number().int().min(0).max(100),
      soreRotationComplete: z.number().int().min(0).max(100),
      generalNotes: z.string().optional(),
      efficacyScore: z.number().int().min(0).max(10),
    }).parse(req.body);
    const [created] = await db.insert(historicalCareLogsTable).values(body).returning();
    res.status(201).json(serializeLog(created));
  } catch (err) {
    req.log.error({ err }, "Failed to create care log");
    res.status(400).json({ error: "Failed to create care log" });
  }
});

export default router;
