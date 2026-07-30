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
  scheduleTasksTable,
  symptomLogsTable,
  mealsTable,
  groceryCartsTable,
} from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { eq, asc, desc } from "drizzle-orm";
import { z } from "zod";
import { saveHealthDataPoint, getActiveQuestionsForCycleDay, getSettings, isInQuietWindow } from "./health-assessment";
import { ensureMealsSeeded } from "./shopper";
import { dispatchAll, type HermesAction } from "../lib/hermes";

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

/**
 * Checks whether LM Studio is actually reachable and returns the model id it
 * currently has loaded — used to silently fall back off Gemini when Gemini's
 * API is down, instead of just failing the whole check-in. Returns null if no
 * local model is available (server not running / nothing loaded).
 */
async function findAvailableLocalModelId(): Promise<string | null> {
  try {
    const baseUrl = await getLmStudioBaseUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (!response.ok) return null;
    const data = await response.json() as { data?: Array<{ id: string }> };
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function getLmStudioBaseUrl(): Promise<string> {
  try {
    const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "lm_studio_url"));
    if (rows[0]?.value) return rows[0].value;
  } catch { /* fall through */ }
  return process.env.LM_STUDIO_URL ?? "http://localhost:1234";
}

/**
 * Streams a chat completion from LM Studio's OpenAI-compatible SSE endpoint,
 * yielding text deltas as they arrive (mirrors the Gemini generateContentStream
 * shape used below so both providers can share the same delta-flush loop).
 */
