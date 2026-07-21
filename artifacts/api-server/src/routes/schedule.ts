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
import { eq, asc, and } from "drizzle-orm";

const router: IRouter = Router();

function getTenantId(req: any): string {
  const session = req.tenantSession;
  return session?.type === "local" ? "local" : (session?.sub ?? "local");
}

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
    const tenantId = getTenantId(req);
    const tasks = await db
      .select()
      .from(scheduleTasksTable)
      .where(eq(scheduleTasksTable.tenantId, tenantId))
      .orderBy(asc(scheduleTasksTable.order));
    res.json(tasks.map(serializeTask));
  } catch (err) {
    req.log.error({ err }, "Failed to get schedule");
    res.status(500).json({ error: "Failed to get schedule" });
  }
});

router.post("/schedule", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const body = CreateScheduleTaskBody.parse(req.body);
    const [created] = await db
      .insert(scheduleTasksTable)
      .values({ ...body, tenantId })
      .returning();
    res.status(201).json(serializeTask(created));
  } catch (err) {
    req.log.error({ err }, "Failed to create task");
    res.status(400).json({ error: "Failed to create task" });
  }
});

router.put("/schedule/:id", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = UpdateScheduleTaskParams.parse(req.params);
    const body = UpdateScheduleTaskBody.parse(req.body);
    const [updated] = await db
      .update(scheduleTasksTable)
      .set(body)
      .where(and(eq(scheduleTasksTable.id, id), eq(scheduleTasksTable.tenantId, tenantId)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(serializeTask(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update task");
    res.status(400).json({ error: "Failed to update task" });
  }
});

router.delete("/schedule/:id", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = DeleteScheduleTaskParams.parse(req.params);
    await db
      .delete(scheduleTasksTable)
      .where(and(eq(scheduleTasksTable.id, id), eq(scheduleTasksTable.tenantId, tenantId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete task");
    res.status(400).json({ error: "Failed to delete task" });
  }
});

router.post("/schedule/:id/complete", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = CompleteScheduleTaskParams.parse(req.params);
    const [updated] = await db
      .update(scheduleTasksTable)
      .set({ isCompleted: true, completedAt: new Date() })
      .where(and(eq(scheduleTasksTable.id, id), eq(scheduleTasksTable.tenantId, tenantId)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(serializeTask(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to complete task");
    res.status(400).json({ error: "Failed to complete task" });
  }
});

export default router;
