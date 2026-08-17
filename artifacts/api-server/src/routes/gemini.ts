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
import { eq, and, asc, desc } from "drizzle-orm";
import { z } from "zod";
import { saveHealthDataPoint, getActiveQuestionsForCycleDay, getSettings, isInQuietWindow } from "./health-assessment";
import { ensureMealsSeeded } from "./shopper";
import { todayPacific, to12Hour } from "../lib/pacific-time";
import { quarterForHour } from "../lib/jessica-tools";
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

import { computeHaldolCycle, DEFAULT_INTERVAL_DAYS } from "../lib/haldol-cycle";

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

/** Same shape as the helper in schedule.ts/state.ts/symptoms.ts. */
function geminiTenantId(req: any): string {
  const session = req.tenantSession;
  return session?.type === "local" ? "local" : (session?.sub ?? "local");
}

/**
 * Builds the live schedule/symptom/meal context injected into Jessica's system
 * prompt.
 *
 * `tenantId` is REQUIRED in spirit even though it defaults: `schedule_tasks`
 * and `symptom_logs` are tenant-scoped, and until 2026-08-16 this function
 * queried both with no tenant predicate at all. The public demo workspace
 * (DEMO_TENANT_ID, re-seeded on every boot by runTenantMigration) therefore
 * bled straight into Pops' real calls — Jessica was reading a phantom 0700
 * "Morning Medication" and 1930 "Evening Medication" that are not his, and all
 * three "recent symptom logs" were demo rows. Never drop the tenant filter.
 */
