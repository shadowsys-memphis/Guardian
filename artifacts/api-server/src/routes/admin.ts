import { Router, type IRouter } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import { z } from "zod";
import { db, haldolCycleTable } from "@workspace/db";
import { DEFAULT_INTERVAL_DAYS } from "../lib/haldol-cycle";

// Both routes in this file are mounted under requireLocalSession (see
// routes/index.ts), not the tenant-accessible core router:
// - /admin/summary reads haldolCycleTable directly (Ray's real, global
//   Haldol dosing interval — no tenant_id column).
// - /assistant has no DB reads, but every call is a billed Gemini request
//   with no per-caller quota. A freely-obtainable session (e.g. the public
//   demo login) must not get unmetered access to a paid AI endpoint, so it
//   stays local-only alongside intake.ts for the same reason.
const router: IRouter = Router();

router.post("/admin/summary", async (req, res) => {
  try {
    const body = z.object({
      tasks: z.array(z.any()),
      logs: z.array(z.any()),
      patientName: z.string().optional().default("Pops"),
      cycleDay: z.number().nullable().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const todayDateStr = new Date().toISOString().split("T")[0];

    // rotation_tasks has no daily reset yet — a task's `status` can still say
    // "done" from a prior day. Only count it as done for THIS summary if it
    // was actually completed today; otherwise the "today's tasks" section
    // would silently reflect stale completions instead of today's progress.
    const tasksSummary = body.tasks
      .map((t: any) => {
        const completedToday = typeof t.completedAt === "string" && t.completedAt.startsWith(todayDateStr);
        const effectiveStatus = t.status === "done" && !completedToday
          ? `PENDING TODAY (last completed ${t.completedAt ? new Date(t.completedAt).toLocaleDateString() : "previously"})`
          : String(t.status).toUpperCase();
        return `- [${String(t.period).toUpperCase()}] ${t.timeSlot} | ${t.category} | ${t.title} → ${effectiveStatus}${t.medResponse ? ` (${t.medResponse})` : ""}${t.loggedNote ? ` — "${t.loggedNote}"` : ""}`;
      })
      .join("\n");

    const logsSummary = body.logs
      .slice(0, 7)
      .map((l: any) =>
        `- ${l.dateLabel}: Wants ${l.wantsRespondedRate}%, Meds ${l.medAdherence}%, Rotation ${l.soreRotationComplete}%, Efficacy ${l.efficacyScore}/10${l.generalNotes ? ` — ${l.generalNotes}` : ""}`
      )
      .join("\n");

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Interval comes from the prescriber-set DB row, never hardcoded — a
    // stale "/14" here made every AI clinical summary claim a biweekly cycle.
    const cycleRows = await db.select({ intervalDays: haldolCycleTable.intervalDays }).from(haldolCycleTable).limit(1);
    const intervalDays = cycleRows[0]?.intervalDays ?? DEFAULT_INTERVAL_DAYS;

    const prompt = `You are a clinical documentation assistant for a home caregiver team. Generate a structured clinical summary report for ${body.patientName}'s caregiver rotation log.

DATE: ${today}
HALDOL CYCLE DAY: ${body.cycleDay ?? "unknown"}/${intervalDays}
${body.notes ? `CAREGIVER NOTES: ${body.notes}` : ""}

TODAY'S ROTATION TASKS:
${tasksSummary || "No tasks logged."}

HISTORICAL EFFICACY (last 7 days):
${logsSummary || "No historical data."}

Generate a clinical summary in markdown with these sections:
## Clinical Summary — ${today}
### Patient Overview
### Today's Rotation Status
### Medication Compliance
### Observed Responses & Behavioral Notes
### Physical Rotation Compliance
### Recommendations
### Caregiver Notes

Be concise, factual, and clinical. Flag any concerns clearly. Use plain language suitable for a doctor review.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 2048 },
    });

    const markdown = response.text ?? "Summary generation failed.";
    res.json({ markdown, generatedAt: new Date().toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to generate clinical summary");
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

router.post("/assistant", async (req, res) => {
  try {
    const body = z.object({
      messages: z.array(z.object({ role: z.string(), content: z.string() })),
      context: z.string().optional(),
    }).parse(req.body);

    if (body.messages.length === 0) {
      res.status(400).json({ error: "No messages provided" });
      return;
    }

    const systemText = `You are the br(AI)n System AI — an intelligent assistant for Raymo, the primary caregiver for Pops (a veteran living with PTSD, Schizophrenia, and Auditory Hallucinations). You help Raymo manage care documentation, analyze patterns, answer clinical questions, and support the caregiving rotation.

Be concise, practical, and empathetic. You understand Haldol cycles, PTSD triggers, and caregiver burnout.${body.context ? `\n\nCURRENT CONTEXT:\n${body.context}` : ""}`;

    const chatHistory: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [
      { role: "user", parts: [{ text: systemText }] },
      { role: "model", parts: [{ text: "Understood. I'm the br(AI)n System AI, ready to help Raymo with care management and documentation." }] },
    ];

    for (const m of body.messages) {
      chatHistory.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: chatHistory,
      config: { maxOutputTokens: 1024 },
    });

    res.json({ reply: response.text ?? "I couldn't generate a response." });
  } catch (err) {
    req.log.error({ err }, "Failed to get assistant response");
    res.status(500).json({ error: "Failed to get assistant response" });
  }
});

export default router;
