/**
 * Guardian Hermes Adapter — v1
 *
 * Hermes is the app-wide orchestration, dispatch, and evidence-ledger layer
 * for Guardian OS. It has two permanent responsibilities:
 *
 * 1. IMMEDIATE DISPATCH
 *    Route structured care events to the correct downstream subsystem:
 *    tasks, medications, alerts, schedule, smart devices, health logs.
 *
 * 2. EVIDENCE LEDGER
 *    Record every dispatched event to care_events with full audit context:
 *    timestamp, source, actor, event type, payload, severity, confidence,
 *    outcome, and admin/caregiver intervention flag.
 *    This ledger is the factual foundation for doctor reports, pattern
 *    analysis, and future recursive care optimization.
 *
 * FULL HERMES BOUNDARY (builds incrementally — document scope now):
 *
 *   Source                    Hermes Role
 *   ──────────────────────────────────────────────────────────────────
 *   Jessica/Gemini ACTIONs    Dispatch + ledger (implemented here, v1)
 *   Admin approvals/overrides → Future: ledger entry, adminIntervention=true
 *   Med confirmations/refusals→ Future: dual-capture from Jessica + admin
 *   Chore/task events         → Future: schedule event ledger
 *   Smart device events       → Future: device ledger entries
 *   Doctor-file generation    → Reads from care_events, not AI memory
 *   Alert/escalation outcomes → Future: outcome field updated on resolution
 *   Learning loop             → Future: studies care_events for pattern signals
 *
 * Flow:
 *   Patient talks to Jessica
 *     ↓ Jessica/Gemini detects meaning + emits ACTION blocks
 *     ↓ Backend parses blocks via parseActionBlocksRaw()
 *     ↓ Hermes.dispatchAll() receives each structured action
 *     ↓ Hermes routes to the right subsystem (dispatch)
 *     ↓ Hermes writes factual care_events record (ledger)
 *     ↓ Doctor file reads from care_events
 *     ↓ Future learning engine studies outcomes
 */

