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
import { verifyElevenLabsSignature, getElevenLabsWebhookSecret, getElevenLabsSignatureHeader } from "../lib/webhook-auth";
import { dispatch, type HermesAction, type LedgerContext } from "../lib/hermes";
import { getJessicaToolSecret, toolSecretMatches, isCallWithRay } from "../lib/jessica-tools";
import { syncJessicaToolsToElevenLabs } from "../lib/elevenlabs-tools-sync";

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

/**
 * First-contact framing for Pops' very first call from Jessica. Injected as
 * `extraContext`, which lands near the top of the system prompt (above "YOUR
 * JOB"), so it overrides the standard check-in behavior below it.
 *
 * Pops lives with PTSD, schizophrenia, and auditory hallucinations. An
 * unfamiliar voice that already knows his medication schedule is exactly the
 * wrong first impression, so this call does no health check-in, recites
 * nothing from his record, and mutates no schedule state.
 */
export const INTRO_CALL_CONTEXT = `FIRST CALL — JUST A HELLO. This overrides everything below.

Pops has never spoken to you before. Keep this short and easy — a few minutes.

Say three things, in your own words, near the start:
1. You're Jessica.
2. You're a computer program — an AI — that his son Ray set up.
3. What he can expect: you'll call now and then just to say hi and see how he's doing.

Then ask ONE question: how he's doing today. That is the only question you ask on this call.

DO NOT INTERVIEW HIM. This is the thing that matters most:
- One question, then listen. Do not follow a short answer with another question.
- "Good." is a complete answer. Accept it. Don't dig, don't rephrase, don't ask a second way.
- Never stack questions. Never ask a question just to fill a silence — quiet is fine.
- If he asks you something, answer it and stop. Let him lead.

Not on this call: no health questions, no medications, no appointments, no schedule, no tools, no logging. If he brings something up, just talk about it like a friend would.

If he asks whether you're a real person, say plainly that you're not — you're a program Ray set up. Pops sometimes hears voices that aren't real, so never leave that question hanging. If he seems unsure, tell him again gently that Ray knows all about this call and he can hang up and ask Ray anytime.

If he's confused or upset, don't argue or explain twice. Tell him Ray can fill him in, that it was good to meet him, and end the call warmly. If he asks you not to call again, say that's fine and you'll let Ray know.

Close by saying it was good to meet him and you'll say hi again sometime. Don't ask him to commit to anything.`;

export type OutboundCallResult =
  | { ok: true; elevenLabsConversationId: string; sessionId: number | null; conversationId: number | null }
  | { ok: false; status: number; error: string; message?: string };

/**
 * Core outbound-call logic shared by the manual "Call Now" route and the
 * daily call scheduler (lib/call-scheduler.ts). Never throws — always
 * resolves to a result object so the scheduler's tick loop can log and
 * move on instead of crashing the interval.
 *
 * `noSession` — when true, the ElevenLabs call is placed but no
 * `conversations` or `call_sessions` row is written. Use this for
 * administrative notification calls (e.g. the missed-streak admin alert)
 * that must NOT appear as Pops outbound-call sessions — otherwise the
 * missed-call detection job could see the admin call's `reached=true` as
 * proof that Pops was reached and incorrectly reset the missed-call streak.
 */
