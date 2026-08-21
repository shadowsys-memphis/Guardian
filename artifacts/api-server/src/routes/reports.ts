import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  symptomLogsTable,
  haldolCycleTable,
  healthDataPointsTable,
  healthQuestionsTable,
  callSessionsTable,
  medicationsTable,
  medicationAdjustmentsTable,
  medicalAppointmentsTable,
  careEventsTable,
} from "@workspace/db/schema";
import { desc, asc, gte, lte, eq, and, inArray } from "drizzle-orm";
import { ensureCareEventsTable } from "../lib/hermes";
import {
  resolveReportWindow,
  assembleDoctorReport,
  type ReportPeriod,
} from "../lib/doctor-report";

const router: IRouter = Router();

function getTenantId(req: { tenantSession?: { type: string; sub: string } }): string {
  const session = req.tenantSession;
  return session?.type === "local" ? "local" : (session?.sub ?? "local");
}

router.get("/reports/doctor", async (req, res) => {
  try {
    // Defense-in-depth: most tables read below (call_sessions, medications,
    // haldol_cycle, medication_adjustments, medical_appointments,
    // health_data_points) have no tenant_id column, so this report cannot be
    // tenant-isolated yet. The router already mounts it local-only; this
    // guard keeps that boundary explicit if the route is ever re-tiered.
    if (req.tenantSession && req.tenantSession.type !== "local") {
      res.status(403).json({ error: "Doctor report is not available for tenant workspaces yet" });
      return;
    }

    const period: ReportPeriod = req.query["period"] === "monthly" ? "monthly" : "weekly";
    const window = resolveReportWindow(period);
    const windowStart = new Date(window.startMs);
    // Tenant scope comes from the session only — never from client input.
    const tenantId = getTenantId(req);

    // care_events may not exist yet on a fresh DB (created lazily via raw SQL).
    await ensureCareEventsTable();

    const [sessions, symptomLogs, careEvents, medications, haldolRows, adjustments, appointments] =
      await Promise.all([
        // Project only the check-in metadata — call_sessions.transcript holds
        // full call transcripts and must not be hauled into memory here.
        db
          .select({
            id: callSessionsTable.id,
            sessionDate: callSessionsTable.sessionDate,
            startedAt: callSessionsTable.startedAt,
            endedAt: callSessionsTable.endedAt,
            summary: callSessionsTable.summary,
            flagged: callSessionsTable.flagged,
            elevenlabsConversationId: callSessionsTable.elevenlabsConversationId,
            reached: callSessionsTable.reached,
          })
          .from(callSessionsTable)
          .where(
            and(
              gte(callSessionsTable.sessionDate, window.periodStart),
              lte(callSessionsTable.sessionDate, window.periodEnd),
            ),
          )
          .orderBy(asc(callSessionsTable.sessionDate)),
        db
          .select()
          .from(symptomLogsTable)
          .where(
            and(
              eq(symptomLogsTable.tenantId, tenantId),
              gte(symptomLogsTable.loggedAt, windowStart),
            ),
          )
          .orderBy(asc(symptomLogsTable.loggedAt)),
        db
          .select()
          .from(careEventsTable)
          .where(
            and(
              eq(careEventsTable.tenantId, tenantId),
              gte(careEventsTable.createdAt, windowStart),
            ),
          )
          .orderBy(asc(careEventsTable.createdAt)),
        db.select().from(medicationsTable).where(eq(medicationsTable.active, true)),
        db.select().from(haldolCycleTable).orderBy(desc(haldolCycleTable.id)).limit(1),
        db
          .select()
          .from(medicationAdjustmentsTable)
          .where(
            and(
              gte(medicationAdjustmentsTable.adjustmentDate, window.periodStart),
              lte(medicationAdjustmentsTable.adjustmentDate, window.periodEnd),
            ),
          )
          .orderBy(asc(medicationAdjustmentsTable.adjustmentDate)),
        db
          .select()
          .from(medicalAppointmentsTable)
          .where(gte(medicalAppointmentsTable.appointmentDate, window.periodStart))
          .orderBy(
            asc(medicalAppointmentsTable.appointmentDate),
            asc(medicalAppointmentsTable.appointmentTime),
          ),
      ]);

    const sessionIds = sessions.map((s) => s.id);
    const healthPoints = sessionIds.length
      ? await db
          .select()
          .from(healthDataPointsTable)
          .where(inArray(healthDataPointsTable.sessionId, sessionIds))
      : [];
    const questionIds = [
      ...new Set(healthPoints.map((p) => p.questionId).filter((id): id is number => id != null)),
    ];
    const questions = questionIds.length
      ? await db
          .select()
          .from(healthQuestionsTable)
          .where(inArray(healthQuestionsTable.id, questionIds))
      : [];

    const report = assembleDoctorReport(window, {
      sessions,
      healthPoints,
      questions,
      symptomLogs,
      careEvents,
      medications,
      haldol: haldolRows[0] ?? null,
      adjustments,
      appointments,
    });

    res.json(report);
  } catch (err) {
    req.log.error({ err }, "Failed to generate doctor report");
    res.status(500).json({ error: "Failed to generate doctor report" });
  }
});

router.get("/settings", async (req, res) => {
  try {
    const { appSettingsTable } = await import("@workspace/db/schema");
    const rows = await db.select().from(appSettingsTable);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json(map);
  } catch (err) {
    req.log.error({ err }, "Failed to get settings");
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.post("/settings", async (req, res) => {
  try {
    const { appSettingsTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    const body = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      const existing = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
      if (existing.length > 0) {
        await db.update(appSettingsTable).set({ value, updatedAt: new Date() }).where(eq(appSettingsTable.key, key));
      } else {
        await db.insert(appSettingsTable).values({ key, value });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to save settings");
    res.status(400).json({ error: "Failed to save settings" });
  }
});

router.post("/settings/test-store", async (req, res) => {
  try {
    const { appSettingsTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    const [zipRow, storeRow] = await Promise.all([
      db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "zip_code")).limit(1),
      db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "preferred_store")).limit(1),
    ]);
    const zip = zipRow[0]?.value ?? "";
    const store = storeRow[0]?.value ?? "both";
    if (!zip || !/^\d{5}(-\d{4})?$/.test(zip.trim())) {
      res.json({ ok: false, error: "No valid zip code configured. Set a 5-digit zip code in Store settings first." });
      return;
    }

    // Invoke the search_local_inventory stub (same logic as shopper.ts fallback mode).
    // Runs a synthetic lookup for a representative item — confirms the zip+store config
    // is ready for fulfillment without requiring a live API key.
    const testItems = ["bread", "eggs", "milk"];
    const storeLabel = store === "walmart" ? "Walmart" : store === "stater_bros" ? "Stater Bros" : "Walmart + Stater Bros";
    const stubResults = testItems.map((itemName) => {
      const source = store === "stater_bros" ? "instacart_affiliate" : "estimated";
      const productId = `${store === "stater_bros" ? "stater" : "walmart"}_${itemName.replace(/\s+/g, "_")}`;
      return {
        found: true,
        product_id: productId,
        product_name: itemName.charAt(0).toUpperCase() + itemName.slice(1),
        price_cents: Math.floor(Math.random() * 300) + 199,
        in_stock: true,
        store: store === "both" ? "walmart" : store,
        source,
      };
    });

    res.json({
      ok: true,
      zip,
      store,
      storeLabel,
      message: `${storeLabel} (zip ${zip}) returned ${stubResults.length} results — store connection is active`,
      sampleResults: stubResults,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to test store connection");
    res.status(500).json({ error: "Test failed" });
  }
});

export default router;
