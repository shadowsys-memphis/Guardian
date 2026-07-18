import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { actionLogsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

async function ensureActionLogsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS action_logs (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      result TEXT NOT NULL DEFAULT '{}',
      conversation_id INTEGER,
      dispatched_by TEXT NOT NULL DEFAULT 'jessica',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

// POST /api/actions/log — record one dispatched action (fire-and-forget safe)
router.post("/actions/log", async (req, res) => {
  try {
    await ensureActionLogsTable();
    const body = z.object({
      type: z.string().min(1),
      payload: z.record(z.unknown()).optional().default({}),
      result: z.record(z.unknown()).optional().default({}),
      conversationId: z.number().int().nullable().optional(),
      dispatchedBy: z.string().optional().default("jessica"),
    }).parse(req.body);

    const [log] = await db.insert(actionLogsTable).values({
      type: body.type,
      payload: JSON.stringify(body.payload),
      result: JSON.stringify(body.result),
      conversationId: body.conversationId ?? null,
      dispatchedBy: body.dispatchedBy,
    }).returning();

    res.status(201).json(log);
  } catch (err) {
    req.log.error({ err }, "Failed to log action");
    res.status(400).json({ error: "Failed to log action" });
  }
});

// GET /api/actions/log?limit=50&type=ADD_EVENT — list recent dispatched actions
router.get("/actions/log", async (req, res) => {
  try {
    await ensureActionLogsTable();
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const typeFilter = typeof req.query.type === "string" && req.query.type ? req.query.type : null;

    const rows = await (typeFilter
      ? db.select().from(actionLogsTable).where(eq(actionLogsTable.type, typeFilter)).orderBy(desc(actionLogsTable.createdAt)).limit(limit)
      : db.select().from(actionLogsTable).orderBy(desc(actionLogsTable.createdAt)).limit(limit)
    );

    res.json(rows.map((r) => ({
      ...r,
      payload: (() => { try { return JSON.parse(r.payload); } catch { return {}; } })(),
      result: (() => { try { return JSON.parse(r.result); } catch { return {}; } })(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list action logs");
    res.status(500).json({ error: "Failed to list action logs" });
  }
});

export default router;