export async function loadLiveContext(tenantId: string = "local"): Promise<string> {
  try {
    const [meals, schedule, symptoms, carts, showerStreakRow] = await Promise.all([
      db.select({ id: mealsTable.id, name: mealsTable.name, estimatedCostCents: mealsTable.estimatedCostCents })
        .from(mealsTable).where(eq(mealsTable.active, true)).limit(20),
      // No limit: with 30+ active tasks a cap silently truncated the tail of
      // the day — on 2026-08-15 that dropped Q4's "Mail" and "Journal"
      // entirely, so Jessica was never told the journal existed. Ordering is
      // explicit for the same reason: without it, *which* tasks survived was
      // arbitrary. `timeLabel`/`tier`/`voiceScript` are selected so the
      // rendered schedule can carry times and priority instead of a bare list.
      db.select({
        id: scheduleTasksTable.id,
        title: scheduleTasksTable.title,
        quarter: scheduleTasksTable.quarter,
        timeLabel: scheduleTasksTable.timeLabel,
        tier: scheduleTasksTable.tier,
        voiceScript: scheduleTasksTable.voiceScript,
        isCompleted: scheduleTasksTable.isCompleted,
        status: scheduleTasksTable.status,
      })
        .from(scheduleTasksTable)
        .where(and(eq(scheduleTasksTable.isActive, true), eq(scheduleTasksTable.tenantId, tenantId)))
        .orderBy(asc(scheduleTasksTable.quarter), asc(scheduleTasksTable.timeLabel), asc(scheduleTasksTable.order)),
      db.select().from(symptomLogsTable)
        .where(eq(symptomLogsTable.tenantId, tenantId))
        .orderBy(desc(symptomLogsTable.loggedAt)).limit(3),
      db.select().from(groceryCartsTable).orderBy(desc(groceryCartsTable.id)).limit(1),
      db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "shower_skip_streak")).limit(1),
    ]);

    const mealList = meals.length > 0
      ? meals.map((m) => `  - ${m.name} (~$${((m.estimatedCostCents ?? 0) / 100).toFixed(2)})`).join("\n")
      : "  (no active meals in catalog yet)";

    // Which quarter is live right now. Ray's boundaries, not clock-even —
    // single source of truth is quarterForHour (lib/jessica-tools.ts).
    const nowHour = Number(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", hour: "numeric", hour12: false,
    }).format(new Date()));
    const currentQuarter = quarterForHour(nowHour % 24);

    const scheduleByQ: Record<string, string[]> = {};
    for (const t of schedule) {
      const q = t.quarter ?? "Q1";
      if (!scheduleByQ[q]) scheduleByQ[q] = [];
      // Refused and no-answer are shown distinctly — Jessica shouldn't re-ask
      // a task Pops already declined this day as if nothing happened.
      const mark = t.status === "refused" ? "✗(declined)" : t.status === "no_answer" ? "?(no answer)" : t.isCompleted ? "✓" : "○";
      // "0730" -> "7:30 AM". 12-hour only: Pops hears these read aloud, and
      // "twenty-one fifteen" is not how he tells time. Internal scheduling
      // (quarterForHour, time_label storage) stays 24-hour — display only.
      const time = to12Hour(t.timeLabel ?? "");
      const script = t.voiceScript ? ` — say: "${t.voiceScript}"` : "";
      scheduleByQ[q].push(`    ${mark} ${time} ${t.title} [${t.tier}]${script}`);
    }
    const QUARTER_LABEL: Record<string, string> = {
      Q1: "Q1 morning 6:00–10:00",
      Q2: "Q2 midday 10:00–14:00",
      Q3: "Q3 afternoon 14:00–18:00",
      Q4: "Q4 wind-down 18:00–6:00",
    };
    const scheduleStr = Object.entries(scheduleByQ).sort()
      .map(([q, items]) => {
        const here = q === currentQuarter ? "  ◀ HAPPENING NOW" : "";
        return `  ${QUARTER_LABEL[q] ?? q}:${here}\n${items.join("\n")}`;
      }).join("\n") || "  (no active schedule tasks)";

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

    // Shower cadence: surfaces ONLY at 3+ consecutive skipped days, and only
    // as a single gentle check-in cue — occasional skips are normal and are
    // deliberately not mentioned to Jessica at all.
    const showerStreak = parseInt(showerStreakRow[0]?.value ?? "0", 10);
    const showerNote = showerStreak >= 3
      ? `\n\nHYGIENE NOTE: It's been ${showerStreak} days since the last shower. Once this call, gently and without any shame, check in about it ("thinking a shower might feel good today?"). Do not lecture, do not repeat it, and drop it completely if he declines.`
      : "";

    return `LIVE SYSTEM CONTEXT (refreshed each message):
Meal Catalog — active meals available to add to cart:
${mealList}

This Week's Grocery Cart: ${cartStr}

TODAY'S SCHEDULE — THIS IS THE SPINE OF THE CALL.
The day runs in four quarters. You are in ${currentQuarter} right now.
Work the OPEN (○) items of ${currentQuarter}, in the listed time order, one at a
time. That is the point of the call — the health questions further down are
woven in around it, never instead of it. Do not read other quarters aloud
unless Pops asks what's coming; do not re-raise ✓ done or ✗ declined items.
When he confirms one actually happened, call complete_task for it.
${scheduleStr}

Recent Symptom Logs (latest 3):
${symptomStr}${showerNote}`;
  } catch {
    return "LIVE SYSTEM CONTEXT: (unavailable — DB query failed)";
  }
}

