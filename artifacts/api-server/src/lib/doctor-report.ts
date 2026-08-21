/**
 * Doctor-report assembly — pure functions only, no DB access.
 *
 * The report is caregiver-recorded documentation for clinical review. It
 * carries exactly what was documented, when, and by which source; anything
 * not documented in the window is reported as absent (zero counts / empty
 * arrays), never replaced with a generated conclusion. Nothing in this file
 * may emit interpretive wording ("stable", "adherent", "concern") or any
 * hard-coded patient identity — see AGENTS.md rule 6 and issue #185.
 */

import { pacificDateOf, pacificWallTimeToEpochMs } from "./pacific-time";
import { computeHaldolCycle } from "./haldol-cycle";

export type ReportPeriod = "weekly" | "monthly";

export const SCOPE_STATEMENT =
  "Caregiver-recorded information compiled for clinical review. Entries are shown as documented in the caregiving app, with their source and date. This report is not a diagnosis, risk assessment, or treatment recommendation. Items marked as system flags are automated threshold markers, not clinical judgments.";

export interface ReportWindow {
  period: ReportPeriod;
  /** YYYY-MM-DD, Pacific — first calendar day included. */
  periodStart: string;
  /** YYYY-MM-DD, Pacific — last calendar day included (today). */
  periodEnd: string;
  /** Epoch ms of Pacific midnight starting periodStart — lower bound for timestamp columns. */
  startMs: number;
}

const PERIOD_DAYS: Record<ReportPeriod, number> = { weekly: 7, monthly: 30 };

export function resolveReportWindow(period: ReportPeriod, now: Date = new Date()): ReportWindow {
  const periodEnd = pacificDateOf(now.getTime());
  const days = PERIOD_DAYS[period];
  const [y, m, d] = periodEnd.split("-").map((v) => parseInt(v, 10));
  const endUtcMidnight = Date.UTC(y!, m! - 1, d!);
  const periodStart = new Date(endUtcMidnight - (days - 1) * 86_400_000)
    .toISOString()
    .split("T")[0]!;
  return { period, periodStart, periodEnd, startMs: pacificWallTimeToEpochMs(periodStart, "00:00") };
}

// ─── Input row shapes (structural subsets of the drizzle row types) ──────────

export interface SessionRow {
  id: number;
  sessionDate: string;
  startedAt: Date;
  endedAt: Date | null;
  summary: string | null;
  flagged: boolean;
  elevenlabsConversationId: string | null;
  reached: boolean;
}

export interface HealthPointRow {
  sessionId: number;
  questionId: number | null;
  category: string;
  rawResponse: string;
  parsedValue: string | null;
  parsedIntensity: string | null;
  flagged: boolean;
  createdAt: Date;
}

export interface QuestionRow {
  id: number;
  text: string;
}

export interface SymptomLogRow {
  loggedAt: Date;
  ptsdTrigger: boolean;
  hallucinationIntensity: number;
  motivationLevel: number;
  behaviorNotes: string | null;
  loggedBy: string;
}

export interface CareEventRow {
  createdAt: Date;
  eventType: string;
  source: string;
  actor: string;
  severity: string | null;
  outcome: string;
  payload: string;
  doctorRelevant: boolean;
}

export interface MedicationRow {
  name: string;
  dose: string;
  frequency: string;
  timeOfDay: string;
  notes: string | null;
}

export interface HaldolRow {
  lastInjectionDate: string;
  doseMg: number | null;
  intervalDays: number;
  zombiePhaseDays: number;
  notes: string | null;
}

export interface AdjustmentRow {
  adjustmentDate: string;
  medication: string;
  previousDose: string | null;
  newDose: string;
  reason: string | null;
  loggedBy: string;
}

export interface AppointmentRow {
  appointmentDate: string;
  appointmentTime: string;
  provider: string;
  location: string | null;
  type: string;
  notes: string | null;
}

export interface DoctorReportData {
  sessions: SessionRow[];
  healthPoints: HealthPointRow[];
  questions: QuestionRow[];
  symptomLogs: SymptomLogRow[];
  careEvents: CareEventRow[];
  medications: MedicationRow[];
  haldol: HaldolRow | null;
  adjustments: AdjustmentRow[];
  appointments: AppointmentRow[];
}

