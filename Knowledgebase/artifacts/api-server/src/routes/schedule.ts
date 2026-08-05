import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { scheduleTasksTable } from "@workspace/db/schema";
import {
  CreateScheduleTaskBody,
  UpdateScheduleTaskBody,
  UpdateScheduleTaskParams,
  DeleteScheduleTaskParams,
  CompleteScheduleTaskParams,
} from "@workspace/api-zod";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

function serializeTask(task: typeof scheduleTasksTable.$inferSelect) {
  return {
    id: task.id,
    quarter: task.quarter,
    timeLabel: task.timeLabel,
    title: task.title,
    description: task.description ?? undefined,
    voiceScript: task.voiceScript ?? undefined,
    isCompleted: task.isCompleted,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    order: task.order,
    isActive: task.isActive,
  };
}

router.get("/schedule", async (req, res) => {
  try {
    const tasks = await db
      .select()
      .from(scheduleTasksTable)
      .orderBy(asc(scheduleTasksTable.order));
    res.json(tasks.map(serializeTask));
  } catch (err) {
    req.log.error({ err }, "Failed to get schedule");
    res.status(500).json({ error: "Failed to get schedule" });
  }
});

router.post("/schedule", async (req, res) => {
  try {
    const body = CreateScheduleTaskBody.parse(req.body);
    const [created] = await db.insert(scheduleTasksTable).values(body).returning();
    res.status(201).json(serializeTask(created));
  } catch (err) {
    req.log.error({ err }, "Failed to create task");
    res.status(400).json({ error: "Failed to create task" });
  }
});

router.put("/schedule/:id", async (req, res) => {
  try {
    const { id } = UpdateScheduleTaskParams.parse(req.params);
    const body = UpdateScheduleTaskBody.parse(req.body);
    const [updated] = await db
      .update(scheduleTasksTable)
      .set(body)
      .where(eq(scheduleTasksTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Task not found" });
    res.json(serializeTask(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update task");
    res.status(400).json({ error: "Failed to update task" });
  }
});

router.delete("/schedule/:id", async (req, res) => {
  try {
    const { id } = DeleteScheduleTaskParams.parse(req.params);
    await db.delete(scheduleTasksTable).where(eq(scheduleTasksTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete task");
    res.status(400).json({ error: "Failed to delete task" });
  }
});

router.post("/schedule/:id/complete", async (req, res) => {
  try {
    const { id } = CompleteScheduleTaskParams.parse(req.params);
    const [updated] = await db
      .update(scheduleTasksTable)
      .set({ isCompleted: true, completedAt: new Date() })
      .where(eq(scheduleTasksTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Task not found" });
    res.json(serializeTask(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to complete task");
    res.status(400).json({ error: "Failed to complete task" });
  }
});

export default router;
