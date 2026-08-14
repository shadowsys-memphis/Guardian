import { Router, type IRouter } from "express";
import {
  answerRestRecommendation,
  getDayTypeRow,
  resolveAndStoreDayType,
} from "../lib/day-type";
import { todayPacific } from "../lib/pacific-time";
import { z } from "zod/v4";

const router: IRouter = Router();

function getTenantId(req: any): string {
  const session = req.tenantSession;
  return session?.type === "local" ? "local" : (session?.sub ?? "local");
}

function serialize(row: {
  dayDate: string;
  dayType: string;
  resolvedBy: string;
  reason: string | null;
  pendingRecommendation: string | null;
  recommendationReason: string | null;
}) {
  return {
    dayDate: row.dayDate,
    dayType: row.dayType,
    resolvedBy: row.resolvedBy,
    reason: row.reason ?? null,
    pendingRecommendation: row.pendingRecommendation ?? null,
    recommendationReason: row.recommendationReason ?? null,
  };
}

router.get("/day-type/today", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const today = todayPacific();
    // Resolve on demand if the 5:30am job hasn't fired yet (fresh restart,
    // early-morning dashboard open) — same code path, so no drift.
    const row = (await getDayTypeRow(tenantId, today)) ?? (await resolveAndStoreDayType(tenantId, today));
    res.json(serialize(row));
  } catch (err) {
    req.log.error({ err }, "Failed to get day type");
    res.status(500).json({ error: "Failed to get day type" });
  }
});

router.post("/day-type/today/recommendation", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const body = z.object({ accept: z.boolean() }).parse(req.body);
    const updated = await answerRestRecommendation(tenantId, todayPacific(), body.accept);
    if (!updated) {
      res.status(404).json({ error: "No pending recommendation to answer" });
      return;
    }
    res.json(serialize(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to answer day-type recommendation");
    res.status(400).json({ error: "Failed to answer day-type recommendation" });
  }
});

export default router;
