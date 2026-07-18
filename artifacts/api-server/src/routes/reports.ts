import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  symptomLogsTable,
  haldolCycleTable,
  scheduleTasksTable,
  healthDataPointsTable,
  callSessionsTable,
  medicationAdjustmentsTable,
  medicalAppointmentsTable,
} from "@workspace/db/schema";
import { desc, gte, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/reports/clinical", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      symptomLogs,
      haldolRows,
      completedTasks,
      totalTasks,
      dataPoints,
      medAdjustments,
      upcomingAppts,
    ] = await Promise.all([
      db
        .select()
        .from(symptomLogsTable)
        .where(gte(symptomLogsTable.loggedAt, thirtyDaysAgo))
        .orderBy(desc(symptomLogsTable.loggedAt))
        .limit(60),
      db.select().from(haldolCycleTable).limit(1),
      db
        .select()
        .from(scheduleTasksTable)
        .where(eq(scheduleTasksTable.isCompleted, true)),
      db.select().from(scheduleTasksTable),
      db
        .select()
        .from(healthDataPointsTable)
        .where(gte(healthDataPointsTable.createdAt, thirtyDaysAgo))
        .orderBy(desc(healthDataPointsTable.createdAt))
        .limit(200),
      db
        .select()
        .from(medicationAdjustmentsTable)
        .orderBy(desc(medicationAdjustmentsTable.adjustmentDate))
        .limit(20),
      db
        .select()
        .from(medicalAppointmentsTable)
        .orderBy(desc(medicalAppointmentsTable.appointmentDate))
        .limit(10),
    ]);

    const haldol = haldolRows[0] ?? null;
    const complianceRate =
      totalTasks.length > 0
        ? Math.round((completedTasks.length / totalTasks.length) * 100)
        : 0;

    const ptsdDays = symptomLogs.filter((l) => l.ptsdTrigger).length;
    const avgHallucination =
      symptomLogs.length > 0
        ? (
            symptomLogs.reduce((s, l) => s + l.hallucinationIntensity, 0) /
            symptomLogs.length
          ).toFixed(1)
        : "0.0";
    const avgMotivation =
      symptomLogs.length > 0
        ? (
            symptomLogs.reduce((s, l) => s + l.motivationLevel, 0) /
            symptomLogs.length
          ).toFixed(1)
        : "0.0";

    const categoryGroups: Record<string, { flagged: number; total: number }> =
      {};
    for (const dp of dataPoints) {
      if (!categoryGroups[dp.category])
        categoryGroups[dp.category] = { flagged: 0, total: 0 };
      categoryGroups[dp.category].total++;
      if (dp.flagged) categoryGroups[dp.category].flagged++;
    }

    const lines: string[] = [
      "═══════════════════════════════════════════════════",
      "  BR(AI)N CLINICAL DIGEST — DOCTOR REPORT",
      `  Generated: ${new Date().toLocaleString()}`,
      "═══════════════════════════════════════════════════",
      "",
      "── PATIENT OVERVIEW ────────────────────────────",
      "  Patient: Pops (Veteran, DOD: Vietnam Era)",
      "  Diagnoses: PTSD · Schizophrenia · Auditory Hallucinations",
      "  Primary Caregiver: Ray (son)",
      "  Reporting Period: Last 30 days",
      "",
      "── MEDICATION STATUS ───────────────────────────",
      haldol
        ? [
            `  Current Medication: Haldol Decanoate (Haloperidol Decanoate)`,
            `  Last Injection Date: ${haldol.lastInjectionDate}`,
            `  Cycle Notes: ${haldol.notes ?? "None recorded"}`,
          ].join("\n")
        : "  No Haldol cycle data on record.",
      "",
      "── MEDICATION ADJUSTMENTS ──────────────────────",
      medAdjustments.length === 0
        ? "  No adjustments recorded."
        : medAdjustments
            .map(
              (a) =>
                `  ${a.adjustmentDate}  ${a.medication}  ${a.previousDose ?? "?"} → ${a.newDose}  (${a.reason ?? "no reason noted"})  Logged by: ${a.loggedBy}`
            )
            .join("\n"),
      "",
      "── SYMPTOM LOG SUMMARY (30 days) ───────────────",
      `  Total Logged Events: ${symptomLogs.length}`,
      `  PTSD Trigger Days: ${ptsdDays}`,
      `  Avg Hallucination Intensity: ${avgHallucination} / 5`,
      `  Avg Motivation Level: ${avgMotivation} / 5`,
      "",
      "── HEALTH ASSESSMENT TRENDS ────────────────────",
      Object.entries(categoryGroups).length === 0
        ? "  No health assessment data in period."
        : Object.entries(categoryGroups)
            .map(
              ([cat, { flagged, total }]) =>
                `  ${cat.padEnd(20)} ${total} assessments, ${flagged} flagged`
            )
            .join("\n"),
      "",
      "── CARE TASK COMPLIANCE ────────────────────────",
      `  Completed: ${completedTasks.length} / ${totalTasks.length} tasks (${complianceRate}%)`,
      "",
      "── UPCOMING APPOINTMENTS ───────────────────────",
      upcomingAppts.length === 0
        ? "  No appointments on record."
        : upcomingAppts
            .map(
              (a) =>
                `  ${a.appointmentDate} ${a.appointmentTime}  ${a.provider}  [${a.type}]  ${a.location ?? ""}  ${a.notes ?? ""}`
            )
            .join("\n"),
      "",
      "── RECENT SYMPTOM LOG ──────────────────────────",
      symptomLogs.slice(0, 10).length === 0
        ? "  No entries."
        : symptomLogs
            .slice(0, 10)
            .map(
              (l) =>
                `  ${new Date(l.loggedAt).toLocaleDateString()}  PTSD:${l.ptsdTrigger ? "Y" : "N"}  Hall:${l.hallucinationIntensity}/5  Mot:${l.motivationLevel}/5  ${l.behaviorNotes ?? ""}`
            )
            .join("\n"),
      "",
      "═══════════════════════════════════════════════════",
      "  END OF REPORT — br(AI)n Guardian OS",
      "═══════════════════════════════════════════════════",
    ];

    res.json({ report: lines.join("\n"), generatedAt: new Date().toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to generate clinical report");
    res.status(500).json({ error: "Failed to generate clinical report" });
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
    const storeLabel = store === "walmart" ? "Walmart" : store === "stater_bros" ? "Stater Bros" : "Walmart + Stater Bros";
    res.json({ ok: true, zip, store, message: `Connected to ${storeLabel} — zip ${zip} is active` });
  } catch (err) {
    req.log.error({ err }, "Failed to test store connection");
    res.status(500).json({ error: "Test failed" });
  }
});

export default router;
