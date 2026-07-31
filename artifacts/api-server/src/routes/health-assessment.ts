import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  healthQuestionsTable,
  callSessionsTable,
  healthDataPointsTable,
  appSettingsTable,
  symptomLogsTable,
  mealCravingsTable,
} from "@workspace/db";
import { eq, desc, asc, and, gte, lte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { todayPacific } from "../lib/pacific-time";

const router: IRouter = Router();

const DEFAULT_SETTINGS = {
  quietWindowStart: "22:00",
  quietWindowEnd: "07:00",
  engagementIntervalHours: 4,
  dailyCallEnabled: false,
  dailyCallTime: "10:00",
};

const SEED_QUESTIONS = [
  { text: "How'd you sleep last night — okay, rough, or good?", category: "sleep", responseType: "free_text", priority: 9, alwaysAsk: true, higherIsBetter: true },
  { text: "How's your energy today — low, okay, or pretty good?", category: "energy", responseType: "free_text", priority: 9, alwaysAsk: true, higherIsBetter: true },
  { text: "Did you take your morning medications?", category: "medication", responseType: "yes_no", priority: 10, alwaysAsk: true, higherIsBetter: true },
  { text: "How are you feeling overall today — doing alright?", category: "mood", responseType: "free_text", priority: 8, alwaysAsk: true, higherIsBetter: true },
  { text: "Have you eaten anything today?", category: "appetite", responseType: "yes_no", priority: 8, alwaysAsk: true, higherIsBetter: true },
  { text: "Any of those background voices been active today?", category: "voices", responseType: "yes_no", priority: 9, alwaysAsk: true, higherIsBetter: false },
  { text: "If the voices have been around, how loud or bothersome have they been — mild, moderate, or pretty rough?", category: "voices", responseType: "free_text", priority: 7, alwaysAsk: false, cycleDays: "[1,2,3,4,5]", higherIsBetter: false },
  { text: "Have you been feeling any tension or on edge today?", category: "mood", responseType: "yes_no", priority: 7, alwaysAsk: false, higherIsBetter: false },
  { text: "Did you have any nightmares or rough nights?", category: "sleep", responseType: "yes_no", priority: 7, alwaysAsk: false, cycleDays: "[1,2,3,4,5,6,7]", higherIsBetter: false },
  { text: "How's your appetite been — eating okay?", category: "appetite", responseType: "free_text", priority: 6, alwaysAsk: false, higherIsBetter: true },
  { text: "Any headaches or physical discomfort today?", category: "cognition", responseType: "yes_no", priority: 6, alwaysAsk: false, higherIsBetter: false },
  { text: "Have you been able to focus okay, or does your mind feel foggy?", category: "cognition", responseType: "free_text", priority: 7, alwaysAsk: false, higherIsBetter: true },
  { text: "Did you take your evening medications?", category: "medication", responseType: "yes_no", priority: 10, alwaysAsk: true, cycleDays: null, higherIsBetter: true },
  { text: "Have you had any water today — staying hydrated?", category: "appetite", responseType: "yes_no", priority: 5, alwaysAsk: false, higherIsBetter: true },
  { text: "Any moments today where you felt really anxious or overwhelmed?", category: "mood", responseType: "yes_no", priority: 8, alwaysAsk: false, higherIsBetter: false },
  { text: "How are you feeling about your day — anything on your mind?", category: "mood", responseType: "free_text", priority: 6, alwaysAsk: false, higherIsBetter: true },
  { text: "Did you get outside or move around at all today?", category: "energy", responseType: "yes_no", priority: 5, alwaysAsk: false, higherIsBetter: true },
  { text: "Have you been feeling more withdrawn or isolated than usual?", category: "mood", responseType: "yes_no", priority: 7, alwaysAsk: false, cycleDays: "[1,2,3,4,5,6,7]", higherIsBetter: false },
  { text: "Did you complete your scheduled tasks today?", category: "task", responseType: "yes_no", priority: 8, alwaysAsk: true, higherIsBetter: true },
  { text: "Is there anything you need from Raymo today?", category: "task", responseType: "free_text", priority: 6, alwaysAsk: true, higherIsBetter: true },
  { text: "How intense have the voices been on a scale — quiet, mild, or loud?", category: "voices", responseType: "free_text", priority: 8, alwaysAsk: false, cycleDays: "[1,2,3,4,5]", higherIsBetter: false },
  { text: "Any moments of feeling unsafe or really distressed today?", category: "mood", responseType: "yes_no", priority: 10, alwaysAsk: false, higherIsBetter: false },
  { text: "Did you sleep at all, or was it a tough night?", category: "sleep", responseType: "free_text", priority: 8, alwaysAsk: false, cycleDays: "[1,2,3,4,5]", higherIsBetter: true },
  { text: "What did you eat today — anything good?", category: "appetite", responseType: "free_text", priority: 5, alwaysAsk: false, higherIsBetter: true },
  { text: "Are you feeling more tired than usual today?", category: "energy", responseType: "yes_no", priority: 7, alwaysAsk: false, cycleDays: "[1,2,3,4,5,6,7]", higherIsBetter: false },
];

async function ensureSeeded() {
  // Safe migration: add higher_is_better column if not already present
  await db.execute(sql`ALTER TABLE health_questions ADD COLUMN IF NOT EXISTS higher_is_better BOOLEAN NOT NULL DEFAULT TRUE`);

  // Polarity backfill: always ensure negative-polarity questions have higherIsBetter=false
  // (needed for rows seeded before the column existed — column default was TRUE for all)
  const negativeTexts = SEED_QUESTIONS
    .filter((q) => q.higherIsBetter === false)
    .map((q) => q.text);
  if (negativeTexts.length > 0) {
    await db.execute(
      sql`UPDATE health_questions SET higher_is_better = FALSE WHERE text = ANY(${sql.raw(`ARRAY[${negativeTexts.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]`)})`
    );
  }

  const existing = await db.select().from(healthQuestionsTable).limit(1);
  if (existing.length > 0) return;
  await db.insert(healthQuestionsTable).values(
    SEED_QUESTIONS.map((q) => ({
      text: q.text,
      category: q.category,
      responseType: q.responseType ?? "yes_no",
      priority: q.priority,
      alwaysAsk: q.alwaysAsk ?? false,
      cycleDays: (q as any).cycleDays ?? null,
      active: true,
      higherIsBetter: q.higherIsBetter ?? true,
    }))
  );
}

export async function getSettings(): Promise<typeof DEFAULT_SETTINGS> {
  const rows = await db.select().from(appSettingsTable).where(
    eq(appSettingsTable.key, "assessment_settings")
  );
  if (!rows[0]) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(rows[0].value) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getStatusForCategory(dataPoints: { category: string; parsedValue: string | null; parsedIntensity: string | null; flagged: boolean }[], category: string): string {
  const pts = dataPoints.filter((d) => d.category === category);
  if (pts.length === 0) return "unknown";
  if (pts.some((d) => d.flagged)) return "red";
  const hasNegative = pts.some((d) => {
    if (d.parsedValue === "no" && ["medication", "task"].includes(category)) return true;
    if (d.parsedIntensity === "severe" || d.parsedIntensity === "high") return true;
    if (d.parsedValue === "yes" && category === "voices") return true;
    return false;
  });
  if (hasNegative) return "yellow";
  return "green";
}

router.get("/health-assessment/questions", async (req, res) => {
  try {
    await ensureSeeded();
    const questions = await db.select().from(healthQuestionsTable).orderBy(desc(healthQuestionsTable.priority), asc(healthQuestionsTable.id));
    res.json(questions);
  } catch (err) {
    req.log.error({ err }, "Failed to list questions");
    res.status(500).json({ error: "Failed to list questions" });
  }
});

router.post("/health-assessment/questions", async (req, res) => {
  try {
    const body = z.object({
      text: z.string(),
      category: z.string(),
      responseType: z.string().optional().default("yes_no"),
      cycleDays: z.string().nullable().optional(),
      priority: z.number().optional().default(5),
      alwaysAsk: z.boolean().optional().default(false),
      active: z.boolean().optional().default(true),
    }).parse(req.body);
    const [created] = await db.insert(healthQuestionsTable).values(body).returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to create question");
    res.status(400).json({ error: "Failed to create question" });
  }
});

router.put("/health-assessment/questions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = z.object({
      text: z.string().optional(),
      category: z.string().optional(),
      responseType: z.string().optional(),
      cycleDays: z.string().nullable().optional(),
      priority: z.number().optional(),
      alwaysAsk: z.boolean().optional(),
      active: z.boolean().optional(),
    }).parse(req.body);
    const [updated] = await db.update(healthQuestionsTable).set(body).where(eq(healthQuestionsTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update question");
    res.status(400).json({ error: "Failed to update question" });
  }
});

router.delete("/health-assessment/questions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(healthQuestionsTable).where(eq(healthQuestionsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete question");
    res.status(500).json({ error: "Failed to delete question" });
  }
});

