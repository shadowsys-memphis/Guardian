import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { symptomLogsTable } from "@workspace/db/schema";
import {
  GetSymptomLogsQueryParams,
  CreateSymptomLogBody,
} from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

function getTenantId(req: any): string {
  const session = req.tenantSession;
  return session?.type === "local" ? "local" : (session?.sub ?? "local");
}

function serializeLog(log: typeof symptomLogsTable.$inferSelect) {
  return {
    id: log.id,
    loggedAt: log.loggedAt.toISOString(),
    ptsdTrigger: log.ptsdTrigger,
    hallucinationIntensity: log.hallucinationIntensity,
    motivationLevel: log.motivationLevel,
    behaviorNotes: log.behaviorNotes ?? undefined,
    loggedBy: log.loggedBy,
  };
}

router.get("/symptoms", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { limit } = GetSymptomLogsQueryParams.parse(req.query);
    const logs = await db
      .select()
      .from(symptomLogsTable)
      .where(eq(symptomLogsTable.tenantId, tenantId))
      .orderBy(desc(symptomLogsTable.loggedAt))
      .limit(limit ?? 20);
    res.json(logs.map(serializeLog));
  } catch (err) {
    req.log.error({ err }, "Failed to get symptom logs");
    res.status(500).json({ error: "Failed to get symptom logs" });
  }
});

router.post("/symptoms", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const body = CreateSymptomLogBody.parse(req.body);
    const [created] = await db
      .insert(symptomLogsTable)
      .values({ ...body, tenantId })
      .returning();
    res.status(201).json(serializeLog(created));
  } catch (err) {
    req.log.error({ err }, "Failed to log symptom");
    res.status(400).json({ error: "Failed to log symptom" });
  }
});

export default router;