export async function triggerOutboundCall(opts?: { test?: boolean; extraContext?: string; noSession?: boolean; intro?: boolean }): Promise<OutboundCallResult> {
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
    // The intro block goes first so it sits above every other instruction —
    // including the care-context and schedule blocks it tells Jessica not to
    // recite on a first call.
    const introBlock = opts?.intro ? `${INTRO_CALL_CONTEXT}\n\n` : "";
    const extraBlock = opts?.extraContext ? `${opts.extraContext}\n\n` : "";
    const liveContext = introBlock + extraBlock + careContextBlock + scheduleContext;

    const systemPrompt = buildJessicaSystemPrompt(questions, cycleDay, isZombiePhase, liveContext, { isOverdue, daysOverdue, intervalDays, zombiePhaseDays }, { channel: "phone" });

    // The override MUST be nested inside conversation_initiation_client_data.
    // Sent at the top level, the Twilio outbound-call endpoint silently drops
    // it — no error, HTTP 200, call connects — and the agent falls back to the
    // short prompt + static first_message stored on the ElevenLabs agent. That
    // is what happened on 2026-08-14: Pops' intro call ran the stored check-in
    // prompt with none of the context built below. Verify after any change by
    // GETting the conversation and confirming
    // conversation_initiation_client_data.conversation_config_override
    // .agent.prompt.prompt is non-null.
    const conversationConfigOverride = {
      agent: {
        prompt: {
          prompt: systemPrompt,
        },
        // Force the LLM to generate its own opening line from the system
        // prompt above instead of whatever static first_message happens to
        // be stored on the ElevenLabs agent object (that value isn't
        // controlled by our code and has drifted to a generic default
        // before — see ELEVENLABS_HANDOFF.md).
        first_message: "",
      },
    };

    const elevenLabsBody = {
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: targetPhone,
      conversation_initiation_client_data: {
        conversation_config_override: conversationConfigOverride,
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
    const elevenLabsConversationId = elData.conversation_id;

    // Administrative/notification calls (noSession=true) must not create a
    // call_sessions row. The missed-call detection job looks for sessions with
    // elevenlabs_conversation_id IS NOT NULL AND reached=true to confirm Pops
    // was reached. If an admin notification call wrote a session and Ray
    // answered it, the webhook would flip reached=true on that admin session —
    // which would satisfy the detection query and incorrectly reset the missed-
    // call streak even though Pops was never called.
    if (opts?.noSession) {
      return { ok: true, elevenLabsConversationId, sessionId: null, conversationId: null };
    }

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
      [elevenLabsConversationId, session.id]
    );

    return {
      ok: true,
      elevenLabsConversationId,
      sessionId: session.id,
      conversationId: convo.id,
    };
  } catch (err) {
    return { ok: false, status: 500, error: "Failed to initiate call", message: err instanceof Error ? err.message : String(err) };
  }
}