router.get("/health-assessment/sessions", async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? "30", 10);
    const sessions = await db.select().from(callSessionsTable).orderBy(desc(callSessionsTable.startedAt)).limit(limit);
    const sessionIds = sessions.map((s) => s.id);
    let countMap: Record<number, number> = {};
    if (sessionIds.length > 0) {
      const counts = await db
        .select({ sessionId: healthDataPointsTable.sessionId, count: sql<number>`cast(count(*) as int)` })
        .from(healthDataPointsTable)
        .where(inArray(healthDataPointsTable.sessionId, sessionIds))
        .groupBy(healthDataPointsTable.sessionId);
      for (const row of counts) {
        if (row.sessionId !== null) countMap[row.sessionId] = row.count;
      }
    }
    const result = sessions.map((s) => ({ ...s, dataPointCount: countMap[s.id] ?? 0 }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list sessions");
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.post("/health-assessment/sessions", async (req, res) => {
  try {
    const body = z.object({
      conversationId: z.number().optional(),
      cycleDay: z.number().optional(),
    }).parse(req.body);
    const today = todayPacific();
    const [session] = await db.insert(callSessionsTable).values({
      conversationId: body.conversationId ?? null,
      sessionDate: today,
      cycleDay: body.cycleDay ?? null,
    }).returning();
    res.status(201).json(session);
  } catch (err) {
    req.log.error({ err }, "Failed to start session");
    res.status(400).json({ error: "Failed to start session" });
  }
});

router.put("/health-assessment/sessions/:id/end", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const dataPoints = await db.select().from(healthDataPointsTable).where(eq(healthDataPointsTable.sessionId, id));
    const categories = [...new Set(dataPoints.map((d) => d.category))];
    const flagged = dataPoints.some((d) => d.flagged);
    const summary = categories.length > 0
      ? `Covered: ${categories.join(", ")}. ${dataPoints.length} data point(s) recorded.${flagged ? " ⚠️ Flagged items." : ""}`
      : "Short check-in. No structured data captured.";
    const [updated] = await db.update(callSessionsTable)
      .set({ endedAt: new Date(), summary, flagged })
      .where(eq(callSessionsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to end session");
    res.status(500).json({ error: "Failed to end session" });
  }
});

router.get("/health-assessment/sessions/:id/data-points", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const dataPoints = await db.select().from(healthDataPointsTable).where(eq(healthDataPointsTable.sessionId, id)).orderBy(asc(healthDataPointsTable.createdAt));
    res.json(dataPoints);
  } catch (err) {
    req.log.error({ err }, "Failed to get data points");
    res.status(500).json({ error: "Failed to get data points" });
  }
});

