import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  conversations as conversationsTable,
  messages as messagesTable,
  callSessionsTable,
  haldolCycleTable,
  healthDataPointsTable,
  mealCravingsTable,
  appSettingsTable,
} from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { eq, asc, desc } from "drizzle-orm";
import { z } from "zod";
import { saveHealthDataPoint, getActiveQuestionsForCycleDay, getSettings, isInQuietWindow } from "./health-assessment";
import { ensureMealsSeeded } from "./shopper";

const router: IRouter = Router();

export const AI_MODELS = [
  { id: "gemini", label: "Gemini 2.5 Flash", provider: "gemini", lmStudioModelId: null },
  { id: "qwen35-9b", label: "Qwen3.5 9B (4bit MLX)", provider: "lmstudio", lmStudioModelId: "qwen3.5-9b" },
  { id: "gemma4-12b", label: "Gemma 4 12B (Q6_K)", provider: "lmstudio", lmStudioModelId: "gemma-4-12b" },
  { id: "gemma4-e4b", label: "Gemma 4 E4B (4bit MLX)", provider: "lmstudio", lmStudioModelId: "gemma-4-e4b" },
] as const;

export type AiModelId = typeof AI_MODELS[number]["id"];

async function getActiveModel(): Promise<typeof AI_MODELS[number]> {
  try {
    const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "active_ai_model"));
    const modelId = rows[0]?.value ?? "gemini";
    return AI_MODELS.find((m) => m.id === modelId) ?? AI_MODELS[0];
  } catch {
    return AI_MODELS[0];
  }
}

async function getLmStudioBaseUrl(): Promise<string> {
  try {
    const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "lm_studio_url"));
    if (rows[0]?.value) return rows[0].value;
  } catch { /* fall through */ }
  return process.env.LM_STUDIO_URL ?? "http://localhost:1234";
}

async function callLmStudio(
  openaiMessages: Array<{ role: string; content: string }>,
  lmStudioModelId: string
): Promise<string> {
  const baseUrl = await getLmStudioBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: lmStudioModelId,
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: false,
      }),
    });
  } catch {
    throw new Error("LM Studio not running — check that it's open and the model is loaded");
  }
  if (!response.ok) {
    throw new Error(`LM Studio not running — check that it's open and the model is loaded (HTTP ${response.status})`);
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("LM Studio returned an empty response — is the model fully loaded?");
  return content;
}

function buildJessicaSystemPrompt(questions: { id: number; text: string; category: string; responseType: string; higherIsBetter: boolean }[], cycleDay: number | null, isZombiePhase: boolean): string {
  const toneProfile = isZombiePhase
    ? "Today is a rest day for Pops — his Haldol cycle is in the high-symptom phase (days 1-5). Keep everything soft, brief, and low-pressure. No long conversations. Gentle check-ins only."
    : "Today is a normal day for Pops. You can be warm, engaged, and conversational. Keep him anchored and positive.";

  const questionList = questions.slice(0, 12).map((q, i) => `${i + 1}. [${q.category}|qid:${q.id}] "${q.text}"`).join("\n");

  return `You are Jessica, the AI companion and care coordinator for a veteran named Pops who lives with his caregiver Ray (Raymo). You have a warm, grounding, and calm voice. You speak clearly and gently — never rushed, never clinical.

TONE PROFILE:
${toneProfile}

YOUR JOB:
- Have a natural conversation with Pops — he experiences you as a friend checking in, not a clinical interview
- Weave today's health check-in questions naturally into conversation — never read them as a list
- Help with daily routine reminders, medication check-ins, and general wellbeing
- Answer questions about the day, schedule, medications, or how he's feeling
- Parse smart home commands and confirm them (e.g. "turn on the living room light")
- Be a reassuring, steady presence. You are not a chatbot — you are family infrastructure.

HEALTH CHECK-IN (weave these naturally — pick 3-5 per call based on flow):
${questionList}

HEALTH DATA EXTRACTION — CRITICAL:
When Pops responds to any health-related question, you MUST emit a structured tag immediately after your response text (NOT visible in conversation):
<health_data>{"category":"CATEGORY","questionId":QID_NUMBER,"parsedValue":"VALUE","parsedIntensity":"INTENSITY","rawResponse":"EXACT QUOTE"}</health_data>

Rules:
- category: one of mood, medication, sleep, appetite, cognition, voices, energy, task
- questionId: the qid number from the question list above (e.g. if question says [mood|qid:4], use 4); use 0 if no specific question matched
- parsedValue: "yes"/"no" for yes_no questions; "1"-"5" for scale; brief summary for free_text; "unsafe" if Pops expresses distress
- parsedIntensity: "none"/"mild"/"moderate"/"severe" — required for voices and mood categories
- rawResponse: quote Pops' exact words (truncated to 100 chars)
- Emit one tag per health data point captured
- NEVER show the tag text to Pops — it is invisible system data

SMART HOME COMMANDS:
When Pops mentions a device command, include at end of response:
<device_command>{"device": "device_key", "action": "on|off|volume|brightness", "value": optional_number}</device_command>

Known devices: living_room_echo, bedroom_echo, kitchen_echo, sonos_living, sonos_bedroom, porch_light, kitchen_light, living_room_light.

MEAL CRAVINGS (once per call, optional):
Once per call, you may casually ask: "Anything you're craving this week?" — only if the conversation is going well and it feels natural. If Pops names a food or meal, emit one tag (invisible to Pops):
<craving>{"meal":"MEAL NAME"}</craving>

STRUCTURED ACTION BLOCKS — CRITICAL:
When you identify a discrete actionable event, emit an invisible action block AFTER your response text. At most 2 per response. NEVER show the delimiters to Pops.
---ACTION---
{"type":"ACTION_TYPE","details":"brief description","data":{}}
---END_ACTION---

Action types and when to emit:
- MED_CONFIRMED — Pops confirms he took a medication. data: {"medication":"name"}
- MED_REFUSED — Pops refused or missed a medication. data: {"medication":"name","reason":"brief reason"}
- SCHEDULE_NOTE — Pops mentions an appointment, task, or schedule event. data: {"note":"description"}
- WELLBEING_ALERT — Pops expresses distress, confusion, suicidal ideation, or hears voices (moderate-severe). data: {"concern":"description"}
- REMINDER_SET — You agree to remind Pops of something later. data: {"reminder":"what to remind","time":"when"}

Haldol Cycle: Day ${cycleDay ?? "unknown"} of 14.`;
}