router.post("/jessica/outbound-call", requireLocalSession, async (req: Request, res: Response) => {
  const result = await triggerOutboundCall({
    test: req.body?.test === true,
    intro: req.body?.intro === true,
  });
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
  // Fail closed: if the shared secret isn't configured yet, refuse to process
  // rather than silently accepting unauthenticated calls. Anyone who finds
  // this URL could otherwise inject fake transcripts/health data or forge
  // "call ended" events for real sessions.
  const webhookSecret = getElevenLabsWebhookSecret();
  if (!webhookSecret) {
    req.log.error("ELEVENLABS_WEBHOOK_SECRET is not set — rejecting webhook (fail closed). Configure it to match the secret set in ElevenLabs' webhook settings.");
    res.status(503).json({ error: "webhook_not_configured" });
    return;
  }

  const verification = verifyElevenLabsSignature(req.rawBody, getElevenLabsSignatureHeader(req), webhookSecret);
  if (!verification.ok) {
    req.log.warn({ reason: verification.reason }, "Rejected ElevenLabs webhook — signature verification failed");
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  try {
    const parsed = webhookPayloadSchema.safeParse(req.body);

    if (!parsed.success || !parsed.data.data?.conversation_id) {
      res.json({ received: true });
      return;
    }

    // ElevenLabs can be configured to also send post_call_audio or
    // call_initiation_failure events to the same URL. Those share the same
    // conversation_id but carry no real transcript/analysis, so processing
    // them here would overwrite a session's real transcript with an empty
    // one (or mark it "already_ended" before the real transcription webhook
    // arrives). Only the transcription event should ever update health data.
    if (parsed.data.type && parsed.data.type !== "post_call_transcription") {
      res.json({ received: true, skipped: "unsupported_event_type" });
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

// ─── Real-time voice tool calls (Task #116) ──────────────────────────────────
//
// ElevenLabs calls these mid-conversation as "webhook tools" attached to the
// Jessica agent (see lib/elevenlabs-tools-sync.ts for how they're
// registered). They share the same Hermes dispatch + care_events ledger the
// text-chat ACTION-block path uses, so a task added by voice looks identical
// (in schedule_tasks, care_events, and the Admin dashboard) to one added by
// typing to Jessica.
//
// Auth: a static shared-secret header, since ElevenLabs webhook tools don't
// support HMAC signing like the post-call webhook above. The secret is
// generated once (lib/jessica-tools.ts) and lives in app_settings, not a
// Replit Secret — it's an internal machine-to-machine token we mint and
// embed into the tool config ourselves, never typed in or seen by anyone.
//
// Response contract: ALWAYS respond 200 with { success, message } for every
// business-logic outcome (added/removed/rescheduled, OR ambiguous/invalid
// input) — ElevenLabs' default tool_error_handling_mode hides non-2xx error
// bodies from the model, so a validation failure returned as 4xx would come
// across as a silent dead end instead of Jessica reading back a specific
// spoken clarification. Non-2xx is reserved for genuine auth/config failures
// where there's no task-specific clarification to offer anyway.
async function requireToolSecret(req: Request, res: Response, next: () => void): Promise<void> {
  const expected = await getJessicaToolSecret();
  if (!expected) {
    req.log.error("Jessica tool secret not configured — rejecting tool call (fail closed). Click \"Sync Jessica's Tools\" in Settings once ElevenLabs is configured.");
    res.status(503).json({ success: false, message: "not_configured" });
    return;
  }
  const provided = req.headers["x-jessica-tool-secret"];
  const providedStr = Array.isArray(provided) ? provided[0] : provided;
  if (!toolSecretMatches(providedStr, expected)) {
    req.log.warn("Rejected Jessica tool call — invalid or missing shared secret");
    res.status(401).json({ success: false, message: "unauthorized" });
    return;
  }
  next();
}

const jessicaToolCtx: LedgerContext = { tenantId: "local", source: "jessica", actor: "patient" };

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Task #116 code-review fix: on top of requireToolSecret (which only proves
 * "ElevenLabs' infrastructure sent this"), update-daily-call additionally
 * requires the call itself to be verified as being with Ray — see
 * isCallWithRay() in lib/jessica-tools.ts for the full rationale and
 * mechanism. Responds 200 with a spoken denial (never a bare 4xx) so
 * tool_error_handling_mode: "auto" still lets Jessica explain why, instead
 * of silently swallowing the error from the model.
 */
function requireRayCaller(req: Request, res: Response, next: () => void): void {
  const calledNumber = firstHeaderValue(req.headers["x-called-number"]);
  const callerId = firstHeaderValue(req.headers["x-caller-id"]);
  if (!isCallWithRay(calledNumber, callerId)) {
    req.log.warn({ calledNumber, callerId }, "Rejected update-daily-call tool call — this call is not verified as being with Ray");
    res.json({ success: false, message: "I can only change the daily call schedule when I'm speaking with Ray directly, so I'm not going to make that change on this call." });
    return;
  }
  next();
}

const addTaskToolSchema = z.object({
  title: z.string().min(1),
  time: z.string().min(1),
  details: z.string().optional(),
});

router.post("/jessica/tools/add-task", requireToolSecret, async (req: Request, res: Response) => {
  try {
    const parsed = addTaskToolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.json({ success: false, message: "I need both a task name and a time to add that — could you say it again?" });
      return;
    }
    const action: HermesAction = { type: "ADD_TASK", title: parsed.data.title, time: parsed.data.time, details: parsed.data.details };
    const result = await dispatch(action, jessicaToolCtx);
    res.json({ success: result.ok, message: result.message });
  } catch (err) {
    req.log.error({ err }, "Jessica add-task tool call failed");
    res.json({ success: false, message: "Something went wrong on my end — let's try that again in a moment." });
  }
});

const removeTaskToolSchema = z.object({
  title: z.string().min(1),
});

router.post("/jessica/tools/remove-task", requireToolSecret, async (req: Request, res: Response) => {
  try {
    const parsed = removeTaskToolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.json({ success: false, message: "Which task should I remove?" });
      return;
    }
    const action: HermesAction = { type: "REMOVE_TASK", title: parsed.data.title };
    const result = await dispatch(action, jessicaToolCtx);
    res.json({ success: result.ok, message: result.message });
  } catch (err) {
    req.log.error({ err }, "Jessica remove-task tool call failed");
    res.json({ success: false, message: "Something went wrong on my end — let's try that again in a moment." });
  }
});

const rescheduleTaskToolSchema = z.object({
  title: z.string().min(1),
  time: z.string().min(1),
});

router.post("/jessica/tools/reschedule-task", requireToolSecret, async (req: Request, res: Response) => {
  try {
    const parsed = rescheduleTaskToolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.json({ success: false, message: "I need both the task name and the new time to reschedule it — could you say it again?" });
      return;
    }
    const action: HermesAction = { type: "RESCHEDULE_TASK", title: parsed.data.title, time: parsed.data.time };
    const result = await dispatch(action, jessicaToolCtx);
    res.json({ success: result.ok, message: result.message });
  } catch (err) {
    req.log.error({ err }, "Jessica reschedule-task tool call failed");
    res.json({ success: false, message: "Something went wrong on my end — let's try that again in a moment." });
  }
});

const completeTaskToolSchema = z.object({
  title: z.string().min(1),
  source: z.enum(["spoken", "family"]).optional(),
});

router.post("/jessica/tools/complete-task", requireToolSecret, async (req: Request, res: Response) => {
  try {
    const parsed = completeTaskToolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.json({ success: false, message: "Which task should I mark as done?" });
      return;
    }
    const action: HermesAction = { type: "COMPLETE_TASK", title: parsed.data.title, source: parsed.data.source };
    const result = await dispatch(action, jessicaToolCtx);
    res.json({ success: result.ok, message: result.message });
  } catch (err) {
    req.log.error({ err }, "Jessica complete-task tool call failed");
    res.json({ success: false, message: "Something went wrong on my end — let's try that again in a moment." });
  }
});