import { db, pool } from "@workspace/db";
import {
  scheduleTasksTable,
  smartHomeDevicesTable,
  callSessionsTable,
  healthDataPointsTable,
  careEventsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import {
  findTaskMatches,
  describeTasks,
  nextOrderInQuarter,
  normalizeTimeToHHMM,
  quarterForTime,
  formatTimeLabel,
  toStoredTimeLabel,
} from "./jessica-tools";
import { applySettingsPatch, dailyCallTimeSchema } from "../routes/health-assessment";
import { inferTierFromTitle } from "./task-tiers";

let careEventsReady = false;
async function ensureCareEventsTable(): Promise<void> {
  if (careEventsReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS care_events (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'local',
      source TEXT NOT NULL DEFAULT 'jessica',
      actor TEXT NOT NULL DEFAULT 'jessica',
      event_type TEXT NOT NULL,
      session_id INTEGER,
      task_id INTEGER,
      medication_id INTEGER,
      severity TEXT,
      confidence TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      context TEXT,
      outcome TEXT NOT NULL DEFAULT 'dispatched',
      admin_intervention BOOLEAN NOT NULL DEFAULT FALSE,
      doctor_relevant BOOLEAN NOT NULL DEFAULT FALSE,
      learning_relevant BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  careEventsReady = true;
}

// ─── Action contract ─────────────────────────────────────────────────────────
// These types mirror the ACTION block format in Jessica's system prompt.
// Source of truth: buildJessicaSystemPrompt() in routes/gemini.ts

export type HermesSource = "jessica" | "admin" | "system" | "schedule" | "device" | "patient_app";
export type HermesActor = "jessica" | "patient" | "admin" | "caregiver" | "system";
export type HermesOutcome = "dispatched" | "completed" | "failed" | "skipped" | "pending";
export type HermesSeverity = "none" | "mild" | "moderate" | "severe";
export type HermesConfidence = "low" | "medium" | "high";

export type HermesActionType =
  | "ADD_EVENT"
  | "TOGGLE_SMART_DEVICE"
  | "ADD_TASK"
  | "MED_CONFIRMED"
  | "MED_REFUSED"
  | "WELLBEING_ALERT"
  | "MEDICAL_DOC_APPLIED"
  | "REMOVE_TASK"
  | "RESCHEDULE_TASK"
  | "UPDATE_CALL_SCHEDULE";

export interface HermesAction {
  type: HermesActionType;
  title?: string;
  quarter?: string;
  details?: string;
  device?: string;
  state?: "on" | "off";
  /** 24-hour "HH:MM" — used by ADD_TASK/RESCHEDULE_TASK (voice tool calls) and UPDATE_CALL_SCHEDULE. */
  time?: string;
  /** UPDATE_CALL_SCHEDULE only — turns the automated daily call on/off. */
  enabled?: boolean;
  [key: string]: unknown;
}

/**
 * Result of a single dispatch() call. Fire-and-forget callers (the text-chat
 * ACTION-block path) can ignore this; real-time voice tool calls need it to
 * build Jessica's spoken confirmation/clarification in the same response.
 */
export interface HermesDispatchResult {
  ok: boolean;
  message: string;
  outcome: HermesOutcome;
}

export interface LedgerContext {
  tenantId: string;           // required — first-class security boundary
  sessionId?: number;
  cycleDay?: number | null;
  source?: HermesSource;
  actor?: HermesActor;
  severity?: HermesSeverity;
  confidence?: HermesConfidence;
}

// ─── Evidence ledger ─────────────────────────────────────────────────────────

async function writeLedger(
  action: HermesAction,
  ctx: LedgerContext,
  outcome: HermesOutcome,
  options: { doctorRelevant?: boolean; learningRelevant?: boolean; adminIntervention?: boolean } = {}
): Promise<void> {
  try {
    await ensureCareEventsTable();
    await db.insert(careEventsTable).values({
      tenantId: ctx.tenantId,
      source: ctx.source ?? "jessica",
      actor: ctx.actor ?? "jessica",
      eventType: action.type,
      sessionId: ctx.sessionId ?? null,
      taskId: null,
      medicationId: null,
      severity: ctx.severity ?? null,
      confidence: ctx.confidence ?? null,
      payload: JSON.stringify(action),
      context: ctx.cycleDay != null ? JSON.stringify({ cycleDay: ctx.cycleDay }) : null,
      outcome,
      adminIntervention: options.adminIntervention ?? false,
      doctorRelevant: options.doctorRelevant ?? false,
      learningRelevant: options.learningRelevant ?? false,
    });
  } catch (err) {
    // Ledger write failure is non-fatal — dispatch already happened
    logger.warn({ err, action }, "[Hermes] Ledger write failed — dispatch was not rolled back");
  }
}

// ─── Dispatch handlers ───────────────────────────────────────────────────────

async function handleAddScheduleItem(action: HermesAction, ctx: LedgerContext): Promise<HermesDispatchResult> {
  const title = (action.title as string)?.trim();
  if (!title) {
    await writeLedger(action, ctx, "skipped");
    return { ok: false, message: "I didn't catch a task name — what should I add?", outcome: "skipped" };
  }

  // Voice tool calls (add_task) always send a real time; the older
  // text-chat ACTION-block path (ADD_EVENT/ADD_TASK) never did — preserve
  // its exact prior behavior (generic label, explicit/default quarter) when
  // no time is given.
  let quarter = (action.quarter as string) ?? "Q1";
  let timeLabel = action.type === "ADD_EVENT" ? "Event" : "Task";
  let spokenTime = "";
  if (action.time) {
    const normalized = normalizeTimeToHHMM(action.time);
    if (!normalized) {
      await writeLedger(action, ctx, "failed");
      return { ok: false, message: `"${action.time}" doesn't look like a valid time — could you give me a time like 3:00 PM?`, outcome: "failed" };
    }
    quarter = quarterForTime(normalized);
    timeLabel = toStoredTimeLabel(normalized);
    spokenTime = formatTimeLabel(normalized);
  }

  const order = await nextOrderInQuarter(ctx.tenantId, quarter);
  await db.insert(scheduleTasksTable).values({
    tenantId: ctx.tenantId,
    quarter,
    timeLabel,
    title,
    description: action.details as string | undefined,
    isActive: true,
    isCompleted: false,
    order,
    // Voice-created tasks carry no explicit tier — infer from the title so a
    // spoken "add his evening pills" escalates like medication, not a chore.
    // Ray can correct the tier from the dashboard afterward.
    tier: inferTierFromTitle(title),
  });
  logger.info({ action, tenantId: ctx.tenantId }, `[Hermes] ${action.type} → schedule_tasks`);
  await writeLedger(action, ctx, "dispatched", { doctorRelevant: true, learningRelevant: true });
  const confirmation = spokenTime ? `Added "${title}" to the schedule at ${spokenTime}.` : `Added "${title}" to the schedule.`;
  return { ok: true, message: confirmation, outcome: "dispatched" };
}

async function handleRemoveTask(action: HermesAction, ctx: LedgerContext): Promise<HermesDispatchResult> {
  const title = (action.title as string)?.trim();
  if (!title) {
    await writeLedger(action, ctx, "skipped");
    return { ok: false, message: "Which task should I remove?", outcome: "skipped" };
  }

  const matches = await findTaskMatches(ctx.tenantId, title);
  if (matches.length === 0) {
    await writeLedger(action, ctx, "failed");
    return { ok: false, message: `I couldn't find a task called "${title}" on the schedule. Could you tell me the exact task name?`, outcome: "failed" };
  }
  if (matches.length > 1) {
    await writeLedger(action, ctx, "failed");
    return { ok: false, message: `I found more than one task matching "${title}": ${describeTasks(matches)}. Which one should I remove?`, outcome: "failed" };
  }

  const task = matches[0];
  await db.delete(scheduleTasksTable).where(eq(scheduleTasksTable.id, task.id));
  logger.info({ action, taskId: task.id, tenantId: ctx.tenantId }, "[Hermes] REMOVE_TASK → schedule_tasks");
  await writeLedger(action, ctx, "dispatched", { doctorRelevant: true, learningRelevant: true });
  return { ok: true, message: `Removed "${task.title}" from the schedule.`, outcome: "dispatched" };
}

async function handleRescheduleTask(action: HermesAction, ctx: LedgerContext): Promise<HermesDispatchResult> {
  const title = (action.title as string)?.trim();
  const time = (action.time as string)?.trim();
  if (!title || !time) {
    await writeLedger(action, ctx, "skipped");
    return { ok: false, message: "I need both the task name and the new time to reschedule it.", outcome: "skipped" };
  }

  const normalized = normalizeTimeToHHMM(time);
  if (!normalized) {
    await writeLedger(action, ctx, "failed");
    return { ok: false, message: `"${time}" doesn't look like a valid time — could you give me a time like 3:00 PM?`, outcome: "failed" };
  }

  const matches = await findTaskMatches(ctx.tenantId, title);
  if (matches.length === 0) {
    await writeLedger(action, ctx, "failed");
    return { ok: false, message: `I couldn't find a task called "${title}" on the schedule. Could you tell me the exact task name?`, outcome: "failed" };
  }
  if (matches.length > 1) {
    await writeLedger(action, ctx, "failed");
    return { ok: false, message: `I found more than one task matching "${title}": ${describeTasks(matches)}. Which one should I reschedule?`, outcome: "failed" };
  }

  const task = matches[0];
  const quarter = quarterForTime(normalized);
  const timeLabel = toStoredTimeLabel(normalized);
  await db.update(scheduleTasksTable).set({ quarter, timeLabel }).where(eq(scheduleTasksTable.id, task.id));
  logger.info({ action, taskId: task.id, tenantId: ctx.tenantId }, "[Hermes] RESCHEDULE_TASK → schedule_tasks");
  await writeLedger(action, ctx, "dispatched", { doctorRelevant: true, learningRelevant: true });
  return { ok: true, message: `Moved "${task.title}" to ${formatTimeLabel(normalized)}.`, outcome: "dispatched" };
}

async function handleUpdateCallSchedule(action: HermesAction, ctx: LedgerContext): Promise<HermesDispatchResult> {
  const hasEnabled = typeof action.enabled === "boolean";
  const hasTime = typeof action.time === "string" && action.time.trim().length > 0;
  if (!hasEnabled && !hasTime) {
    await writeLedger(action, ctx, "skipped");
    return { ok: false, message: "Do you want to turn the daily call on or off, or change what time it happens?", outcome: "skipped" };
  }

  let dailyCallTime: string | undefined;
  if (hasTime) {
    const normalized = normalizeTimeToHHMM(action.time as string);
    const check = normalized ? dailyCallTimeSchema.safeParse(normalized) : null;
    if (!normalized || !check?.success) {
      await writeLedger(action, ctx, "failed");
      return { ok: false, message: "The daily call can only be scheduled between 6:00 AM and 8:00 PM — what time in that range works?", outcome: "failed" };
    }
    dailyCallTime = normalized;
  }

  const merged = await applySettingsPatch({
    ...(hasEnabled ? { dailyCallEnabled: action.enabled as boolean } : {}),
    ...(dailyCallTime ? { dailyCallTime } : {}),
  });
  logger.info({ action, merged }, "[Hermes] UPDATE_CALL_SCHEDULE → assessment_settings");
  await writeLedger(action, ctx, "dispatched", { doctorRelevant: false, learningRelevant: false });

  const label = formatTimeLabel(merged.dailyCallTime);
  const message = !merged.dailyCallEnabled
    ? "Okay, I've turned off the daily call."
    : hasEnabled && hasTime
      ? `Got it — daily calls are on, and I'll call at ${label}.`
      : hasTime
        ? `Done — I'll call at ${label} from now on.`
        : `Done — daily calls are turned on. I'll call at ${label}.`;
  return { ok: true, message, outcome: "dispatched" };
}

async function handleToggleDevice(action: HermesAction, ctx: LedgerContext): Promise<void> {
  const deviceKey = action.device as string | undefined;
  if (!deviceKey) {
    logger.warn({ action }, "[Hermes] TOGGLE_SMART_DEVICE missing device key — skipped");
    await writeLedger(action, ctx, "skipped");
    return;
  }
  const isOn = action.state === "on";
  await db
    .update(smartHomeDevicesTable)
    .set({ isOn, updatedAt: new Date() })
    .where(eq(smartHomeDevicesTable.deviceKey, deviceKey));
  logger.info({ deviceKey, isOn }, "[Hermes] TOGGLE_SMART_DEVICE → smart_home_devices");
  await writeLedger(action, { ...ctx, source: "device" }, "dispatched");
}

async function handleMedConfirmed(action: HermesAction, ctx: LedgerContext): Promise<void> {
  if (ctx.sessionId) {
    await db.insert(healthDataPointsTable).values({
      sessionId: ctx.sessionId,
      category: "medication",
      rawResponse: (action.details as string) ?? "Medication confirmed",
      parsedValue: "yes",
      parsedIntensity: null,
      flagged: false,
    });
  }
  logger.info({ action }, "[Hermes] MED_CONFIRMED → health_data_points");
  await writeLedger(action, { ...ctx, actor: "patient" }, "dispatched", {
    doctorRelevant: true,
    learningRelevant: true,
  });
}

async function handleMedRefused(action: HermesAction, ctx: LedgerContext): Promise<void> {
  if (ctx.sessionId) {
    await db.insert(healthDataPointsTable).values({
      sessionId: ctx.sessionId,
      category: "medication",
      rawResponse: (action.details as string) ?? "Medication refused",
      parsedValue: "no",
      parsedIntensity: null,
      flagged: true,
    });
  }
  logger.warn({ action }, "[Hermes] MED_REFUSED → health_data_points (flagged)");
  await writeLedger(action, { ...ctx, actor: "patient", severity: "moderate" }, "dispatched", {
    doctorRelevant: true,
    learningRelevant: true,
    adminIntervention: false,
  });
}

async function handleWellbeingAlert(action: HermesAction, ctx: LedgerContext): Promise<void> {
  const writes: Promise<unknown>[] = [
    writeLedger(action, { ...ctx, actor: "patient", severity: "severe" }, "dispatched", {
      doctorRelevant: true,
      learningRelevant: true,
    }),
  ];

  if (ctx.sessionId) {
    writes.push(
      db.update(callSessionsTable).set({ flagged: true }).where(eq(callSessionsTable.id, ctx.sessionId)),
      db.insert(healthDataPointsTable).values({
        sessionId: ctx.sessionId,
        category: "mood",
        rawResponse: (action.details as string) ?? (action.title as string) ?? "Wellbeing alert",
        parsedValue: "unsafe",
        parsedIntensity: "severe",
        flagged: true,
      })
    );
  }

  await Promise.all(writes);
  logger.warn({ action, sessionId: ctx.sessionId }, "[Hermes] WELLBEING_ALERT → session flagged + ledger");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Dispatch a single parsed Jessica action to the correct downstream system
 * and write a factual ledger entry to care_events.
 * Never throws — logs warnings on failure so one bad action never breaks a call.
 */
export async function dispatch(action: HermesAction, ctx: LedgerContext): Promise<HermesDispatchResult> {
  try {
    switch (action.type) {
      case "ADD_EVENT":
      case "ADD_TASK":
        return await handleAddScheduleItem(action, ctx);
      case "REMOVE_TASK":
        return await handleRemoveTask(action, ctx);
      case "RESCHEDULE_TASK":
        return await handleRescheduleTask(action, ctx);
      case "UPDATE_CALL_SCHEDULE":
        return await handleUpdateCallSchedule(action, ctx);
      case "TOGGLE_SMART_DEVICE":
        await handleToggleDevice(action, ctx);
        return { ok: true, message: "Done.", outcome: "dispatched" };
      case "MED_CONFIRMED":
        await handleMedConfirmed(action, ctx);
        return { ok: true, message: "Noted.", outcome: "dispatched" };
      case "MED_REFUSED":
        await handleMedRefused(action, ctx);
        return { ok: true, message: "Noted.", outcome: "dispatched" };
      case "WELLBEING_ALERT":
        await handleWellbeingAlert(action, ctx);
        return { ok: true, message: "Logged.", outcome: "dispatched" };
      case "MEDICAL_DOC_APPLIED":
        await writeLedger(action, ctx, "completed");
        return { ok: true, message: "Applied.", outcome: "completed" };
      default:
        logger.warn({ action }, "[Hermes] Unknown action type — skipped");
        await writeLedger(action, ctx, "skipped");
        return { ok: false, message: "I'm not able to do that yet.", outcome: "skipped" };
    }
  } catch (err) {
    logger.warn({ err, action }, "[Hermes] Dispatch failed — non-fatal");
    await writeLedger(action, ctx, "failed").catch(() => {});
    return { ok: false, message: "Something went wrong on my end — let's try that again in a moment.", outcome: "failed" };
  }
}

/**
 * Dispatch multiple actions in parallel.
 * Uses allSettled so one failure never blocks the others.
 */
export async function dispatchAll(actions: HermesAction[], ctx: LedgerContext): Promise<HermesDispatchResult[]> {
  const settled = await Promise.allSettled(actions.map((a) => dispatch(a, ctx)));
  return settled.map((s) =>
    s.status === "fulfilled" ? s.value : { ok: false, message: "Something went wrong.", outcome: "failed" as HermesOutcome }
  );
}