// ─── Event-type routing ──────────────────────────────────────────────────────
// The care_events ledger is the durable record of task/med outcomes —
// schedule_tasks resets nightly, so window-scoped counts must come from here.

// Maps, not object literals: eventType originates from LLM-emitted ACTION
// blocks written verbatim to the ledger, so a value like "constructor" must
// not resolve through Object.prototype into the wrong branch.
const TASK_EVENT_OUTCOME = new Map<string, "completed" | "refused">([
  ["COMPLETE_TASK", "completed"],
  ["REFUSE_TASK", "refused"],
]);
const MED_EVENT_OUTCOME = new Map<string, "confirmed" | "refused">([
  ["MED_CONFIRMED", "confirmed"],
  ["MED_REFUSED", "refused"],
]);
// Ledger rows for actions that failed or were skipped document an app
// malfunction, not a care outcome — they never count as completed/refused.
const RECORDED_OUTCOMES = new Set(["dispatched", "completed"]);

function payloadField(payload: string, ...keys: string[]): string | null {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    for (const key of keys) {
      const v = parsed[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  } catch {
    // Unparseable payload — keep the entry, just without a title/detail.
  }
  return null;
}

// ─── Assembly ────────────────────────────────────────────────────────────────

export function assembleDoctorReport(
  window: ReportWindow,
  data: DoctorReportData,
  generatedAt: Date = new Date(),
) {
  const sessionById = new Map(data.sessions.map((s) => [s.id, s]));
  const questionById = new Map(data.questions.map((q) => [q.id, q.text]));

  const sourceOf = (s: SessionRow) =>
    s.elevenlabsConversationId ? ("phone_call" as const) : ("app_check_in" as const);

  const checkIns = [...data.sessions]
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.startedAt.getTime() - b.startedAt.getTime())
    .map((s) => ({
      sessionDate: s.sessionDate,
      source: sourceOf(s),
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt ? s.endedAt.toISOString() : null,
      automatedSummary: s.summary,
      systemFlagged: s.flagged,
      reached: s.reached,
    }));

  const observations = data.healthPoints
    .filter((p) => sessionById.has(p.sessionId))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((p) => {
      const session = sessionById.get(p.sessionId)!;
      return {
        recordedAt: p.createdAt.toISOString(),
        sessionDate: session.sessionDate,
        source: sourceOf(session),
        category: p.category,
        questionText: p.questionId != null ? (questionById.get(p.questionId) ?? null) : null,
        response: p.rawResponse,
        parsedValue: p.parsedValue,
        parsedIntensity: p.parsedIntensity,
        systemFlagged: p.flagged,
      };
    });

  const categoryTally = new Map<string, { responseCount: number; systemFlagCount: number }>();
  for (const o of observations) {
    const t = categoryTally.get(o.category) ?? { responseCount: 0, systemFlagCount: 0 };
    t.responseCount++;
    if (o.systemFlagged) t.systemFlagCount++;
    categoryTally.set(o.category, t);
  }
  const observationCategories = [...categoryTally.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, t]) => ({ category, ...t }));

  const symptomEntries = [...data.symptomLogs]
    .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())
    .map((l) => ({
      loggedAt: l.loggedAt.toISOString(),
      ptsdTrigger: l.ptsdTrigger,
      hallucinationIntensity: l.hallucinationIntensity,
      motivationLevel: l.motivationLevel,
      notes: l.behaviorNotes,
      loggedBy: l.loggedBy,
      source: "caregiver_entry" as const,
    }));

  const orderedEvents = [...data.careEvents].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const taskEntries: {
    occurredAt: string;
    taskTitle: string | null;
    outcome: "completed" | "refused";
    recordedBy: string;
    source: string;
  }[] = [];
  const medEvents: {
    occurredAt: string;
    outcome: "confirmed" | "refused";
    detail: string | null;
    recordedBy: string;
    source: string;
  }[] = [];
  const otherEvents: {
    occurredAt: string;
    eventType: string;
    description: string | null;
    severity: string | null;
    source: string;
    actor: string;
    outcome: string;
  }[] = [];

  for (const ev of orderedEvents) {
    const taskOutcome = TASK_EVENT_OUTCOME.get(ev.eventType);
    const medOutcome = MED_EVENT_OUTCOME.get(ev.eventType);
    if (taskOutcome) {
      if (!RECORDED_OUTCOMES.has(ev.outcome)) continue;
      taskEntries.push({
        occurredAt: ev.createdAt.toISOString(),
        taskTitle: payloadField(ev.payload, "title", "details"),
        outcome: taskOutcome,
        recordedBy: ev.actor,
        source: ev.source,
      });
    } else if (medOutcome) {
      if (!RECORDED_OUTCOMES.has(ev.outcome)) continue;
      medEvents.push({
        occurredAt: ev.createdAt.toISOString(),
        outcome: medOutcome,
        detail: payloadField(ev.payload, "title", "details"),
        recordedBy: ev.actor,
        source: ev.source,
      });
    } else if (ev.doctorRelevant) {
      otherEvents.push({
        occurredAt: ev.createdAt.toISOString(),
        eventType: ev.eventType,
        description: payloadField(ev.payload, "title", "details"),
        severity: ev.severity,
        source: ev.source,
        actor: ev.actor,
        outcome: ev.outcome,
      });
    }
  }

  const activeMedications = [...data.medications]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({
      name: m.name,
      dose: m.dose,
      frequency: m.frequency,
      timeOfDay: m.timeOfDay,
      notes: m.notes,
    }));

  let injectionCycle: {
    lastInjectionDate: string;
    doseMg: number | null;
    intervalDays: number;
    nextInjectionDate: string;
    daysSinceInjection: number;
    notes: string | null;
  } | null = null;
  if (data.haldol) {
    const cycle = computeHaldolCycle(data.haldol.lastInjectionDate, {
      intervalDays: data.haldol.intervalDays,
      zombiePhaseDays: data.haldol.zombiePhaseDays,
      now: generatedAt,
    });
    injectionCycle = {
      lastInjectionDate: data.haldol.lastInjectionDate,
      doseMg: data.haldol.doseMg,
      intervalDays: cycle.intervalDays,
      nextInjectionDate: cycle.nextInjectionDate,
      daysSinceInjection: cycle.daysSinceInjection,
      notes: data.haldol.notes,
    };
  }

  const adjustments = [...data.adjustments]
    .sort((a, b) => a.adjustmentDate.localeCompare(b.adjustmentDate))
    .map((a) => ({
      adjustmentDate: a.adjustmentDate,
      medication: a.medication,
      previousDose: a.previousDose,
      newDose: a.newDose,
      reason: a.reason,
      loggedBy: a.loggedBy,
    }));

  const apptAsc = [...data.appointments].sort(
    (a, b) =>
      a.appointmentDate.localeCompare(b.appointmentDate) ||
      a.appointmentTime.localeCompare(b.appointmentTime),
  );
  const toAppt = (a: AppointmentRow) => ({
    appointmentDate: a.appointmentDate,
    appointmentTime: a.appointmentTime,
    provider: a.provider,
    location: a.location,
    type: a.type,
    notes: a.notes,
  });
  const inPeriod = apptAsc
    .filter((a) => a.appointmentDate >= window.periodStart && a.appointmentDate <= window.periodEnd)
    .map(toAppt);
  const upcoming = apptAsc.filter((a) => a.appointmentDate > window.periodEnd).map(toAppt);

  return {
    period: window.period,
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    generatedAt: generatedAt.toISOString(),
    scopeStatement: SCOPE_STATEMENT,
    dataAvailability: {
      checkIns: checkIns.length,
      observations: observations.length,
      symptomEntries: symptomEntries.length,
      taskOutcomeEvents: taskEntries.length,
      medicationEvents: medEvents.length,
      medicationAdjustments: adjustments.length,
      activeMedications: activeMedications.length,
      careEvents: otherEvents.length,
      appointmentsInPeriod: inPeriod.length,
      upcomingAppointments: upcoming.length,
      injectionRecordOnFile: injectionCycle !== null,
    },
    checkIns,
    observations,
    observationCategories,
    symptomEntries,
    taskOutcomes: {
      counts: {
        completed: taskEntries.filter((t) => t.outcome === "completed").length,
        refused: taskEntries.filter((t) => t.outcome === "refused").length,
      },
      entries: taskEntries,
    },
    medications: {
      activeMedications,
      injectionCycle,
      adjustments,
      medEvents,
    },
    careEvents: otherEvents,
    appointments: { inPeriod, upcoming },
  };
}

export type DoctorReportPayload = ReturnType<typeof assembleDoctorReport>;