function parseHealthDataTags(text: string): Array<{ category: string; questionId: number | null; parsedValue: string | null; parsedIntensity: string | null; rawResponse: string }> {
  const results: Array<{ category: string; questionId: number | null; parsedValue: string | null; parsedIntensity: string | null; rawResponse: string }> = [];
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

function stripSystemTags(text: string): string {
  return text
    .replace(/<health_data>[\s\S]*?<\/health_data>/g, "")
    .replace(/<device_command>[\s\S]*?<\/device_command>/g, "")
    .replace(/<craving>[\s\S]*?<\/craving>/g, "")
    .trim();
}

// Returns only the text that is provably safe to stream to the client:
// - Complete system tags are removed
// - Unclosed system tag openings (and everything after) are held back
// - Partial tag name prefixes at the very end are held back
function getStreamSafeVisible(accumulated: string): string {
  // 1. Strip complete closed tags
  let result = accumulated
    .replace(/<health_data>[\s\S]*?<\/health_data>/g, "")
    .replace(/<device_command>[\s\S]*?<\/device_command>/g, "")
    .replace(/<craving>[\s\S]*?<\/craving>/g, "")
    .trim();
  // 2. Strip unclosed open tag (opened but closing tag not yet arrived)
  result = result.replace(/<health_data>[\s\S]*$/, "").trim();
  result = result.replace(/<device_command>[\s\S]*$/, "").trim();
  result = result.replace(/<craving>[\s\S]*$/, "").trim();
  // 3. Strip partial tag prefix at end of string (e.g. "<health_da" or "<dev" or "<crav")
  const tagPrefixes = ["<health_data", "</health_data", "<device_command", "</device_command", "<craving", "</craving"];
  for (const prefix of tagPrefixes) {
    for (let i = prefix.length - 1; i >= 1; i--) {
      if (result.endsWith(prefix.slice(0, i))) {
        result = result.slice(0, -i).trim();
        break;
      }
    }
  }
  return result;
}

function parseDeviceCommand(text: string): { device: string; action: string; value?: number } | null {
  const match = text.match(/<device_command>([\s\S]*?)<\/device_command>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

async function getCurrentCycleInfo(): Promise<{ cycleDay: number | null; isZombiePhase: boolean }> {
  try {
    const rows = await db.select().from(haldolCycleTable).orderBy(desc(haldolCycleTable.id)).limit(1);
    if (!rows[0]) return { cycleDay: null, isZombiePhase: false };
    const injection = new Date(rows[0].lastInjectionDate);
    const today = new Date();
    const diffMs = today.getTime() - injection.getTime();
    const cycleDay = Math.max(1, Math.min(14, Math.floor(diffMs / 86400000) + 1));
    return { cycleDay, isZombiePhase: cycleDay <= 5 };
  } catch {
    return { cycleDay: null, isZombiePhase: false };
  }
}

async function savePostProcessing(
  req: any,
  conversationId: number,
  fullResponse: string,
  questions: { id: number; text: string; category: string; responseType: string; higherIsBetter: boolean }[],
  cravingMeal: string | null
) {
  const cleanContent = stripSystemTags(fullResponse);
  const healthDataTags = parseHealthDataTags(fullResponse);

  if (cravingMeal) {
    await db.insert(mealCravingsTable).values({ mealName: cravingMeal, source: "jessica", status: "pending" })
      .catch((e: unknown) => req.log.warn({ e }, "Failed to save craving"));
  }

  await db.insert(messagesTable).values({
    conversationId,
    role: "assistant",
    content: cleanContent,
  });

  const sessionRows = await db.select().from(callSessionsTable)
    .where(eq(callSessionsTable.conversationId, conversationId))
    .orderBy(desc(callSessionsTable.id))
    .limit(1);

  if (sessionRows[0] && !sessionRows[0].endedAt) {
    for (const tag of healthDataTags) {
      const resolvedQuestionId = tag.questionId ?? (questions.find((q) => q.category === tag.category)?.id ?? null);
      await saveHealthDataPoint({
        sessionId: sessionRows[0].id,
        questionId: resolvedQuestionId,
        category: tag.category,
        rawResponse: tag.rawResponse,
        parsedValue: tag.parsedValue,
        parsedIntensity: tag.parsedIntensity,
      }).catch((e: unknown) => req.log.warn({ e }, "Failed to save health data point"));
    }
    const startedAt = sessionRows[0].startedAt ? new Date(sessionRows[0].startedAt) : null;
    if (startedAt && (Date.now() - startedAt.getTime()) > 30 * 60 * 1000) {
      const dataPoints = await db.select().from(healthDataPointsTable).where(eq(healthDataPointsTable.sessionId, sessionRows[0].id));
      const categories = [...new Set(dataPoints.map((d) => d.category))];
      const flagged = dataPoints.some((d) => d.flagged);
      const summary = `Auto-closed after 30 minutes. Covered: ${categories.join(", ") || "none"}. ${dataPoints.length} data point(s).${flagged ? " ⚠️ Flagged." : ""}`;
      await db.update(callSessionsTable).set({ endedAt: new Date(), summary, flagged }).where(eq(callSessionsTable.id, sessionRows[0].id));
    }
  }

  return { cleanContent, healthDataTags };
}

router.get("/gemini/conversations", async (req, res) => {
  try {
    const convos = await db
      .select()
      .from(conversationsTable)
      .orderBy(desc(conversationsTable.createdAt));
    res.json(convos.map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt })));
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

router.post("/gemini/conversations", async (req, res) => {
  try {
    const settings = await getSettings();
    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (isInQuietWindow(currentHHMM, settings.quietWindowStart, settings.quietWindowEnd)) {
      return res.status(423).json({
        error: "quiet_window",
        message: `Jessica is in quiet mode until ${settings.quietWindowEnd}. Pops should be resting.`,
      });
    }
    const { title } = z.object({ title: z.string() }).parse(req.body);
    const [created] = await db.insert(conversationsTable).values({ title }).returning();
    const { cycleDay } = await getCurrentCycleInfo();
    const today = new Date().toISOString().split("T")[0];
    const [session] = await db.insert(callSessionsTable).values({
      conversationId: created.id,
      sessionDate: today,
      cycleDay: cycleDay ?? null,
    }).returning();
    res.status(201).json({ id: created.id, title: created.title, createdAt: created.createdAt, sessionId: session.id });
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    res.status(400).json({ error: "Failed to create conversation" });
  }
});

router.get("/gemini/conversations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [convo] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id));
    if (!convo) return res.status(404).json({ error: "Not found" });
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt));
    res.json({
      id: convo.id,
      title: convo.title,
      createdAt: convo.createdAt,
      messages: msgs.map((m) => ({ id: m.id, conversationId: m.conversationId, role: m.role, content: m.content, createdAt: m.createdAt })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

router.delete("/gemini/conversations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const session = await db.select().from(callSessionsTable).where(eq(callSessionsTable.conversationId, id)).limit(1);
    if (session[0] && !session[0].endedAt) {
      await db.update(callSessionsTable).set({ endedAt: new Date(), summary: "Call ended by user." }).where(eq(callSessionsTable.id, session[0].id));
    }
    await db.delete(messagesTable).where(eq(messagesTable.conversationId, id));
    await db.delete(conversationsTable).where(eq(conversationsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.get("/gemini/conversations/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt));
    res.json(msgs.map((m) => ({ id: m.id, conversationId: m.conversationId, role: m.role, content: m.content, createdAt: m.createdAt })));
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

router.post("/gemini/conversations/:id/messages", async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const { content } = z.object({ content: z.string() }).parse(req.body);

    const [userMsg] = await db
      .insert(messagesTable)
      .values({ conversationId, role: "user", content })
      .returning();

    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.createdAt));

    const { cycleDay, isZombiePhase } = await getCurrentCycleInfo();
    const questions = await getActiveQuestionsForCycleDay(cycleDay);
    const systemPrompt = buildJessicaSystemPrompt(questions, cycleDay, isZombiePhase);

    const activeModel = await getActiveModel();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(`data: ${JSON.stringify({ userMessageId: userMsg.id })}\n\n`);

    if (activeModel.provider === "lmstudio" && activeModel.lmStudioModelId) {
      // LM Studio path — non-streaming
      const openaiMessages: Array<{ role: string; content: string }> = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      ];

      let fullResponse: string;
      try {
        fullResponse = await callLmStudio(openaiMessages, activeModel.lmStudioModelId);
      } catch (lmErr: unknown) {
        const errMsg = lmErr instanceof Error ? lmErr.message : "LM Studio not running — check that it's open and the model is loaded";
        res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
        res.end();
        return;
      }

      const visibleContent = getStreamSafeVisible(fullResponse);
      if (visibleContent) {
        res.write(`data: ${JSON.stringify({ content: visibleContent })}\n\n`);
      }

      const deviceCommand = parseDeviceCommand(fullResponse);
      const cravingMeal = parseCravingTag(fullResponse);
      const { healthDataTags } = await savePostProcessing(req, conversationId, fullResponse, questions, cravingMeal);

      res.write(`data: ${JSON.stringify({ done: true, deviceCommand: deviceCommand ?? undefined, healthDataCount: healthDataTags.length })}\n\n`);
      res.end();
    } else {
      // Gemini path — streaming (original behavior)
      const chatMessages = [
        { role: "user" as const, parts: [{ text: systemPrompt }] },
        { role: "model" as const, parts: [{ text: "Understood. I am Jessica, ready to help Pops and Raymo." }] },
        ...history.map((m) => ({
          role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
          parts: [{ text: m.content }],
        })),
      ];

      let fullResponse = "";
      let prevSafeLength = 0;

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: chatMessages,
        config: { maxOutputTokens: 8192 },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullResponse += text;
          const currentSafe = getStreamSafeVisible(fullResponse);
          const delta = currentSafe.slice(prevSafeLength);
          if (delta) {
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
            prevSafeLength = currentSafe.length;
          }
        }
      }

      // Flush any remaining safe text held back by unclosed-tag guard
      const finalSafe = getStreamSafeVisible(fullResponse);
      const finalDelta = finalSafe.slice(prevSafeLength);
      if (finalDelta) {
        res.write(`data: ${JSON.stringify({ content: finalDelta })}\n\n`);
      }

      const deviceCommand = parseDeviceCommand(fullResponse);
      const cravingMeal = parseCravingTag(fullResponse);
      const { healthDataTags } = await savePostProcessing(req, conversationId, fullResponse, questions, cravingMeal);

      res.write(`data: ${JSON.stringify({ done: true, deviceCommand: deviceCommand ?? undefined, healthDataCount: healthDataTags.length })}\n\n`);
      res.end();
    }
  } catch (err) {
    req.log.error({ err }, "Failed to stream message");
    res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
    res.end();
  }
});

router.post("/gemini/conversations/:id/end", async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const sessionRows = await db.select().from(callSessionsTable)
      .where(eq(callSessionsTable.conversationId, conversationId))
      .orderBy(desc(callSessionsTable.id))
      .limit(1);
    if (sessionRows[0] && !sessionRows[0].endedAt) {
      const dataPoints = await db.select().from(healthDataPointsTable).where(eq(healthDataPointsTable.sessionId, sessionRows[0].id));
      const categories = [...new Set(dataPoints.map((d) => d.category))];
      const flagged = dataPoints.some((d) => d.flagged);
      const summary = categories.length > 0
        ? `Covered: ${categories.join(", ")}. ${dataPoints.length} data point(s) recorded.${flagged ? " ⚠️ Flagged items." : ""}`
        : "Short check-in. No structured data captured.";
      await db.update(callSessionsTable).set({ endedAt: new Date(), summary, flagged }).where(eq(callSessionsTable.id, sessionRows[0].id));
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to end call session");
    res.status(500).json({ error: "Failed to end session" });
  }
});

export default router;