const refuseTaskToolSchema = z.object({
  title: z.string().min(1),
});

router.post("/jessica/tools/refuse-task", requireToolSecret, async (req: Request, res: Response) => {
  try {
    const parsed = refuseTaskToolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.json({ success: false, message: "Which task did he decline?" });
      return;
    }
    const action: HermesAction = { type: "REFUSE_TASK", title: parsed.data.title };
    const result = await dispatch(action, jessicaToolCtx);
    res.json({ success: result.ok, message: result.message });
  } catch (err) {
    req.log.error({ err }, "Jessica refuse-task tool call failed");
    res.json({ success: false, message: "Something went wrong on my end — let's try that again in a moment." });
  }
});

const updateDailyCallToolSchema = z.object({
  enabled: z.boolean().optional(),
  time: z.string().optional(),
});

router.post("/jessica/tools/update-daily-call", requireToolSecret, requireRayCaller, async (req: Request, res: Response) => {
  try {
    const parsed = updateDailyCallToolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.json({ success: false, message: "Do you want to turn the daily call on or off, or change what time it happens?" });
      return;
    }
    const action: HermesAction = { type: "UPDATE_CALL_SCHEDULE", enabled: parsed.data.enabled, time: parsed.data.time };
    const result = await dispatch(action, jessicaToolCtx);
    res.json({ success: result.ok, message: result.message });
  } catch (err) {
    req.log.error({ err }, "Jessica update-daily-call tool call failed");
    res.json({ success: false, message: "Something went wrong on my end — let's try that again in a moment." });
  }
});

const addGroceryItemsToolSchema = z.object({
  items: z.array(z.string().min(1)).min(1),
});

// Task #148 — one-off spoken grocery items ("add milk and eggs") from a live
// phone call. Intentionally usable by whoever is on the call (Ray or Pops),
// same as the task-CRUD tools — no requireRayCaller gate.
router.post("/jessica/tools/add-grocery-items", requireToolSecret, async (req: Request, res: Response) => {
  try {
    const parsed = addGroceryItemsToolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.json({ success: false, message: "I didn't catch which items to add — could you name them again?" });
      return;
    }
    const action: HermesAction = { type: "ADD_GROCERY_ITEMS", items: parsed.data.items };
    const result = await dispatch(action, jessicaToolCtx);
    res.json({ success: result.ok, message: result.message });
  } catch (err) {
    req.log.error({ err }, "Jessica add-grocery-items tool call failed");
    res.json({ success: false, message: "Something went wrong on my end — let's try that again in a moment." });
  }
});

// Manual, Ray-visible trigger for registering/refreshing the tools above with
// ElevenLabs — mirrors the startup best-effort call in index.ts but gives
// Settings a button with real success/failure feedback instead of a silent
// background attempt Ray has no way to see.
router.post("/jessica/sync-tools", requireLocalSession, async (req: Request, res: Response) => {
  const result = await syncJessicaToolsToElevenLabs();
  res.json(result);
});

export default router;