router.get("/health-assessment/summary/today", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const sessions = await db.select().from(callSessionsTable).where(eq(callSessionsTable.sessionDate, today)).orderBy(desc(callSessionsTable.startedAt));
    if (sessions.length === 0) {
      res.json({ sessionId: null, sessionDate: today, cycleDay: null, dataPoints: [], categoryStatus: {}, flagged: false, totalDataPoints: 0 });
      return;
    }
    const session = sessions[0];
    const dataPoints = await db.select().from(healthDataPointsTable).where(eq(healthDataPointsTable.sessionId, session.id)).orderBy(asc(healthDataPointsTable.createdAt));
    const CATEGORIES = ["mood", "medication", "sleep", "appetite", "cognition", "voices", "energy", "task"];
    const categoryStatus: Record<string, string> = {};
    for (const cat of CATEGORIES) {
      categoryStatus[cat] = getStatusForCategory(dataPoints, cat);
    }
    res.json({
      sessionId: session.id,
      sessionDate: session.sessionDate,
      cycleDay: session.cycleDay,
      lastSessionStartedAt: session.startedAt ? session.startedAt.toISOString() : null,
      dataPoints,
      categoryStatus,
      flagged: session.flagged,
      totalDataPoints: dataPoints.length,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get summary");
    res.status(500).json({ error: "Failed to get summary" });
  }
});

