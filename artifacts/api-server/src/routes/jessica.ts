import { Router, type IRouter, type Request, type Response } from "express";
import { requireLocalSession } from "../middlewares/tenant-auth";
import { db, pool } from "@workspace/db";
import {
  callSessionsTable,
  conversations as conversationsTable,
  healthDataPointsTable,
  appSettingsTable,
  mealCravingsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { saveHealthDataPoint, getActiveQuestionsForCycleDay } from "./health-assessment";
import { buildJessicaSystemPrompt, getCurrentCycleInfo, loadLiveContext } from "./gemini";
import { todayPacific } from "../lib/pacific-time";

const router: IRouter = Router();

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

function getElevenLabsKey(): string | null {
  return process.env["ELEVENLABS_API_KEY"] ?? null;
}

function getAgentId(): string | null {
  return process.env["ELEVENLABS_AGENT_ID"] ?? null;
}

function getPhoneNumberId(): string | null {
  return process.env["ELEVENLABS_PHONE_NUMBER_ID"] ?? null;
}

/**
 * ElevenLabs needs its internal `phnum_…` ID, but the env var may hold the
 * Twilio SID (starts with "PN"). This function fetches the phone-numbers list
 * and resolves the correct internal ID automatically.
 */
async function resolveElevenLabsPhoneNumberId(apiKey: string, storedId: string): Promise<string> {
  // Already an ElevenLabs internal ID — use it directly.
  if (storedId.startsWith("phnum_")) return storedId;

  try {
    const res = await fetch(`${ELEVENLABS_BASE}/convai/phone-numbers`, {
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) return storedId;
    const list = await res.json() as Array<{ phone_number: string; phone_number_id: string }>;
    const match = list.find((p) => p.phone_number === storedId || p.phone_number_id === storedId);
    if (match) return match.phone_number_id;
  } catch {}

  return storedId;
}

async function getPopsPhonenumber(): Promise<string | null> {
  try {
    const rows = await db.select().from(appSettingsTable)
      .where(eq(appSettingsTable.key, "pops_phone_number"));
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

function parseHealthDataTags(text: string): Array<{
  category: string;
  questionId: number | null;
  parsedValue: string | null;
  parsedIntensity: string | null;
  rawResponse: string;
}> {
  const results: Array<{
    category: string;
    questionId: number | null;
    parsedValue: string | null;
    parsedIntensity: string | null;
    rawResponse: string;
  }> = [];
  const regex = /<health_data>([\s\S]*?)<\/health_data>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const qid = parsed.questionId ? parseInt(String(parsed.questionId), 10) : null;
      results.push({
        category: parsed.category ?? "mood",
        questionId: qid && qid > 0 ? qid : null,
        parsedValue: parsed.parsedValue ?? null,
        parsedIntensity: parsed.parsedIntensity ?? null,
        rawResponse: parsed.rawResponse ?? "",
      });
    } catch {}
  }
  return results;
}

function parseCravingTag(text: string): string | null {
  const match = text.match(/<craving>([\s\S]*?)<\/craving>/);
  if (!match) return null;
  try { return JSON.parse(match[1])?.meal ?? null; } catch { return null; }
}

export type OutboundCallResult =
  | { ok: true; elevenLabsConversationId: string; sessionId: number; conversationId: number }
  | { ok: false; status: number; error: string; message?: string };

/**
 * Core outbound-call logic shared by the manual "Call Now" route and the
 * daily call scheduler (lib/call-scheduler.ts). Never throws — always
 * resolves to a result object so the scheduler's tick loop can log and
 * move on instead of crashing the interval.
 */
export async function triggerOutboundCall(opts?: { test?: boolean; extraContext?: string }): Promise<OutboundCallResult> {
  try {
    const apiKey = getElevenLabsKey();
    const agentId = getAgentId();
    const rawPhoneNumberId = getPhoneNumberId();

    if (!apiKey || !agentId || !rawPhoneNumberId) {
      return {
        ok: false,
        status: 503,
        error: "elevenlabs_not_configured",
        message: "ElevenLabs credentials not configured. Set ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and ELEVENLABS_PHONE_NUMBER_ID.",
      };
    }

    const phoneNumberId = await resolveElevenLabsPhoneNumberId(apiKey, rawPhoneNumberId);

    let targetPhone: string | null = null;

    if (opts?.test) {
      targetPhone = process.env["ADMIN_PHONE_NUMBER"] ?? null;
      if (!targetPhone) {
        return { ok: false, status: 400, error: "no_admin_phone", message: "ADMIN_PHONE_NUMBER secret is not set." };
      }
    } else {
      targetPhone = await getPopsPhonenumber();
      if (!targetPhone) {
        return {
          ok: false,
          status: 400,
          error: "no_phone_number",
          message: "Pops' phone number is not set. Add it in Settings → Jessica.",
        };
      }
    }

    const { cycleDay, isZombiePhase, isOverdue, daysOverdue, intervalDays, zombiePhaseDays } = await getCurrentCycleInfo();
    const questions = await getActiveQuestionsForCycleDay(cycleDay);

    const careContextLines: string[] = [];
    try {
      const settingRows = await db.select().from(appSettingsTable)
        .where(eq(appSettingsTable.key, "dietary_profile"));
      const dietRow = settingRows[0];
      if (dietRow?.value) {
        const diet = JSON.parse(dietRow.value) as { restrictions?: string[]; source?: string };
        if (diet.restrictions?.length) {
          careContextLines.push(`DIETARY RESTRICTIONS (from ${diet.source ?? "care record"}): ${diet.restrictions.join(", ")}. Mention this casually when food or meals come up — do not make it a lecture.`);
        }
      }
    } catch {}

    try {
      const settingRows = await db.select().from(appSettingsTable)
        .where(eq(appSettingsTable.key, "activity_restrictions"));
      const actRow = settingRows[0];
      if (actRow?.value) {
        const act = JSON.parse(actRow.value) as { restrictions?: string[]; source?: string };
        if (act.restrictions?.length) {
          careContextLines.push(`ACTIVITY RESTRICTIONS (from ${act.source ?? "care record"}): ${act.restrictions.join("; ")}. Gently remind Pops of these if relevant — keep it natural, not clinical.`);
        }
      }
    } catch {}

    // Same live schedule/meals/symptoms context the web-chat Jessica gets —
    // without this the phone call couldn't answer schedule questions.
    const scheduleContext = await loadLiveContext();
    const careContextBlock = careContextLines.length > 0
      ? `CURRENT CARE CONTEXT — IMPORTANT:\n${careContextLines.join("\n")}\n\n`
      : "";
    // Scheduled jobs (appointment reminders, overdue-Haldol nudges) inject a
    // purpose for the call here — see lib/call-scheduler.ts.
    const extraBlock = opts?.extraContext ? `${opts.extraContext}\n\n` : "";
    const liveContext = extraBlock + careContextBlock + scheduleContext;

    const systemPrompt = buildJessicaSystemPrompt(questions, cycleDay, isZombiePhase, liveContext, { isOverdue, daysOverdue, intervalDays, zombiePhaseDays });

    const elevenLabsBody = {
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: targetPhone,
      conversation_config_override: {
        agent: {
          prompt: {
            prompt: systemPrompt,
          },
        },
      },
    };

    const elRes = await fetch(`${ELEVENLABS_BASE}/convai/twilio/outbound-call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(elevenLabsBody),
    });

    if (!elRes.ok) {
      const errBody = await elRes.text().catch(() => "unknown");
      return { ok: false, status: 502, error: "ElevenLabs call failed", message: errBody };
    }

    const elData = await elRes.json() as { conversation_id: string };
    const conversationId = elData.conversation_id;

    const today = todayPacific();

    const [convo] = await db.insert(conversationsTable).values({
      title: `Outbound Call — Pops — ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", hour12: true, month: "short", day: "numeric" })}`,
    }).returning();

    const [session] = await db.insert(callSessionsTable).values({
      conversationId: convo.id,
      sessionDate: today,
      cycleDay: cycleDay ?? null,
      // Not yet confirmed reached — the webhook flips this to true once the
      // transcript shows Pops actually responded.
      reached: false,
    }).returning();

    await pool.query(
      `UPDATE call_sessions SET elevenlabs_conversation_id = $1 WHERE id = $2`,
      [conversationId, session.id]
    );

    return {
      ok: true,
      elevenLabsConversationId: conversationId,
      sessionId: session.id,
      conversationId: convo.id,
    };
  } catch (err) {
    return { ok: false, status: 500, error: "Failed to initiate call", message: err instanceof Error ? err.message : String(err) };
  }
}

router.post("/jessica/outbound-call", requireLocalSession, async (req: Request, res: Response) => {
  const result = await triggerOutboundCall({ test: req.body?.test === true });
  if (!result.ok) {
    if (result.status >= 500) req.log.error({ result }, "Failed to initiate outbound call");
    res.status(result.status).json({ error: result.error, message: result.message });
    return;
  }
  res.json(result);
});

router.get("/jessica/call-status/:conversationId", requireLocalSession, async (req: Request, res: Response) => {
  try {
    const { conversationId } = z.object({ conversationId: z.string().min(1) }).parse(req.params);
    const apiKey = getElevenLabsKey();
    if (!apiKey) {
      res.status(503).json({ error: "ElevenLabs not configured" });
      return;
    }

    const elRes = await fetch(`${ELEVENLABS_BASE}/convai/conversations/${conversationId}`, {
      headers: { "xi-api-key": apiKey },
    });

    if (!elRes.ok) {
      res.status(elRes.status).json({ error: "Failed to fetch call status" });
      return;
    }

    const data = await elRes.json() as {
      conversation_id: string;
      status: string;
      transcript?: Array<{ role: string; message: string }>;
      metadata?: Record<string, unknown>;
      analysis?: { transcript_summary?: string };
    };

    const sessionResult = await pool.query(
      `SELECT id, ended_at, summary, flagged FROM call_sessions WHERE elevenlabs_conversation_id = $1 ORDER BY id DESC LIMIT 1`,
      [conversationId]
    );
    const session = sessionResult.rows[0] ?? null;

    res.json({
      conversationId: data.conversation_id,
      status: data.status,
      ended: data.status === "done" || data.status === "failed" || !!session?.ended_at,
      summary: session?.summary ?? data.analysis?.transcript_summary ?? null,
      flagged: session?.flagged ?? false,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get call status");
    res.status(500).json({ error: "Failed to get call status" });
  }
});

const webhookTranscriptItemSchema = z.object({
  role: z.string(),
  message: z.string(),
  time_in_call_secs: z.number().optional(),
});

const webhookPayloadSchema = z.object({
  type: z.string().optional(),
  data: z.object({
    conversation_id: z.string(),
    status: z.string().optional(),
    transcript: z.array(webhookTranscriptItemSchema).optional(),
    analysis: z.object({
      transcript_summary: z.string().optional(),
    }).optional(),
    metadata: z.record(z.unknown()).optional(),
  }).optional(),
}).passthrough();

router.post("/jessica/elevenlabs-webhook", async (req: Request, res: Response) => {
  try {
    const parsed = webhookPayloadSchema.safeParse(req.body);

    if (!parsed.success || !parsed.data.data?.conversation_id) {
      res.json({ received: true });
      return;
    }

    const { data: webhookData } = parsed.data;
    const elevenLabsConversationId = webhookData.conversation_id;
    const transcript = webhookData.transcript ?? [];
    const summary = webhookData.analysis?.transcript_summary ?? null;

    const sessionResult = await pool.query(
      `SELECT id, ended_at FROM call_sessions WHERE elevenlabs_conversation_id = $1 ORDER BY id DESC LIMIT 1`,
      [elevenLabsConversationId]
    );
    const sessionRow = sessionResult.rows[0];

    if (!sessionRow) {
      res.json({ received: true });
      return;
    }

    const sessionId: number = sessionRow.id;

    if (sessionRow.ended_at) {
      res.json({ received: true, skipped: "already_ended" });
      return;
    }

    const agentText = transcript
      .filter((t) => t.role === "agent")
      .map((t) => t.message)
      .join("\n");

    const allText = transcript
      .map((t) => `${t.role === "agent" ? "Jessica" : "Pops"}: ${t.message}`)
      .join("\n");

    // "Reached" means Pops actually said something back — not just that the
    // call connected. A call that rings out to voicemail can still produce a
    // webhook with an empty or agent-only transcript.
    const popsSpoke = transcript.some((t) => t.role !== "agent" && t.message.trim().length > 0);
    const reached = webhookData.status !== "failed" && popsSpoke;

    const healthDataTags = parseHealthDataTags(agentText);
    const cravingMeal = parseCravingTag(agentText);

    const { cycleDay } = await getCurrentCycleInfo();
    const questions = await getActiveQuestionsForCycleDay(cycleDay);

    if (cravingMeal) {
      await db.insert(mealCravingsTable).values({ mealName: cravingMeal, source: "jessica", status: "pending" })
        .catch(() => {});
    }

    const categories: string[] = [];
    let flagged = false;

    for (const tag of healthDataTags) {
      const resolvedQuestionId = tag.questionId ?? (questions.find((q) => q.category === tag.category)?.id ?? null);
      const saved = await saveHealthDataPoint({
        sessionId,
        questionId: resolvedQuestionId,
        category: tag.category,
        rawResponse: tag.rawResponse,
        parsedValue: tag.parsedValue,
        parsedIntensity: tag.parsedIntensity,
      }).catch(() => null);
      if (saved) {
        if (!categories.includes(tag.category)) categories.push(tag.category);
        if (tag.parsedValue === "unsafe" || tag.parsedIntensity === "severe") flagged = true;
      }
    }

    if (categories.length === 0) {
      const dataPoints = await db.select().from(healthDataPointsTable)
        .where(eq(healthDataPointsTable.sessionId, sessionId));
      for (const d of dataPoints) {
        if (!categories.includes(d.category)) categories.push(d.category);
        if (d.flagged) flagged = true;
      }
    }

    const callSummary = summary
      ?? (categories.length > 0
        ? `Phone call with Pops. Covered: ${categories.join(", ")}. ${healthDataTags.length} data point(s) recorded.${flagged ? " ⚠️ Flagged." : ""}`
        : reached
          ? "Phone call with Pops. No structured health data captured."
          : "Call did not reach Pops (no answer or voicemail).");

    await pool.query(
      `UPDATE call_sessions SET ended_at = NOW(), summary = $1, flagged = $2, transcript = $3, reached = $4 WHERE id = $5`,
      [callSummary, flagged, allText || null, reached, sessionId]
    );

    req.log.info({ sessionId, elevenLabsConversationId, healthDataCount: healthDataTags.length }, "ElevenLabs webhook processed");

    res.json({ received: true, sessionId, healthDataCount: healthDataTags.length });
  } catch (err) {
    req.log.error({ err }, "ElevenLabs webhook processing failed");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
