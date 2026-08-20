import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appStateTable, scheduleTasksTable } from "@workspace/db/schema";
import { UpdateAppStateBody } from "@workspace/api-zod";
import { eq, and, asc } from "drizzle-orm";
import { pacificNow } from "../lib/pacific-time";
import { quarterForHour } from "../lib/jessica-tools";

const router: IRouter = Router();

// Ray's quarter boundaries live in quarterForHour (lib/jessica-tools.ts;
// mirrored by computeQuarterForHour in lib/call-scheduler.ts). Evaluated
// against Pacific wall-clock — the old new Date().getHours() here was the
// server's UTC hour, which put the computed quarter ~7h ahead of Ray's day
// and fought the (Pacific-correct) quarter auto-advance job all day long.
function computeCurrentQuarter(): "Q1" | "Q2" | "Q3" | "Q4" {
  return quarterForHour(pacificNow().hour);
}

/** tenantId is "local" for Ray's session or the tenant UUID for subscribers. */
function getTenantId(req: any): string {
  const session = req.tenantSession;
  return session?.type === "local" ? "local" : (session?.sub ?? "local");
}

async function ensureState(tenantId: string) {
  const rows = await db
    .select()
    .from(appStateTable)
    .where(eq(appStateTable.tenantId, tenantId))
    .limit(1);
  if (rows.length === 0) {
    await db.insert(appStateTable).values({
      tenantId,
      currentQuarter: "Q1",
      zombieMode: false,
      motivationLevel: 3,
      activeMessage: "Good morning, friend. Let's take it one step at a time.",
    });
    const created = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.tenantId, tenantId))
      .limit(1);
    return created[0];
  }
  return rows[0];
}

function serializeTask(task: typeof scheduleTasksTable.$inferSelect) {
  return {
    id: task.id,
    quarter: task.quarter as "Q1" | "Q2" | "Q3" | "Q4",
    timeLabel: task.timeLabel,
    title: task.title,
    description: task.description ?? undefined,
    voiceScript: task.voiceScript ?? undefined,
    isCompleted: task.isCompleted,
    completedAt: task.completedAt?.toISOString() ?? null,
    order: task.order,
    isActive: task.isActive,
  };
}

async function fetchCurrentTask(quarter: "Q1" | "Q2" | "Q3" | "Q4", tenantId: string) {
  const tasks = await db
    .select()
    .from(scheduleTasksTable)
    .where(
      and(
        eq(scheduleTasksTable.tenantId, tenantId),
        eq(scheduleTasksTable.quarter, quarter),
        eq(scheduleTasksTable.isActive, true)
      )
    )
    .orderBy(asc(scheduleTasksTable.order))
    .limit(1);
  return tasks.length > 0 ? serializeTask(tasks[0]) : null;
}

async function serializeState(state: typeof appStateTable.$inferSelect, tenantId: string) {
  const computed = computeCurrentQuarter();
  const effective = (state.quarterOverride as "Q1" | "Q2" | "Q3" | "Q4" | null) ?? computed;
  const currentScheduledTask = await fetchCurrentTask(effective, tenantId);
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
    currentScheduledTask,
  };
}

router.get("/state", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const state = await ensureState(tenantId);
    res.json(await serializeState(state, tenantId));
  } catch (err) {
    req.log.error({ err }, "Failed to get app state");
    res.status(500).json({ error: "Failed to get state" });
  }
});

router.put("/state", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const body = UpdateAppStateBody.parse(req.body);
    const state = await ensureState(tenantId);

    const updatePayload: Record<string, unknown> = { lastUpdated: new Date() };
    if (body.zombieMode !== undefined) updatePayload.zombieMode = body.zombieMode;
    if (body.motivationLevel !== undefined) updatePayload.motivationLevel = body.motivationLevel;
    if ("activeMessage" in body) updatePayload.activeMessage = body.activeMessage ?? null;
    if (body.notes !== undefined) updatePayload.notes = body.notes;
    if ("quarterOverride" in body) updatePayload.quarterOverride = body.quarterOverride ?? null;

    const [updated] = await db
      .update(appStateTable)
      .set(updatePayload)
      .where(and(eq(appStateTable.id, state.id), eq(appStateTable.tenantId, tenantId)))
      .returning();
    res.json(await serializeState(updated, tenantId));
  } catch (err) {
    req.log.error({ err }, "Failed to update app state");
    res.status(400).json({ error: "Failed to update state" });
  }
});

export default router;