router.get("/health-assessment/anomalies", async (req, res) => {
  try {
    const days30 = new Date();
    days30.setDate(days30.getDate() - 30);
    const dateStr = days30.toISOString().split("T")[0];
    const sessions = await db.select().from(callSessionsTable)
      .where(gte(callSessionsTable.sessionDate, dateStr))
      .orderBy(desc(callSessionsTable.id))
      .limit(5);
    const sessionIds = sessions.map((s) => s.id);
    const sustainedAnomalies: string[] = [];
    const CATS = ["mood", "medication", "sleep", "appetite", "cognition", "voices", "energy", "task"];
    if (sessionIds.length >= 3) {
      const dps = sessionIds.length > 0
        ? await db.select().from(healthDataPointsTable).where(inArray(healthDataPointsTable.sessionId, sessionIds))
        : [];
      for (const cat of CATS) {
        const bySession = new Map<number, { flagged: boolean; values: number[] }>();
        for (const dp of dps.filter((d) => d.category === cat)) {
          if (!bySession.has(dp.sessionId)) bySession.set(dp.sessionId, { flagged: false, values: [] });
          const entry = bySession.get(dp.sessionId)!;
          if (dp.flagged) entry.flagged = true;
          const numVal = dp.parsedValue === "yes" ? 1 : dp.parsedValue === "no" ? 0 : parseFloat(dp.parsedValue ?? "");
          if (!isNaN(numVal)) entry.values.push(numVal);
        }
        let badCount = 0;
        for (const [, entry] of bySession) {
          const avg = entry.values.length > 0 ? entry.values.reduce((a, b) => a + b, 0) / entry.values.length : null;
          if (entry.flagged || (avg !== null && avg < 0.3)) badCount++;
        }
        if (badCount >= 3) sustainedAnomalies.push(cat);
      }
    }
    res.json({ sustainedAnomalies });
  } catch (err) {
    req.log.error({ err }, "Failed to get anomalies");
    res.status(500).json({ error: "Failed to get anomalies" });
  }
});

router.get("/health-assessment/trends", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().split("T")[0];
    const sessions = await db.select().from(callSessionsTable).where(gte(callSessionsTable.sessionDate, cutoff));
    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length === 0) {
      res.json([]);
      return;
    }
    const allPoints = await db.select().from(healthDataPointsTable).where(
      inArray(healthDataPointsTable.sessionId, sessionIds)
    );
    // Build a polarity lookup: questionId -> higherIsBetter
    const questionIds = [...new Set(allPoints.map((p) => p.questionId).filter(Boolean) as number[])];
    const polarityMap: Record<number, boolean> = {};
    if (questionIds.length > 0) {
      const qs = await db.select({ id: healthQuestionsTable.id, higherIsBetter: healthQuestionsTable.higherIsBetter })
        .from(healthQuestionsTable).where(inArray(healthQuestionsTable.id, questionIds));
      for (const q of qs) polarityMap[q.id] = q.higherIsBetter;
    }
    const byDateCategory: Record<string, { date: string; cycleDay: number | null; category: string; values: number[]; count: number; flagged: boolean }> = {};
    for (const session of sessions) {
      const pts = allPoints.filter((p) => p.sessionId === session.id);
      for (const pt of pts) {
        const key = `${session.sessionDate}::${pt.category}`;
        if (!byDateCategory[key]) {
          byDateCategory[key] = { date: session.sessionDate, cycleDay: session.cycleDay ?? null, category: pt.category, values: [], count: 0, flagged: false };
        }
        byDateCategory[key].count++;
        if (pt.flagged) byDateCategory[key].flagged = true;
        const higherIsBetter = pt.questionId ? (polarityMap[pt.questionId] ?? true) : true;
        let rawVal = pt.parsedValue === "yes" ? 1 : pt.parsedValue === "no" ? 0 : parseFloat(pt.parsedValue ?? "");
        if (!isNaN(rawVal)) {
          // Flip score for negative-polarity yes/no questions: yes=bad → score 0, no=good → score 1
          const normalized = (!higherIsBetter && (pt.parsedValue === "yes" || pt.parsedValue === "no")) ? 1 - rawVal : rawVal;
          byDateCategory[key].values.push(normalized);
        }
      }
    }
    const result = Object.values(byDateCategory).map((d) => ({
      date: d.date,
      cycleDay: d.cycleDay,
      category: d.category,
      averageValue: d.values.length > 0 ? d.values.reduce((a, b) => a + b, 0) / d.values.length : null,
      count: d.count,
      flagged: d.flagged,
    })).sort((a, b) => a.date.localeCompare(b.date));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get trends");
    res.status(500).json({ error: "Failed to get trends" });
  }
});

