import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  labProtocolsTable,
  labPhasesTable,
  labDrawsTable,
  careEventsTable,
} from "@workspace/db/schema";

// Blood-work tracker — see tasks/lab-tracker-spec.md.
// Invariant 1: drawn ≠ resulted (two completions, two timestamps).
// Invariant 2: overdue never auto-clears — status holds human-actioned state
// only; due/overdue are DERIVED at read time and resolve only via an explicit
// transition (drawn / rescheduled / skipped-with-reason).

const router: IRouter = Router();

const RESULT_WAIT_DAYS = 7;

function getTenantId(req: Request): string {
  const session = req.tenantSession;
  return session?.type === "local" ? "local" : (session?.sub ?? "local");
}

function todayYmd(): string {
  // America/Los_Angeles calendar day — the house runs on PT.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDaysYmd(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

type Alert = "upcoming" | "due" | "overdue" | "awaiting_result" | "closed";

function deriveAlert(draw: typeof labDrawsTable.$inferSelect): Alert {
  const today = todayYmd();
  if (draw.status === "resulted" || draw.status === "skipped" || draw.status === "rescheduled") {
    return "closed";
  }
  if (draw.status === "drawn") {
    if (!draw.drawnAt) return "awaiting_result";
    const drawnDay = new Date(draw.drawnAt).toISOString().slice(0, 10);
    return diffDaysYmd(drawnDay, today) >= RESULT_WAIT_DAYS ? "awaiting_result" : "closed";
  }
  // pending
  if (today < addDaysYmd(draw.dueDate, -draw.windowDays)) return "upcoming";
  if (today <= addDaysYmd(draw.dueDate, draw.windowDays)) return "due";
  return "overdue"; // stays overdue until a human resolves it — never auto-clears
}

// Phase active on a given date: latest effective_from ≤ date; ties broken by
// newest row (deterministic).
async function phaseOn(protocolId: number, ymd: string) {
  const phases = await db.select().from(labPhasesTable)
    .where(and(eq(labPhasesTable.protocolId, protocolId), lte(labPhasesTable.effectiveFrom, ymd)))
    .orderBy(desc(labPhasesTable.effectiveFrom), desc(labPhasesTable.createdAt), desc(labPhasesTable.id))
    .limit(1);
  return phases[0] ?? null;
}

// Next grid point strictly after `afterYmd`: effective_from + k*interval of the
// governing phase. Grid-based, not drift-based — actual drawn_at never shifts it.
async function nextGridDate(protocolId: number, afterYmd: string): Promise<string | null> {
  const phase = await phaseOn(protocolId, afterYmd);
  if (phase) {
    const elapsed = diffDaysYmd(phase.effectiveFrom, afterYmd);
    const k = Math.floor(elapsed / phase.intervalDays) + 1;
    const candidate = addDaysYmd(phase.effectiveFrom, k * phase.intervalDays);
    // A later phase may take over before the candidate lands — re-anchor if so.
    const governing = await phaseOn(protocolId, candidate);
    if (governing && governing.id !== phase.id && governing.effectiveFrom > afterYmd) {
      return governing.effectiveFrom;
    }
    return candidate;
  }
  // No phase yet in effect: first draw lands on the first phase's start.
  const future = await db.select().from(labPhasesTable)
    .where(eq(labPhasesTable.protocolId, protocolId))
    .orderBy(asc(labPhasesTable.effectiveFrom), desc(labPhasesTable.createdAt))
    .limit(1);
  return future[0] && future[0].effectiveFrom > afterYmd ? future[0].effectiveFrom : null;
}

async function writeCareEvent(tenantId: string, eventType: string, payload: Record<string, unknown>) {
  await db.insert(careEventsTable).values({
    tenantId,
    source: "labs",
    actor: "caregiver",
    eventType,
    payload: JSON.stringify(payload),
    outcome: "recorded",
    doctorRelevant: true,
  });
}

// Ensure exactly one future pending draw per active protocol. Skip does NOT
// count as coverage: next draw is the next grid point, full stop.
async function ensureNextDraw(tenantId: string, protocolId: number, windowDays: number) {
  const [protocol] = await db.select().from(labProtocolsTable)
    .where(and(eq(labProtocolsTable.id, protocolId), eq(labProtocolsTable.tenantId, tenantId)));
  if (!protocol || !protocol.active) return null; // deactivated: generate nothing, existing overdue keeps alerting

  const pending = await db.select().from(labDrawsTable)
    .where(and(
      eq(labDrawsTable.protocolId, protocolId),
      eq(labDrawsTable.tenantId, tenantId),
      eq(labDrawsTable.status, "pending"),
    ));
  if (pending.length > 0) return null;

  const latest = await db.select().from(labDrawsTable)
    .where(and(eq(labDrawsTable.protocolId, protocolId), eq(labDrawsTable.tenantId, tenantId)))
    .orderBy(desc(labDrawsTable.dueDate))
    .limit(1);
  const anchor = latest[0]?.dueDate ?? addDaysYmd(todayYmd(), -1);
  const nextDue = await nextGridDate(protocolId, anchor);
  if (!nextDue) return null;

  const [created] = await db.insert(labDrawsTable).values({
    tenantId,
    protocolId,
    dueDate: nextDue,
    windowDays,
    status: "pending",
  }).returning();
  await writeCareEvent(tenantId, "lab_draw_scheduled", { drawId: created.id, protocolId, dueDate: nextDue });
  return created;
}

// ── Protocols ────────────────────────────────────────────────────────────────

router.get("/labs/protocols", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const protocols = await db.select().from(labProtocolsTable)
      .where(eq(labProtocolsTable.tenantId, tenantId))
      .orderBy(asc(labProtocolsTable.id));
    const result = [];
    for (const protocol of protocols) {
      const currentPhase = await phaseOn(protocol.id, todayYmd());
      const nextDraw = await db.select().from(labDrawsTable)
        .where(and(
          eq(labDrawsTable.protocolId, protocol.id),
          eq(labDrawsTable.tenantId, tenantId),
          eq(labDrawsTable.status, "pending"),
        ))
        .orderBy(asc(labDrawsTable.dueDate))
        .limit(1);
      result.push({
        ...protocol,
        currentPhase,
        nextDraw: nextDraw[0] ? { ...nextDraw[0], alert: deriveAlert(nextDraw[0]) } : null,
      });
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list lab protocols");
    res.status(500).json({ error: "Failed to list lab protocols" });
  }
});