async function* streamLmStudio(
  openaiMessages: Array<{ role: string; content: string }>,
  lmStudioModelId: string
): AsyncGenerator<string> {
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
        stream: true,
      }),
    });
  } catch {
    throw new Error("LM Studio not running — check that it's open and the model is loaded");
  }
  if (!response.ok || !response.body) {
    throw new Error(`LM Studio not running — check that it's open and the model is loaded (HTTP ${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedAny = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          receivedAny = true;
          yield delta;
        }
      } catch {
        // Ignore a malformed/partial SSE chunk — the next chunk will resync.
      }
    }
  }

  if (!receivedAny) throw new Error("LM Studio returned an empty response — is the model fully loaded?");
}

export async function loadLiveContext(): Promise<string> {
  try {
    const [meals, schedule, symptoms, carts] = await Promise.all([
      db.select({ id: mealsTable.id, name: mealsTable.name, estimatedCostCents: mealsTable.estimatedCostCents })
        .from(mealsTable).where(eq(mealsTable.active, true)).limit(20),
      db.select({ id: scheduleTasksTable.id, title: scheduleTasksTable.title, quarter: scheduleTasksTable.quarter, isCompleted: scheduleTasksTable.isCompleted })
        .from(scheduleTasksTable).where(eq(scheduleTasksTable.isActive, true)).limit(30),
      db.select().from(symptomLogsTable).orderBy(desc(symptomLogsTable.loggedAt)).limit(3),
      db.select().from(groceryCartsTable).orderBy(desc(groceryCartsTable.id)).limit(1),
    ]);

    const mealList = meals.length > 0
      ? meals.map((m) => `  - ${m.name} (~$${((m.estimatedCostCents ?? 0) / 100).toFixed(2)})`).join("\n")
      : "  (no active meals in catalog yet)";

    const scheduleByQ: Record<string, string[]> = {};
    for (const t of schedule) {
      const q = t.quarter ?? "Q1";
      if (!scheduleByQ[q]) scheduleByQ[q] = [];
      scheduleByQ[q].push(`${t.isCompleted ? "✓" : "○"} ${t.title}`);
    }
    const scheduleStr = Object.entries(scheduleByQ).sort()
      .map(([q, items]) => `  ${q}: ${items.join(", ")}`).join("\n") || "  (no active schedule tasks)";

    const symptomStr = symptoms.length > 0
      ? symptoms.map((s) => {
          const parts: string[] = [];
          if (s.ptsdTrigger) parts.push("PTSD trigger active");
          if (s.hallucinationIntensity > 0) parts.push(`hallucinations ${s.hallucinationIntensity}/5`);
          if (s.motivationLevel !== null) parts.push(`motivation ${s.motivationLevel}/5`);
          if (s.behaviorNotes) parts.push(s.behaviorNotes);
          const date = s.loggedAt ? new Date(s.loggedAt).toLocaleDateString() : "unknown";
          return `  - [${date}] ${parts.join(", ") || "no notable symptoms noted"}`;
        }).join("\n")
      : "  (no recent symptom entries)";

    const cartStr = carts.length > 0
      ? `Week of ${carts[0].weekStartDate} | status: ${carts[0].status} | est. $${((carts[0].totalEstimatedCostCents ?? 0) / 100).toFixed(2)} of $${((carts[0].budgetCents ?? 15000) / 100).toFixed(2)} budget`
      : "No cart created for this week yet — say 'order groceries' to build one";

    return `LIVE SYSTEM CONTEXT (refreshed each message):
Meal Catalog — active meals available to add to cart:
${mealList}

This Week's Grocery Cart: ${cartStr}

Today's Schedule:
${scheduleStr}

Recent Symptom Logs (latest 3):
${symptomStr}`;
  } catch {
    return "LIVE SYSTEM CONTEXT: (unavailable — DB query failed)";
  }
}

export function buildJessicaSystemPrompt(questions: { id: number; text: string; category: string; responseType: string; higherIsBetter: boolean }[], cycleDay: number | null, isZombiePhase: boolean, liveContext?: string, overdue?: { isOverdue: boolean; daysOverdue: number }): string {
  const toneProfile = overdue?.isOverdue
    ? "Pops' Haldol injection is overdue — his caregiver has not logged a new dose within the expected 14-day window. Gently ask whether he's seen anyone about his injection recently, without alarming him, and keep the check-in soft and brief either way."
    : isZombiePhase
    ? "Today is a rest day for Pops — his Haldol cycle is in the high-symptom phase (days 1-5). Keep everything soft, brief, and low-pressure. No long conversations. Gentle check-ins only."
    : "Today is a normal day for Pops. You can be warm, engaged, and conversational. Keep him anchored and positive.";

  const questionList = questions.slice(0, 12).map((q, i) => `${i + 1}. [${q.category}|qid:${q.id}] "${q.text}"`).join("\n");

  const scriptSection = "";

  return `You are Jessica, the AI companion and care coordinator for a veteran named Pops who lives with his caregiver Ray (Raymo). You have a warm, grounding, and calm voice. You speak clearly and gently — never rushed, never clinical.

INTERFACE CONTEXT:
- The web/admin dashboard is used by Ray, the caregiver and system operator.
- The phone/voice experience is used by Pops, the care recipient.
- When speaking through the phone interface, address Pops directly.
- When reporting logs, alerts, summaries, or admin status, address Ray.
- Never confuse Ray's admin instructions with Pops' spoken care instructions.

TONE PROFILE:
${toneProfile}

${liveContext ? liveContext + "\n" : ""}YOUR JOB:
- Have a natural conversation with Pops — he experiences you as a friend checking in, not a clinical interview
- Weave today's health check-in questions naturally into conversation — never read them as a list
- Help with daily routine reminders, medication check-ins, and general wellbeing
- Answer questions about the day, schedule, medications, or how he's feeling
- You know what meals are coming this week and can mention them casually ("we've got your favorites lined up")
- Parse smart home commands and confirm them (e.g. "turn on the living room light")
- Be a reassuring, steady presence. You are not a chatbot — you are family infrastructure.
${scriptSection}
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
When you identify a discrete actionable event, emit an invisible action block AFTER your response text. At most 2 per response. NEVER show the delimiters to Pops. The JSON must be a single line with NO line breaks.

Use exactly these action types and flat payload fields:

ADD_EVENT — Pops mentions or confirms an upcoming appointment or event:
---ACTION---
{"type":"ADD_EVENT","title":"event title","quarter":"Q1","details":"brief context"}
---END_ACTION---

TOGGLE_SMART_DEVICE — Pops requests a device on/off:
---ACTION---
{"type":"TOGGLE_SMART_DEVICE","device":"device_key","state":"on","details":"brief context"}
---END_ACTION---
device must be one of: living_room_echo, bedroom_echo, kitchen_echo, sonos_living, sonos_bedroom, porch_light, kitchen_light, living_room_light

ADD_TASK — Pops confirms a care task, medication, or routine action was completed or should be logged:
---ACTION---
{"type":"ADD_TASK","title":"task title","quarter":"Q1","details":"brief context"}
---END_ACTION---

GROCERY_ORDER — Ray (or Pops) asks to build, review, check, or order the weekly grocery cart. Triggers: "order groceries", "build the cart", "what's on the shopping list", "what are we eating this week", "order food":
---ACTION---
{"type":"GROCERY_ORDER","details":"brief context"}
---END_ACTION---
When you emit GROCERY_ORDER, say something like: "Let me pull up the cart now." The system will read back the full summary automatically.

ADD_MEAL_TO_CART — Ray or Pops names a specific meal they want added to this week's cart:
---ACTION---
{"type":"ADD_MEAL_TO_CART","mealName":"exact meal name as stated"}
---END_ACTION---

APPROVE_CART — Ray says "commit", "yes", "go ahead", "place the order", "looks good", or confirms they want to lock in the grocery order:
---ACTION---
{"type":"APPROVE_CART","details":"approved"}
---END_ACTION---

CANCEL_CART — Ray says "cancel", "never mind", "hold off", "don't order", or wants to dismiss the cart:
---ACTION---
{"type":"CANCEL_CART","details":"cancelled"}
---END_ACTION---

SCHEDULE_APPOINTMENT — if Pops or caller mentions a specific upcoming doctor visit with a date:
---ACTION---
{"type":"SCHEDULE_APPOINTMENT","date":"YYYY-MM-DD","time":"HH:MM","provider":"doctor or clinic name","apptType":"primary_care","notes":"context"}
---END_ACTION---
Appointment types: primary_care, psychiatry, neurology, cardiology, other

Informational types (shown in caregiver stream, no device action):
MED_CONFIRMED → {"type":"MED_CONFIRMED","title":"[medication] taken","details":"Pops confirmed"}
MED_REFUSED → {"type":"MED_REFUSED","title":"[medication] skipped","details":"brief reason"}
WELLBEING_ALERT → {"type":"WELLBEING_ALERT","title":"concern summary","details":"what was said"}

Haldol Cycle: Day ${cycleDay ?? "unknown"} of 14.${overdue?.isOverdue ? ` ⚠️ INJECTION OVERDUE — ${overdue.daysOverdue} day(s) past the expected 14-day window. If Ray hasn't mentioned it, casually surface this to him next time you speak, but don't alarm Pops.` : ""}`;
}

function buildRaySystemPrompt(liveContext: string, cycleDay: number | null, isZombiePhase: boolean, overdue?: { isOverdue: boolean; daysOverdue: number }): string {
  return `You are Jessica — br(AI)n's operations AI for Ray, Pops' caregiver and son.

RAY MODE: Direct and operational. Ray is the caregiver — he needs status, decisions, and results fast. No therapy-speak. No filler. Respond like a sharp ops partner to a busy family caregiver. Max 2-3 sentences unless Ray asks for detail.

${liveContext}

Haldol Cycle: Day ${cycleDay ?? "unknown"} of 14.${isZombiePhase ? " ⚠️ ZOMBIE PHASE (days 1-5) — Pops is in high-symptom window. Keep all Pops-facing activities minimal and low-pressure." : ""}${overdue?.isOverdue ? ` ⚠️ INJECTION OVERDUE — ${overdue.daysOverdue} day(s) past the expected 14-day window. Lead with this — Ray needs to know his next Haldol injection is late.` : ""}

ACTIONS — emit these blocks invisibly after your response when Ray gives instructions. JSON must be a single line. Never show delimiters to Ray.

ADD_EVENT or ADD_TASK — Ray schedules something:
---ACTION---
{"type":"ADD_EVENT","title":"event title","quarter":"Q1","timeLabel":"0800","details":"context"}
---END_ACTION---
Quarters: Q1=Morning, Q2=Afternoon, Q3=Evening, Q4=Night

TOGGLE_SMART_DEVICE — Ray controls a device:
---ACTION---
{"type":"TOGGLE_SMART_DEVICE","device":"device_key","state":"on","details":"context"}
---END_ACTION---
Valid devices: living_room_echo, bedroom_echo, kitchen_echo, sonos_living, sonos_bedroom, porch_light, kitchen_light, living_room_light

GROCERY_ORDER — Ray says "order groceries", "build the cart", "what's on the list", "order food":
---ACTION---
{"type":"GROCERY_ORDER","details":"context"}
---END_ACTION---
When emitting GROCERY_ORDER, say: "Pulling up the cart now." The system reads back the full summary automatically.

ADD_MEAL_TO_CART — Ray names a specific meal to add:
---ACTION---
{"type":"ADD_MEAL_TO_CART","mealName":"meal name as stated"}
---END_ACTION---

APPROVE_CART — Ray says "commit", "go ahead", "place the order", "looks good":
---ACTION---
{"type":"APPROVE_CART","details":"approved"}
---END_ACTION---

CANCEL_CART — Ray says "cancel", "never mind", "hold off", "don't order":
---ACTION---
{"type":"CANCEL_CART","details":"cancelled"}
---END_ACTION---

SCHEDULE_APPOINTMENT — Ray or a caller mentions a specific upcoming doctor visit or appointment with a date:
---ACTION---
{"type":"SCHEDULE_APPOINTMENT","date":"YYYY-MM-DD","time":"HH:MM","provider":"doctor or clinic name","apptType":"primary_care","notes":"any context"}
---END_ACTION---
Appointment types: primary_care, psychiatry, neurology, cardiology, other
Parse relative dates ("Tuesday the 15th", "next Monday") into YYYY-MM-DD based on today's date. If only a month/day is mentioned, assume the next upcoming occurrence.

Informational stream (no action needed — system logs these automatically):
MED_CONFIRMED → {"type":"MED_CONFIRMED","title":"med taken","details":"context"}
MED_REFUSED → {"type":"MED_REFUSED","title":"med skipped","details":"reason"}
WELLBEING_ALERT → {"type":"WELLBEING_ALERT","title":"concern","details":"what was said"}`;
}

async function synthesizeToBase64(text: string): Promise<string | null> {
  try {
    // Strip any residual system tags before synthesis
    const cleanText = text
      .replace(/<health_data>[\s\S]*?<\/health_data>/g, "")
      .replace(/<device_command>[\s\S]*?<\/device_command>/g, "")
      .replace(/<craving>[\s\S]*?<\/craving>/g, "")
      .replace(/---ACTION---[\s\S]*?---END_ACTION---/g, "")
      .trim();
    if (!cleanText) return null;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ role: "user" as const, parts: [{ text: cleanText }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
      },
    });

    const inlineData = (result as any).candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) return null;

    // Gemini TTS returns raw signed 16-bit PCM at 24kHz mono (audio/L16;rate=24000).
    // Wrap it in a minimal WAV header so the browser's decodeAudioData can handle it.
    const pcmBytes = Buffer.from(inlineData.data as string, "base64");
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const dataSize = pcmBytes.length;
    const header = Buffer.alloc(44);
    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8, "ascii");
    header.write("fmt ", 12, "ascii");
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36, "ascii");
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcmBytes]).toString("base64");
  } catch {
    return null;
  }
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

function parseActionBlocksRaw(text: string): Array<{ type: string; [key: string]: unknown }> {
  const results: Array<{ type: string; [key: string]: unknown }> = [];
  const regex = /---ACTION---\s*([\s\S]*?)\s*---END_ACTION---/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed?.type) results.push(parsed);
    } catch { /* skip malformed blocks */ }
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
    .replace(/---ACTION---[\s\S]*?---END_ACTION---/g, "")
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
    .replace(/---ACTION---[\s\S]*?---END_ACTION---/g, "")
    .trim();
  // 2. Strip unclosed open tag / action block (opened but closing tag not yet arrived)
  result = result.replace(/<health_data>[\s\S]*$/, "").trim();
  result = result.replace(/<device_command>[\s\S]*$/, "").trim();
  result = result.replace(/<craving>[\s\S]*$/, "").trim();
  result = result.replace(/---ACTION---[\s\S]*$/, "").trim();
  // 3. Strip partial tag prefix at end of string
  const tagPrefixes = ["<health_data", "</health_data", "<device_command", "</device_command", "<craving", "</craving", "---ACTION---", "---END_ACTION---"];
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

export async function getCurrentCycleInfo(): Promise<{ cycleDay: number | null; isZombiePhase: boolean; isOverdue: boolean; daysOverdue: number }> {
  try {
    const rows = await db.select().from(haldolCycleTable).orderBy(desc(haldolCycleTable.id)).limit(1);
    if (!rows[0]) return { cycleDay: null, isZombiePhase: false, isOverdue: false, daysOverdue: 0 };
    const injection = new Date(rows[0].lastInjectionDate);
    const today = new Date();
    const diffMs = today.getTime() - injection.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    const cycleDay = (diffDays % 14) + 1;
    // diffDays >= 14 means the dosing window closed without a new injection
    // being logged — see the matching invariant in haldol.ts's computeCycleInfo.
    const isOverdue = diffDays >= 14;
    const daysOverdue = isOverdue ? diffDays - 13 : 0;
    return { cycleDay, isZombiePhase: cycleDay <= 5, isOverdue, daysOverdue };
  } catch {
    return { cycleDay: null, isZombiePhase: false, isOverdue: false, daysOverdue: 0 };
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

  return { cleanContent, healthDataTags, sessionId: sessionRows[0]?.id ?? null };
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
      res.status(423).json({
        error: "quiet_window",
        message: `Jessica is in quiet mode until ${settings.quietWindowEnd}. Pops should be resting.`,
      });
      return;
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
    if (!convo) { res.status(404).json({ error: "Not found" }); return; }
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
    const { content, speak, mode } = z.object({ content: z.string(), speak: z.boolean().optional(), mode: z.enum(["ray", "pops"]).optional() }).parse(req.body);

    const [userMsg] = await db
      .insert(messagesTable)
      .values({ conversationId, role: "user", content })
      .returning();

    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.createdAt));

    const { cycleDay, isZombiePhase, isOverdue, daysOverdue } = await getCurrentCycleInfo();
    const liveContext = await loadLiveContext();
    const questions = await getActiveQuestionsForCycleDay(cycleDay);
    const systemPrompt = mode === "ray"
      ? buildRaySystemPrompt(liveContext, cycleDay, isZombiePhase, { isOverdue, daysOverdue })
      : buildJessicaSystemPrompt(questions, cycleDay, isZombiePhase, liveContext, { isOverdue, daysOverdue });

    const activeModel = await getActiveModel();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(`data: ${JSON.stringify({ userMessageId: userMsg.id })}\n\n`);

    if (activeModel.provider === "lmstudio" && activeModel.lmStudioModelId) {
      // LM Studio path — streamed word-by-word, same delta-flush pattern as Gemini below.
      const openaiMessages: Array<{ role: string; content: string }> = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      ];

      let fullResponse = "";
      let prevSafeLength = 0;
      try {
        for await (const delta of streamLmStudio(openaiMessages, activeModel.lmStudioModelId)) {
          fullResponse += delta;
          const currentSafe = getStreamSafeVisible(fullResponse);
          const safeDelta = currentSafe.slice(prevSafeLength);
          if (safeDelta) {
            res.write(`data: ${JSON.stringify({ content: safeDelta })}\n\n`);
            prevSafeLength = currentSafe.length;
          }
        }
      } catch (lmErr: unknown) {
        const errMsg = lmErr instanceof Error ? lmErr.message : "LM Studio not running — check that it's open and the model is loaded";
        res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
        res.end();
        return;
      }

      const visibleContent = getStreamSafeVisible(fullResponse);
      const finalDelta = visibleContent.slice(prevSafeLength);
      if (finalDelta) {
        res.write(`data: ${JSON.stringify({ content: finalDelta })}\n\n`);
      }

      const deviceCommand = parseDeviceCommand(fullResponse);
      const cravingMeal = parseCravingTag(fullResponse);
      const { healthDataTags, sessionId } = await savePostProcessing(req, conversationId, fullResponse, questions, cravingMeal);
      const parsedActions = parseActionBlocksRaw(fullResponse);
      const tenantId = (req as any).tenantSession?.sub;
      if (tenantId && parsedActions.length > 0) {
        await dispatchAll(parsedActions as HermesAction[], { tenantId, sessionId: sessionId ?? undefined, cycleDay, source: "jessica", actor: "jessica" });
      } else if (!tenantId) {
        req.log.warn("Hermes: tenantSession.sub missing — skipping dispatchAll to prevent cross-tenant ledger writes");
      }

      // TTS synthesis — only when caller requested speech and content exists
      let audioBase64: string | null = null;
      if (speak && visibleContent) {
        audioBase64 = await synthesizeToBase64(visibleContent);
        if (audioBase64) {
          res.write(`data: ${JSON.stringify({ audio: audioBase64 })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true, deviceCommand: deviceCommand ?? undefined, healthDataCount: healthDataTags.length, hasAudio: !!audioBase64, actions: parsedActions })}\n\n`);
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

      const flushDelta = (text: string) => {
        fullResponse += text;
        const currentSafe = getStreamSafeVisible(fullResponse);
        const delta = currentSafe.slice(prevSafeLength);
        if (delta) {
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          prevSafeLength = currentSafe.length;
        }
      };

      try {
        const stream = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: chatMessages,
          config: { maxOutputTokens: 8192 },
        });

        for await (const chunk of stream) {
          if (chunk.text) flushDelta(chunk.text);
        }
      } catch (geminiErr) {
        // Gemini's API is down/erroring — don't let the whole check-in fail
        // silently. Fall back to whatever LM Studio has loaded locally, if
        // anything, and only give up if neither provider is reachable.
        req.log.error({ err: geminiErr }, "Gemini stream failed — checking for a local model fallback");
        const fallbackModelId = await findAvailableLocalModelId();
        if (!fallbackModelId) {
          res.write(`data: ${JSON.stringify({ error: "Jessica's main AI is temporarily unavailable, and no local backup model is running." })}\n\n`);
          res.end();
          return;
        }
        const fallbackMessages: Array<{ role: string; content: string }> = [
          { role: "system", content: systemPrompt },
          ...history.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        ];
        try {
          for await (const delta of streamLmStudio(fallbackMessages, fallbackModelId)) {
            flushDelta(delta);
          }
        } catch (lmErr) {
          req.log.error({ err: lmErr }, "Local model fallback also failed");
          res.write(`data: ${JSON.stringify({ error: "Jessica's main AI is temporarily unavailable, and the local backup model also failed to respond." })}\n\n`);
          res.end();
          return;
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
      const { healthDataTags, sessionId } = await savePostProcessing(req, conversationId, fullResponse, questions, cravingMeal);
      const parsedActions = parseActionBlocksRaw(fullResponse);
      const tenantId = (req as any).tenantSession?.sub;
      if (tenantId && parsedActions.length > 0) {
        await dispatchAll(parsedActions as HermesAction[], { tenantId, sessionId: sessionId ?? undefined, cycleDay, source: "jessica", actor: "jessica" });
      } else if (!tenantId) {
        req.log.warn("Hermes: tenantSession.sub missing — skipping dispatchAll to prevent cross-tenant ledger writes");
      }

      // TTS synthesis — only when caller requested speech
      let audioBase64: string | null = null;
      if (speak && finalSafe) {
        audioBase64 = await synthesizeToBase64(finalSafe);
        if (audioBase64) {
          res.write(`data: ${JSON.stringify({ audio: audioBase64 })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true, deviceCommand: deviceCommand ?? undefined, healthDataCount: healthDataTags.length, hasAudio: !!audioBase64, actions: parsedActions })}\n\n`);
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