router.get("/health-assessment/settings", async (req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    req.log.error({ err }, "Failed to get settings");
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.put("/health-assessment/settings", async (req, res) => {
  try {
    const body = z.object({
      quietWindowStart: z.string().optional(),
      quietWindowEnd: z.string().optional(),
      engagementIntervalHours: z.number().optional(),
      dailyCallEnabled: z.boolean().optional(),
      dailyCallTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM 24-hour format").optional(),
    }).parse(req.body);
    const current = await getSettings();
    const merged = { ...current, ...body };
    const value = JSON.stringify(merged);
    const existing = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "assessment_settings"));
    if (existing.length > 0) {
      await db.update(appSettingsTable).set({ value, updatedAt: new Date() }).where(eq(appSettingsTable.key, "assessment_settings"));
    } else {
      await db.insert(appSettingsTable).values({ key: "assessment_settings", value });
    }
    res.json(merged);
  } catch (err) {
    req.log.error({ err }, "Failed to update settings");
    res.status(400).json({ error: "Failed to update settings" });
  }
});

export function isInQuietWindow(currentHHMM: string, start: string, end: string): boolean {
  if (start <= end) return currentHHMM >= start && currentHHMM < end;
  return currentHHMM >= start || currentHHMM < end;
}

export async function saveHealthDataPoint(data: {
  sessionId: number;
  questionId?: number | null;
  category: string;
  rawResponse: string;
  parsedValue?: string | null;
  parsedIntensity?: string | null;
  flagged?: boolean;
}) {
  const flagged = data.flagged ?? (
    data.parsedIntensity === "severe" ||
    (data.category === "mood" && data.parsedValue === "unsafe") ||
    (data.category === "voices" && data.parsedIntensity === "severe")
  );
  const [point] = await db.insert(healthDataPointsTable).values({
    sessionId: data.sessionId,
    questionId: data.questionId ?? null,
    category: data.category,
    rawResponse: data.rawResponse,
    parsedValue: data.parsedValue ?? null,
    parsedIntensity: data.parsedIntensity ?? null,
    flagged,
  }).returning();
  return point;
}

const REPORT_CATS = ["mood", "medication", "sleep", "appetite", "cognition", "voices", "energy", "task"];