router.post("/labs/protocols", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const body = z.object({
      label: z.string().min(1),
      intervalDays: z.number().int().min(1).max(365),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      windowDays: z.number().int().min(0).max(14).optional().default(2),
    }).parse(req.body);

    const [protocol] = await db.insert(labProtocolsTable).values({
      tenantId,
      label: body.label,
      active: true,
    }).returning();
    await db.insert(labPhasesTable).values({
      protocolId: protocol.id,
      intervalDays: body.intervalDays,
      effectiveFrom: body.effectiveFrom,
    });
    await writeCareEvent(tenantId, "lab_protocol_created", {
      protocolId: protocol.id, label: body.label,
      intervalDays: body.intervalDays, effectiveFrom: body.effectiveFrom,
    });
    const firstDraw = await ensureNextDraw(tenantId, protocol.id, body.windowDays);
    res.status(201).json({ ...protocol, firstDraw });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: "Invalid body", details: err.issues }); return; }
    req.log.error({ err }, "Failed to create lab protocol");
    res.status(500).json({ error: "Failed to create lab protocol" });
  }
});

router.post("/labs/protocols/:id/phases", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const protocolId = z.coerce.number().int().parse(req.params["id"]);
    const body = z.object({
      intervalDays: z.number().int().min(1).max(365),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.body);

    const [protocol] = await db.select().from(labProtocolsTable)
      .where(and(eq(labProtocolsTable.id, protocolId), eq(labProtocolsTable.tenantId, tenantId)));
    if (!protocol) { res.status(404).json({ error: "Protocol not found" }); return; }

    const [phase] = await db.insert(labPhasesTable).values({
      protocolId,
      intervalDays: body.intervalDays,
      effectiveFrom: body.effectiveFrom,
    }).returning();
    await writeCareEvent(tenantId, "lab_phase_added", {
      protocolId, phaseId: phase.id,
      intervalDays: body.intervalDays, effectiveFrom: body.effectiveFrom,
    });

    // Regenerate the future pending draw onto the new grid — but never touch a
    // pending draw already due before the new phase begins.
    const pending = await db.select().from(labDrawsTable)
      .where(and(
        eq(labDrawsTable.protocolId, protocolId),
        eq(labDrawsTable.tenantId, tenantId),
        eq(labDrawsTable.status, "pending"),
      ));
    for (const draw of pending) {
      if (draw.dueDate >= body.effectiveFrom) {
        await db.delete(labDrawsTable).where(eq(labDrawsTable.id, draw.id));
      }
    }
    const regenerated = await ensureNextDraw(tenantId, protocolId, pending[0]?.windowDays ?? 2);
    res.status(201).json({ ...phase, regeneratedDraw: regenerated });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: "Invalid body", details: err.issues }); return; }
    req.log.error({ err }, "Failed to add lab phase");
    res.status(500).json({ error: "Failed to add lab phase" });
  }
});

// ── Draws ────────────────────────────────────────────────────────────────────

router.get("/labs/draws", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const query = z.object({
      status: z.enum(["pending", "drawn", "resulted", "skipped", "rescheduled"]).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(req.query);

    const conditions = [eq(labDrawsTable.tenantId, tenantId)];
    if (query.status) conditions.push(eq(labDrawsTable.status, query.status));
    if (query.from) conditions.push(gte(labDrawsTable.dueDate, query.from));
    if (query.to) conditions.push(lte(labDrawsTable.dueDate, query.to));

    const draws = await db.select().from(labDrawsTable)
      .where(and(...conditions))
      .orderBy(asc(labDrawsTable.dueDate), asc(labDrawsTable.id));
    res.json(draws.map((draw) => ({ ...draw, alert: deriveAlert(draw) })));
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: "Invalid query", details: err.issues }); return; }
    req.log.error({ err }, "Failed to list lab draws");
    res.status(500).json({ error: "Failed to list lab draws" });
  }
});

