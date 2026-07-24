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
  | "MEDICAL_DOC_APPLIED";

export interface HermesAction {
  type: HermesActionType;
  title?: string;
  quarter?: string;
  details?: string;
  device?: string;
  state?: "on" | "off";
  [key: string]: unknown;
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

async function handleAddScheduleItem(action: HermesAction, ctx: LedgerContext): Promise<void> {
  const quarter = (action.quarter as string) ?? "Q1";
  const title = (action.title as string) ?? "Jessica-created item";
  await db.insert(scheduleTasksTable).values({
    quarter,
    timeLabel: action.type === "ADD_EVENT" ? "Event" : "Task",
    title,
    description: action.details as string | undefined,
    isActive: true,
    isCompleted: false,
    order: 99,
  });
  logger.info({ action }, `[Hermes] ${action.type} → schedule_tasks`);
  await writeLedger(action, ctx, "dispatched", { doctorRelevant: true, learningRelevant: true });
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
export async function dispatch(action: HermesAction, ctx: LedgerContext): Promise<void> {
  try {
    switch (action.type) {
      case "ADD_EVENT":
      case "ADD_TASK":
        await handleAddScheduleItem(action, ctx);
        break;
      case "TOGGLE_SMART_DEVICE":
        await handleToggleDevice(action, ctx);
        break;
      case "MED_CONFIRMED":
        await handleMedConfirmed(action, ctx);
        break;
      case "MED_REFUSED":
        await handleMedRefused(action, ctx);
        break;
      case "WELLBEING_ALERT":
        await handleWellbeingAlert(action, ctx);
        break;
      case "MEDICAL_DOC_APPLIED":
        await writeLedger(action, ctx, "completed");
        break;
      default:
        logger.warn({ action }, "[Hermes] Unknown action type — skipped");
        await writeLedger(action, ctx, "skipped");
    }
  } catch (err) {
    logger.warn({ err, action }, "[Hermes] Dispatch failed — non-fatal");
    await writeLedger(action, ctx, "failed").catch(() => {});
  }
}

/**
 * Dispatch multiple actions in parallel.
 * Uses allSettled so one failure never blocks the others.
 */
export async function dispatchAll(actions: HermesAction[], ctx: LedgerContext): Promise<void> {
  await Promise.allSettled(actions.map((a) => dispatch(a, ctx)));
}