function buildNarrative(
  sessionCount: number,
  categoryStatus: Record<string, string>,
  flaggedCount: number,
  voiceActiveDays: number,
  period: "week" | "month"
): string {
  const periodWord = period === "week" ? "week" : "month";
  const good = REPORT_CATS.filter((c) => categoryStatus[c] === "green");
  const bad = REPORT_CATS.filter((c) => categoryStatus[c] === "red" || categoryStatus[c] === "yellow");
  let narrative = `Pops had ${sessionCount} check-in call${sessionCount !== 1 ? "s" : ""} this ${periodWord}.`;
  if (good.length > 0) narrative += ` ${good.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")} ${good.length === 1 ? "was" : "were"} generally stable.`;
  if (bad.length > 0) narrative += ` ${bad.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")} ${bad.length === 1 ? "showed" : "showed"} areas of concern and may warrant attention.`;
  if (flaggedCount > 0) narrative += ` There ${flaggedCount === 1 ? "was" : "were"} ${flaggedCount} flagged event${flaggedCount !== 1 ? "s" : ""} this ${periodWord}.`;
  if (voiceActiveDays > 0) narrative += ` Voice activity was reported on ${voiceActiveDays} day${voiceActiveDays !== 1 ? "s" : ""}.`;
  if (sessionCount === 0) narrative = `No check-in calls were recorded this ${periodWord}.`;
  return narrative;
}