// Tenant-scoped :id lookup — cross-tenant probing 404s, never 403s.
async function findDraw(tenantId: string, id: number) {
  const [draw] = await db.select().from(labDrawsTable)
    .where(and(eq(labDrawsTable.id, id), eq(labDrawsTable.tenantId, tenantId)));
  return draw ?? null;
}

router.post("/labs/draws/:id/drawn", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = z.coerce.number().int().parse(req.params["id"]);
    const draw = await findDraw(tenantId, id);
    if (!draw) { res.status(404).json({ error: "Draw not found" }); return; }
    if (draw.status !== "pending") {
      res.status(409).json({ error: `Cannot mark drawn from status "${draw.status}"` });
      return;
    }
    const [updated] = await db.update(labDrawsTable)
      .set({ status: "drawn", drawnAt: new Date() })
      .where(eq(labDrawsTable.id, id))
      .returning();
    await writeCareEvent(tenantId, "lab_draw_drawn", { drawId: id, protocolId: draw.protocolId, dueDate: draw.dueDate });
    const next = await ensureNextDraw(tenantId, draw.protocolId, draw.windowDays);
    res.json({ ...updated, alert: deriveAlert(updated), nextDraw: next });
  } catch (err) {
    req.log.error({ err }, "Failed to mark lab draw drawn");
    res.status(500).json({ error: "Failed to mark lab draw drawn" });
  }
});

router.post("/labs/draws/:id/resulted", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = z.coerce.number().int().parse(req.params["id"]);
    const draw = await findDraw(tenantId, id);
    if (!draw) { res.status(404).json({ error: "Draw not found" }); return; }
    if (draw.status !== "drawn") {
      res.status(409).json({ error: `Cannot mark resulted from status "${draw.status}" — a result needs a draw first` });
      return;
    }
    const [updated] = await db.update(labDrawsTable)
      .set({ status: "resulted", resultReceivedAt: new Date() })
      .where(eq(labDrawsTable.id, id))
      .returning();
    await writeCareEvent(tenantId, "lab_draw_resulted", { drawId: id, protocolId: draw.protocolId, dueDate: draw.dueDate });
    res.json({ ...updated, alert: deriveAlert(updated) });
  } catch (err) {
    req.log.error({ err }, "Failed to mark lab draw resulted");
    res.status(500).json({ error: "Failed to mark lab draw resulted" });
  }
});

router.post("/labs/draws/:id/skip", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = z.coerce.number().int().parse(req.params["id"]);
    const body = z.object({ reason: z.string().min(1) }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "A reason is required to skip a draw" }); return; }
    const draw = await findDraw(tenantId, id);
    if (!draw) { res.status(404).json({ error: "Draw not found" }); return; }
    if (draw.status !== "pending") {
      res.status(409).json({ error: `Cannot skip from status "${draw.status}"` });
      return;
    }
    const [updated] = await db.update(labDrawsTable)
      .set({ status: "skipped", reason: body.data.reason })
      .where(eq(labDrawsTable.id, id))
      .returning();
    await writeCareEvent(tenantId, "lab_draw_skipped", { drawId: id, protocolId: draw.protocolId, dueDate: draw.dueDate, reason: body.data.reason });
    const next = await ensureNextDraw(tenantId, draw.protocolId, draw.windowDays);
    res.json({ ...updated, alert: deriveAlert(updated), nextDraw: next });
  } catch (err) {
    req.log.error({ err }, "Failed to skip lab draw");
    res.status(500).json({ error: "Failed to skip lab draw" });
  }
});

// Reschedule creates a NEW row; the old one keeps its history (status
// "rescheduled" + reason). Nothing is mutated away.
router.post("/labs/draws/:id/reschedule", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = z.coerce.number().int().parse(req.params["id"]);
    const body = z.object({
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().min(1),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "dueDate and reason are required to reschedule" }); return; }
    const draw = await findDraw(tenantId, id);
    if (!draw) { res.status(404).json({ error: "Draw not found" }); return; }
    if (draw.status !== "pending") {
      res.status(409).json({ error: `Cannot reschedule from status "${draw.status}"` });
      return;
    }
    await db.update(labDrawsTable)
      .set({ status: "rescheduled", reason: body.data.reason })
      .where(eq(labDrawsTable.id, id));
    const [replacement] = await db.insert(labDrawsTable).values({
      tenantId,
      protocolId: draw.protocolId,
      dueDate: body.data.dueDate,
      windowDays: draw.windowDays,
      status: "pending",
    }).returning();
    await writeCareEvent(tenantId, "lab_draw_rescheduled", {
      drawId: id, replacementId: replacement.id, protocolId: draw.protocolId,
      from: draw.dueDate, to: body.data.dueDate, reason: body.data.reason,
    });
    res.json({ ...replacement, alert: deriveAlert(replacement), rescheduledFrom: id });
  } catch (err) {
    req.log.error({ err }, "Failed to reschedule lab draw");
    res.status(500).json({ error: "Failed to reschedule lab draw" });
  }
});

export default router;