export function buildJessicaSystemPrompt(questions: { id: number; text: string; category: string; responseType: string; higherIsBetter: boolean }[], cycleDay: number | null, isZombiePhase: boolean, liveContext?: string, overdue?: { isOverdue: boolean; daysOverdue: number; intervalDays?: number; zombiePhaseDays?: number }, opts?: { channel?: "phone" | "text" }): string {
  // Phone calls use ElevenLabs' real-time tool-calling (Task #116) instead of
  // the invisible ---ACTION--- text markers below — the phone webhook never
  // parses those blocks, so on a live call they'd silently do nothing. Text
  // chat (the default) keeps the original marker-based flow unchanged.
  const channel = opts?.channel ?? "text";
  const toneProfile = overdue?.isOverdue
    ? `Pops' Haldol injection is overdue — his caregiver has not logged a new dose within the expected ${overdue?.intervalDays ?? DEFAULT_INTERVAL_DAYS}-day window. Gently ask whether he's seen anyone about his injection recently, without alarming him, and keep the check-in soft and brief either way.`
    : isZombiePhase
    ? "Today is a rest day for Pops — his Haldol cycle is in the high-symptom phase (days 1-5). Keep everything soft, brief, and low-pressure. No long conversations. Gentle check-ins only."
    : "Today is a normal day for Pops. You can be warm, engaged, and conversational. Keep him anchored and positive.";

  const questionList = questions.slice(0, 12).map((q, i) => `${i + 1}. [${q.category}|qid:${q.id}] "${q.text}"`).join("\n");

  const scriptSection = "";

  // Text chat keeps the original invisible-marker instructions verbatim.
  // Phone calls get real ElevenLabs tool-calling guidance instead (Task
  // #116) — the phone webhook never parses ---ACTION--- blocks, so on a live
  // call the old instructions would just silently do nothing.
  const addEventGuidance = channel === "phone" ? "" : `ADD_EVENT — Pops mentions or confirms an upcoming appointment or event:
---ACTION---
{"type":"ADD_EVENT","title":"event title","quarter":"Q1","details":"brief context"}
---END_ACTION---

`;
  const addTaskGuidance = channel === "phone" ? `TASK & SCHEDULE TOOLS — CRITICAL (these are real tool calls, not text blocks):
- add_task(title, time, details?) — Pops or Ray asks to add something to the daily schedule (a task, reminder, or event). Always get a specific time in 24-hour HH:MM Pacific before calling it — if Pops/Ray only says something vague like "in the morning", ask what time it should be first.
- remove_task(title) — Pops or Ray asks to take something off the schedule.
- reschedule_task(title, time) — Pops or Ray asks to move an existing task to a new time (HH:MM Pacific).
- complete_task(title, source?) — Pops (or a family member on the call) explicitly confirms a schedule task actually happened. Only on a live confirmation in THIS call — never because you asked, reminded, or assume it probably happened. source is "family" when a family member confirmed instead of Pops himself.
- refuse_task(title) — Pops clearly declines a task ("no, I'm not doing that"). This is different from not answering or changing the subject. After recording it, acknowledge kindly and move on — no pressure.
- update_daily_call_schedule(enabled?, time?) — Ray asks to turn the automated daily call on/off, or change what time it happens (must be between 6:00 AM and 8:00 PM).

After any of these tool calls, speak the tool's returned confirmation message back naturally in your own words — that's how Pops/Ray know it actually worked. If a call fails (ambiguous task name, an invalid time, or a system hiccup), read back the tool's message as a spoken clarifying question instead of staying silent, guessing, or claiming it worked when it didn't.

` : `ADD_TASK — Pops confirms a care task, medication, or routine action was completed or should be logged:
---ACTION---
{"type":"ADD_TASK","title":"task title","quarter":"Q1","details":"brief context"}
---END_ACTION---

COMPLETE_TASK — Pops (or a family member) explicitly confirms a schedule task actually happened. Only on a live confirmation — never because you asked or assume it happened. source is "spoken" (default) or "family":
---ACTION---
{"type":"COMPLETE_TASK","title":"task title as it appears on the schedule","source":"spoken"}
---END_ACTION---

REFUSE_TASK — Pops clearly declines a task (different from not answering). Record it, then acknowledge kindly and move on — no pressure:
---ACTION---
{"type":"REFUSE_TASK","title":"task title as it appears on the schedule"}
---END_ACTION---

`;

  const morningRoutineRules = `DAILY ROUTINE RULES:
- Morning order (guide him through it gently, one thing at a time): wake → water → let Koda out → make the bed → tidy the room → shower/hygiene → breakfast. Never rattle off the whole list at once.
- Out of bed: if you're checking whether he's up, one warm nudge only. Never nag, never repeat, never guilt.
- Koda (the dog): the task is DONE once Koda is out, fed, and watered. A walk is a separate bonus — celebrate it if it happens, never mention it as missing. Bad weather or Pops feeling unwell NEVER makes the dog task a failure.
- Shower: expected most days, but an occasional skip is fine and never worth a comment. Only bring it up if the system context includes a HYGIENE NOTE. Teeth, deodorant, and clean clothes are their own small daily item regardless of the shower.
- Breakfast: ask what he ate and how much — all, some, or none. "All" or "some" counts as done (record it, and emit an appetite health_data tag). "None" is a decline — record it as a refusal, don't push, and let Ray's dashboard handle it.
- Water check-ins (4x/day): only count the water as done when he confirms drinking it DURING this call — "I'll have some later" is not a completion. Encourage warmly, never lecture.
`;

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
- Walk Pops through the OPEN items of the current quarter above, in time order, one at a time. This is the main purpose of every call.
- Have a natural conversation with Pops — he experiences you as a friend checking in, not a clinical interview
- Weave today's health check-in questions naturally into conversation — never read them as a list
- Help with daily routine reminders, medication check-ins, and general wellbeing
- Answer questions about the day, schedule, medications, or how he's feeling
- You know what meals are coming this week and can mention them casually ("we've got your favorites lined up")
- Parse smart home commands and confirm them (e.g. "turn on the living room light")
- Be a reassuring, steady presence. You are not a chatbot — you are family infrastructure.
${scriptSection}
${morningRoutineRules}
HEALTH CHECK-IN — SECONDARY to the schedule above. These are woven around the
quarter's tasks, not run as their own interview. Pick at most 2-3 per call that
fit what he's already talking about, and skip them entirely if the quarter's
items are taking the whole call. Never open a call with one of these:
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

${addEventGuidance}TOGGLE_SMART_DEVICE — Pops requests a device on/off:
---ACTION---
{"type":"TOGGLE_SMART_DEVICE","device":"device_key","state":"on","details":"brief context"}
---END_ACTION---
device must be one of: living_room_echo, bedroom_echo, kitchen_echo, sonos_living, sonos_bedroom, porch_light, kitchen_light, living_room_light

${addTaskGuidance}GROCERY_ORDER — Ray (or Pops) asks to build, review, check, or order the weekly grocery cart. Triggers: "order groceries", "build the cart", "what's on the shopping list", "what are we eating this week", "order food":
---ACTION---
{"type":"GROCERY_ORDER","details":"brief context"}
---END_ACTION---
When you emit GROCERY_ORDER, say something like: "Let me pull up the cart now." The system will read back the full summary automatically.

ADD_MEAL_TO_CART — Ray or Pops names a specific meal they want added to this week's cart:
---ACTION---
{"type":"ADD_MEAL_TO_CART","mealName":"exact meal name as stated"}
---END_ACTION---

ADD_GROCERY_ITEMS — Ray or Pops names one or more one-off grocery items to add to this week's cart (not a full meal). Triggers: "add milk and eggs", "put bread on the list", "we need paper towels":
---ACTION---
{"type":"ADD_GROCERY_ITEMS","items":["milk","eggs"]}
---END_ACTION---
When you emit ADD_GROCERY_ITEMS, confirm back exactly what you're adding, e.g. "Got it — adding milk and eggs to this week's cart."

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

Haldol Cycle: Day ${cycleDay ?? "unknown"} of ${overdue?.intervalDays ?? DEFAULT_INTERVAL_DAYS}.${overdue?.isOverdue ? ` ⚠️ INJECTION OVERDUE — ${overdue.daysOverdue} day(s) past the expected ${overdue.intervalDays ?? DEFAULT_INTERVAL_DAYS}-day window. If Ray hasn't mentioned it, casually surface this to him next time you speak, but don't alarm Pops.` : ""}`;
}

function buildRaySystemPrompt(liveContext: string, cycleDay: number | null, isZombiePhase: boolean, overdue?: { isOverdue: boolean; daysOverdue: number; intervalDays?: number; zombiePhaseDays?: number }): string {
  return `You are Jessica — br(AI)n's operations AI for Ray, Pops' caregiver and son.

RAY MODE: Direct and operational. Ray is the caregiver — he needs status, decisions, and results fast. No therapy-speak. No filler. Respond like a sharp ops partner to a busy family caregiver. Max 2-3 sentences unless Ray asks for detail.

${liveContext}

Haldol Cycle: Day ${cycleDay ?? "unknown"} of ${overdue?.intervalDays ?? DEFAULT_INTERVAL_DAYS}.${isZombiePhase ? ` ⚠️ ZOMBIE PHASE (days 1-${overdue?.zombiePhaseDays ?? 5}) — Pops is in high-symptom window. Keep all Pops-facing activities minimal and low-pressure.` : ""}${overdue?.isOverdue ? ` ⚠️ INJECTION OVERDUE — ${overdue.daysOverdue} day(s) past the expected ${overdue.intervalDays ?? DEFAULT_INTERVAL_DAYS}-day window. Lead with this — Ray needs to know his next Haldol injection is late.` : ""}

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

ADD_GROCERY_ITEMS — Ray names one or more one-off grocery items (not a full meal): "add milk and eggs", "put bread on the list":
---ACTION---
{"type":"ADD_GROCERY_ITEMS","items":["milk","eggs"]}
---END_ACTION---
When emitting ADD_GROCERY_ITEMS, confirm what you're adding, e.g. "Adding milk and eggs to the cart."

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

export async function getCurrentCycleInfo(): Promise<{ cycleDay: number | null; intervalDays: number; zombiePhaseDays: number; isZombiePhase: boolean; isOverdue: boolean; daysOverdue: number }> {
  const unknown = { cycleDay: null, intervalDays: DEFAULT_INTERVAL_DAYS, zombiePhaseDays: 5, isZombiePhase: false, isOverdue: false, daysOverdue: 0 };
  try {
    const rows = await db.select().from(haldolCycleTable).orderBy(desc(haldolCycleTable.id)).limit(1);
    if (!rows[0]) return unknown;
    const info = computeHaldolCycle(rows[0].lastInjectionDate, {
      intervalDays: rows[0].intervalDays,
      zombiePhaseDays: rows[0].zombiePhaseDays,
    });
    return {
      cycleDay: info.cycleDay,
      intervalDays: info.intervalDays,
      zombiePhaseDays: info.zombiePhaseDays,
      isZombiePhase: info.isZombiePhase,
      isOverdue: info.isOverdue,
      daysOverdue: info.daysOverdue,
    };
  } catch {
    return unknown;
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
    const today = todayPacific();
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

    const { cycleDay, isZombiePhase, isOverdue, daysOverdue, intervalDays, zombiePhaseDays } = await getCurrentCycleInfo();
    const liveContext = await loadLiveContext(geminiTenantId(req));
    const questions = await getActiveQuestionsForCycleDay(cycleDay);
    const cycle = { isOverdue, daysOverdue, intervalDays, zombiePhaseDays };
    const systemPrompt = mode === "ray"
      ? buildRaySystemPrompt(liveContext, cycleDay, isZombiePhase, cycle)
      : buildJessicaSystemPrompt(questions, cycleDay, isZombiePhase, liveContext, cycle);

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
      // Cart actions (incl. ADD_GROCERY_ITEMS) are dispatched by the phone UI
      // client alongside GROCERY_ORDER/ADD_MEAL_TO_CART — don't also dispatch
      // them here or spoken items would land in the cart twice.
      const serverActions = parsedActions.filter((a: any) => a?.type !== "ADD_GROCERY_ITEMS");
      const tenantId = (req as any).tenantSession?.sub;
      if (tenantId && serverActions.length > 0) {
        await dispatchAll(serverActions as HermesAction[], { tenantId, sessionId: sessionId ?? undefined, cycleDay, source: "jessica", actor: "jessica" });
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
      // Cart actions (incl. ADD_GROCERY_ITEMS) are dispatched by the phone UI
      // client alongside GROCERY_ORDER/ADD_MEAL_TO_CART — don't also dispatch
      // them here or spoken items would land in the cart twice.
      const serverActions = parsedActions.filter((a: any) => a?.type !== "ADD_GROCERY_ITEMS");
      const tenantId = (req as any).tenantSession?.sub;
      if (tenantId && serverActions.length > 0) {
        await dispatchAll(serverActions as HermesAction[], { tenantId, sessionId: sessionId ?? undefined, cycleDay, source: "jessica", actor: "jessica" });
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