router.get("/health-assessment/report/weekly", async (req, res) => {
  try {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStart = weekAgo.toISOString().split("T")[0];
    const weekEnd = now.toISOString().split("T")[0];

    const sessions = await db.select().from(callSessionsTable)
      .where(and(gte(callSessionsTable.sessionDate, weekStart), lte(callSessionsTable.sessionDate, weekEnd)))
      .orderBy(asc(callSessionsTable.sessionDate));
    const sessionIds = sessions.map((s) => s.id);

    const allPoints = sessionIds.length > 0
      ? await db.select().from(healthDataPointsTable).where(inArray(healthDataPointsTable.sessionId, sessionIds))
      : [];

    const categoryStatus: Record<string, string> = {};
    for (const cat of REPORT_CATS) {
      categoryStatus[cat] = getStatusForCategory(allPoints, cat);
    }

    const flaggedEvents = allPoints
      .filter((dp) => dp.flagged)
      .map((dp) => {
        const session = sessions.find((s) => s.id === dp.sessionId);
        return {
          date: session?.sessionDate ?? weekEnd,
          category: dp.category,
          rawResponse: dp.rawResponse,
          parsedValue: dp.parsedValue ?? null,
          parsedIntensity: dp.parsedIntensity ?? null,
          sessionId: dp.sessionId,
        };
      });

    const categoryBreakdown: Record<string, { status: string; sessionCount: number; flaggedCount: number }> = {};
    for (const cat of REPORT_CATS) {
      const pts = allPoints.filter((d) => d.category === cat);
      categoryBreakdown[cat] = {
        status: categoryStatus[cat],
        sessionCount: new Set(pts.map((p) => p.sessionId)).size,
        flaggedCount: pts.filter((p) => p.flagged).length,
      };
    }

    const symptomLogs = await db.select().from(symptomLogsTable)
      .where(gte(symptomLogsTable.loggedAt, weekAgo))
      .orderBy(desc(symptomLogsTable.loggedAt));

    const cravings = await db.select().from(mealCravingsTable)
      .where(gte(mealCravingsTable.createdAt, weekAgo))
      .orderBy(desc(mealCravingsTable.createdAt));
    const foodPreferences = cravings.map((c) => c.mealName);

    const voiceActiveDays = sessions.filter((s) => {
      const pts = allPoints.filter((d) => d.sessionId === s.id && d.category === "voices");
      return pts.some((p) => p.parsedValue === "yes");
    }).length;

    const narrative = buildNarrative(sessions.length, categoryStatus, flaggedEvents.length, voiceActiveDays, "week");

    res.json({
      weekStart,
      weekEnd,
      sessionCount: sessions.length,
      categoryStatus,
      categoryBreakdown,
      flaggedEvents,
      symptomLogs: symptomLogs.map((l) => ({
        loggedAt: l.loggedAt.toISOString(),
        ptsdTrigger: l.ptsdTrigger,
        hallucinationIntensity: l.hallucinationIntensity,
        motivationLevel: l.motivationLevel,
        behaviorNotes: l.behaviorNotes ?? null,
        loggedBy: l.loggedBy,
      })),
      foodPreferences,
      voiceActiveDays,
      narrative,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate weekly report");
    res.status(500).json({ error: "Failed to generate weekly report" });
  }
});

router.get("/health-assessment/report/monthly", async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthStart = thirtyDaysAgo.toISOString().split("T")[0];
    const monthEnd = now.toISOString().split("T")[0];

    const sessions = await db.select().from(callSessionsTable)
      .where(gte(callSessionsTable.sessionDate, monthStart))
      .orderBy(asc(callSessionsTable.sessionDate));
    const sessionIds = sessions.map((s) => s.id);

    const allPoints = sessionIds.length > 0
      ? await db.select().from(healthDataPointsTable).where(inArray(healthDataPointsTable.sessionId, sessionIds))
      : [];

    // Medication adherence: sessions that had medication data with no "no" or flagged
    const sessionsWithMed = sessions.filter((s) => {
      const pts = allPoints.filter((d) => d.sessionId === s.id && d.category === "medication");
      return pts.length > 0;
    });
    const adherentSessions = sessionsWithMed.filter((s) => {
      const pts = allPoints.filter((d) => d.sessionId === s.id && d.category === "medication");
      return !pts.some((p) => p.parsedValue === "no" || p.flagged);
    });
    const medicationAdherenceRate = sessionsWithMed.length > 0
      ? Math.round((adherentSessions.length / sessionsWithMed.length) * 100)
      : null;

    const flaggedDays = new Set(
      allPoints.filter((d) => d.flagged).map((d) => sessions.find((s) => s.id === d.sessionId)?.sessionDate).filter(Boolean)
    ).size;

    const voiceActiveDays = sessions.filter((s) => {
      const pts = allPoints.filter((d) => d.sessionId === s.id && d.category === "voices");
      return pts.some((p) => p.parsedValue === "yes");
    }).length;

    // Build per-category per-day trend data
    const byDateCategory: Record<string, { date: string; category: string; values: number[]; flagged: boolean }> = {};
    for (const session of sessions) {
      const pts = allPoints.filter((p) => p.sessionId === session.id);
      for (const pt of pts) {
        const key = `${session.sessionDate}::${pt.category}`;
        if (!byDateCategory[key]) {
          byDateCategory[key] = { date: session.sessionDate, category: pt.category, values: [], flagged: false };
        }
        if (pt.flagged) byDateCategory[key].flagged = true;
        const rawVal = pt.parsedValue === "yes" ? 1 : pt.parsedValue === "no" ? 0 : parseFloat(pt.parsedValue ?? "");
        if (!isNaN(rawVal)) byDateCategory[key].values.push(rawVal);
      }
    }
    const trendData = Object.values(byDateCategory).map((d) => ({
      date: d.date,
      category: d.category,
      averageValue: d.values.length > 0 ? parseFloat((d.values.reduce((a, b) => a + b, 0) / d.values.length).toFixed(3)) : null,
      flagged: d.flagged,
    })).sort((a, b) => a.date.localeCompare(b.date));

    const categoryStatus: Record<string, string> = {};
    for (const cat of REPORT_CATS) {
      categoryStatus[cat] = getStatusForCategory(allPoints, cat);
    }

    const voiceActiveRate = sessions.length > 0 ? Math.round((voiceActiveDays / sessions.length) * 100) : 0;

    const narrative = buildNarrative(sessions.length, categoryStatus, flaggedDays, voiceActiveDays, "month");

    res.json({
      monthStart,
      monthEnd,
      sessionCount: sessions.length,
      medicationAdherenceRate,
      flaggedDays,
      voiceActiveDays,
      voiceActiveRate,
      categoryStatus,
      trendData,
      narrative,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate monthly report");
    res.status(500).json({ error: "Failed to generate monthly report" });
  }
});

export const AI_MODELS = [
  { id: "gemini", label: "Gemini 2.5 Flash", provider: "gemini", lmStudioModelId: null },
  { id: "qwen35-9b", label: "Qwen3.5 9B (4bit MLX)", provider: "lmstudio", lmStudioModelId: "qwen3.5-9b" },
  { id: "gemma4-12b", label: "Gemma 4 12B (Q6_K)", provider: "lmstudio", lmStudioModelId: "gemma-4-12b" },
  { id: "gemma4-e4b", label: "Gemma 4 E4B (4bit MLX)", provider: "lmstudio", lmStudioModelId: "gemma-4-e4b" },
] as const;

router.get("/ai-model", async (req, res) => {
  try {
    const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "active_ai_model"));
    const activeModel = rows[0]?.value ?? "gemini";
    res.json({ activeModel, models: AI_MODELS });
  } catch (err) {
    req.log.error({ err }, "Failed to get AI model");
    res.status(500).json({ error: "Failed to get AI model" });
  }
});

router.put("/ai-model", async (req, res) => {
  try {
    const { activeModel } = z.object({ activeModel: z.string() }).parse(req.body);
    if (!AI_MODELS.find((m) => m.id === activeModel)) {
      res.status(400).json({ error: `Invalid model. Valid options: ${AI_MODELS.map((m) => m.id).join(", ")}` });
      return;
    }
    const existing = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "active_ai_model"));
    if (existing.length > 0) {
      await db.update(appSettingsTable).set({ value: activeModel, updatedAt: new Date() }).where(eq(appSettingsTable.key, "active_ai_model"));
    } else {
      await db.insert(appSettingsTable).values({ key: "active_ai_model", value: activeModel });
    }
    res.json({ activeModel, models: AI_MODELS });
  } catch (err) {
    req.log.error({ err }, "Failed to set AI model");
    res.status(400).json({ error: "Failed to set AI model" });
  }
});

router.get("/ai-model/lm-studio-url", async (req, res) => {
  try {
    const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "lm_studio_url"));
    const url = rows[0]?.value ?? process.env.LM_STUDIO_URL ?? "http://localhost:1234";
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, "Failed to get LM Studio URL");
    res.status(500).json({ error: "Failed to get LM Studio URL" });
  }
});

router.put("/ai-model/lm-studio-url", async (req, res) => {
  try {
    const { url } = z.object({ url: z.string() }).parse(req.body);
    const existing = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "lm_studio_url"));
    if (existing.length > 0) {
      await db.update(appSettingsTable).set({ value: url, updatedAt: new Date() }).where(eq(appSettingsTable.key, "lm_studio_url"));
    } else {
      await db.insert(appSettingsTable).values({ key: "lm_studio_url", value: url });
    }
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, "Failed to save LM Studio URL");
    res.status(400).json({ error: "Failed to save LM Studio URL" });
  }
});

router.get("/ai-model/test-connection", async (req, res) => {
  try {
    let baseUrl = typeof req.query.url === "string" && req.query.url ? req.query.url : null;
    if (!baseUrl) {
      const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "lm_studio_url"));
      baseUrl = rows[0]?.value ?? process.env.LM_STUDIO_URL ?? "http://localhost:1234";
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json() as { data?: Array<{ id: string }> };
        const modelIds = (data?.data ?? []).map((m) => m.id);
        res.json({ connected: true, url: baseUrl, modelCount: modelIds.length, modelIds });
      } else {
        res.json({ connected: false, url: baseUrl, error: `HTTP ${response.status}`, modelIds: [] });
      }
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const isAbort = fetchErr instanceof Error && fetchErr.name === "AbortError";
      res.json({ connected: false, url: baseUrl, error: isAbort ? "Connection timed out" : "LM Studio not running — check that it's open", modelIds: [] });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to test LM Studio connection");
    res.status(500).json({ error: "Failed to test connection" });
  }
});

export async function getActiveQuestionsForCycleDay(cycleDay: number | null): Promise<{ id: number; text: string; category: string; responseType: string; higherIsBetter: boolean }[]> {
  await ensureSeeded();
  const questions = await db.select().from(healthQuestionsTable).where(eq(healthQuestionsTable.active, true)).orderBy(desc(healthQuestionsTable.priority));
  return questions.filter((q) => {
    if (q.alwaysAsk) return true;
    if (!q.cycleDays) return true;
    if (cycleDay === null) return false;
    try {
      const days: number[] = JSON.parse(q.cycleDays);
      return days.includes(cycleDay);
    } catch {
      return false;
    }
  }).map((q) => ({
    id: q.id,
    text: q.text,
    category: q.category,
    responseType: q.responseType,
    higherIsBetter: q.higherIsBetter,
  }));
}

export default router;
