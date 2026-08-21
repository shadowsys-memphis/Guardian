/**
 * doctor-report assembly — pure-function coverage for issue #185:
 * window resolution, source attribution, verbatim preservation, date
 * ordering, window-scoped task counts, explicit no-data states, and the
 * "no hard-coded identity / no generated conclusions" guarantees.
 */

import { describe, it, expect } from "vitest";
import {
  resolveReportWindow,
  assembleDoctorReport,
  SCOPE_STATEMENT,
  type DoctorReportData,
  type CareEventRow,
} from "./doctor-report";

// Noon PDT on 2026-08-21 — safely inside one Pacific calendar day.
const NOW = new Date("2026-08-21T19:00:00Z");

const EMPTY: DoctorReportData = {
  sessions: [],
  healthPoints: [],
  questions: [],
  symptomLogs: [],
  careEvents: [],
  medications: [],
  haldol: null,
  adjustments: [],
  appointments: [],
};

function careEvent(overrides: Partial<CareEventRow>): CareEventRow {
  return {
    createdAt: new Date("2026-08-18T17:00:00Z"),
    eventType: "COMPLETE_TASK",
    source: "jessica",
    actor: "patient",
    severity: null,
    outcome: "dispatched",
    payload: JSON.stringify({ type: "COMPLETE_TASK", title: "Morning walk" }),
    doctorRelevant: true,
    ...overrides,
  };
}

describe("resolveReportWindow", () => {
  it("weekly covers 7 Pacific calendar days inclusive", () => {
    const w = resolveReportWindow("weekly", NOW);
    expect(w.periodEnd).toBe("2026-08-21");
    expect(w.periodStart).toBe("2026-08-15");
    // Lower bound is Pacific midnight of periodStart (PDT = UTC-7).
    expect(new Date(w.startMs).toISOString()).toBe("2026-08-15T07:00:00.000Z");
  });

  it("monthly covers 30 Pacific calendar days inclusive", () => {
    const w = resolveReportWindow("monthly", NOW);
    expect(w.periodEnd).toBe("2026-08-21");
    expect(w.periodStart).toBe("2026-07-23");
  });
});

describe("assembleDoctorReport — empty reporting period", () => {
  const report = assembleDoctorReport(resolveReportWindow("weekly", NOW), EMPTY, NOW);

  it("reports every section as not documented, never substituting a conclusion", () => {
    expect(report.checkIns).toEqual([]);
    expect(report.observations).toEqual([]);
    expect(report.symptomEntries).toEqual([]);
    expect(report.taskOutcomes.entries).toEqual([]);
    expect(report.taskOutcomes.counts).toEqual({ completed: 0, refused: 0 });
    expect(report.careEvents).toEqual([]);
    expect(report.medications.activeMedications).toEqual([]);
    expect(report.medications.injectionCycle).toBeNull();
    expect(report.medications.adjustments).toEqual([]);
    expect(report.medications.medEvents).toEqual([]);
    expect(report.appointments).toEqual({ inPeriod: [], upcoming: [] });
    expect(report.dataAvailability.injectionRecordOnFile).toBe(false);
    for (const [key, value] of Object.entries(report.dataAvailability)) {
      if (key === "injectionRecordOnFile") continue;
      expect(value).toBe(0);
    }
  });

  it("carries the reporting window and the caregiver-recorded scope statement", () => {
    expect(report.period).toBe("weekly");
    expect(report.periodStart).toBe("2026-08-15");
    expect(report.periodEnd).toBe("2026-08-21");
    expect(report.generatedAt).toBe(NOW.toISOString());
    expect(report.scopeStatement).toBe(SCOPE_STATEMENT);
    expect(report.scopeStatement).toMatch(/not a diagnosis/i);
  });

  it("contains no hard-coded identity and no interpretive wording", () => {
    const serialized = JSON.stringify(report);
    for (const banned of [
      "Pops",
      "Vietnam",
      "Veteran",
      "Schizophrenia",
      "Ray (son)",
      "stable",
      "adherent",
      "adherence",
      "Concern",
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });
});

describe("assembleDoctorReport — source attribution", () => {
  const window = resolveReportWindow("weekly", NOW);
  const data: DoctorReportData = {
    ...EMPTY,
    sessions: [
      {
        id: 1,
        sessionDate: "2026-08-18",
        startedAt: new Date("2026-08-18T17:00:00Z"),
        endedAt: new Date("2026-08-18T17:10:00Z"),
        summary: "Automated summary text",
        flagged: false,
        elevenlabsConversationId: "conv_123",
        reached: true,
      },
      {
        id: 2,
        sessionDate: "2026-08-19",
        startedAt: new Date("2026-08-19T17:00:00Z"),
        endedAt: null,
        summary: null,
        flagged: true,
        elevenlabsConversationId: null,
        reached: true,
      },
    ],
    healthPoints: [
      {
        sessionId: 2,
        questionId: 7,
        category: "sleep",
        rawResponse: "Slept okay I guess, woke up twice",
        parsedValue: null,
        parsedIntensity: null,
        flagged: false,
        createdAt: new Date("2026-08-19T17:02:00Z"),
      },
      {
        sessionId: 1,
        questionId: null,
        category: "voices",
        rawResponse: "They were loud this morning",
        parsedValue: "yes",
        parsedIntensity: "severe",
        flagged: true,
        createdAt: new Date("2026-08-18T17:03:00Z"),
      },
      // Belongs to a session outside the window — must be excluded.
      {
        sessionId: 99,
        questionId: null,
        category: "mood",
        rawResponse: "out of window",
        parsedValue: null,
        parsedIntensity: null,
        flagged: false,
        createdAt: new Date("2026-08-01T17:00:00Z"),
      },
    ],
    questions: [{ id: 7, text: "How'd you sleep last night?" }],
    symptomLogs: [
      {
        loggedAt: new Date("2026-08-20T02:00:00Z"),
        ptsdTrigger: true,
        hallucinationIntensity: 4,
        motivationLevel: 2,
        behaviorNotes: "Paced the hallway after dinner",
        loggedBy: "Raymo",
      },
    ],
  };
  const report = assembleDoctorReport(window, data, NOW);

  it("labels phone calls and app check-ins by mechanism", () => {
    expect(report.checkIns.map((c) => c.source)).toEqual(["phone_call", "app_check_in"]);
    expect(report.observations.find((o) => o.sessionDate === "2026-08-18")?.source).toBe("phone_call");
    expect(report.observations.find((o) => o.sessionDate === "2026-08-19")?.source).toBe("app_check_in");
  });

  it("preserves recorded wording verbatim and joins the question asked", () => {
    const sleep = report.observations.find((o) => o.category === "sleep")!;
    expect(sleep.response).toBe("Slept okay I guess, woke up twice");
    expect(sleep.questionText).toBe("How'd you sleep last night?");
    const voices = report.observations.find((o) => o.category === "voices")!;
    expect(voices.questionText).toBeNull();
  });

  it("keeps flags as system flags on the specific observation", () => {
    expect(report.observations.find((o) => o.category === "voices")?.systemFlagged).toBe(true);
    expect(report.observations.find((o) => o.category === "sleep")?.systemFlagged).toBe(false);
  });

  it("excludes data points whose session is outside the window", () => {
    expect(report.observations).toHaveLength(2);
    expect(JSON.stringify(report.observations)).not.toContain("out of window");
  });

  it("labels caregiver symptom entries with their author and preserves notes", () => {
    expect(report.symptomEntries).toHaveLength(1);
    const entry = report.symptomEntries[0]!;
    expect(entry.source).toBe("caregiver_entry");
    expect(entry.loggedBy).toBe("Raymo");
    expect(entry.notes).toBe("Paced the hallway after dinner");
  });

  it("tallies observation categories with flag counts", () => {
    expect(report.observationCategories).toEqual([
      { category: "sleep", responseCount: 1, systemFlagCount: 0 },
      { category: "voices", responseCount: 1, systemFlagCount: 1 },
    ]);
  });
});

describe("assembleDoctorReport — task and medication outcomes from the ledger", () => {
  const window = resolveReportWindow("weekly", NOW);
  const data: DoctorReportData = {
    ...EMPTY,
    careEvents: [
      careEvent({}), // COMPLETE_TASK, dispatched → counted
      careEvent({
        eventType: "REFUSE_TASK",
        createdAt: new Date("2026-08-19T18:00:00Z"),
        payload: JSON.stringify({ type: "REFUSE_TASK", title: "Shower" }),
      }),
      // Failed dispatch — an app malfunction record, never a care outcome.
      careEvent({ eventType: "COMPLETE_TASK", outcome: "failed" }),
      careEvent({
        eventType: "MED_CONFIRMED",
        createdAt: new Date("2026-08-20T15:00:00Z"),
        payload: JSON.stringify({ type: "MED_CONFIRMED", details: "morning meds" }),
      }),
      careEvent({
        eventType: "WELLBEING_ALERT",
        severity: "moderate",
        createdAt: new Date("2026-08-17T15:00:00Z"),
        payload: JSON.stringify({ type: "WELLBEING_ALERT", details: "Reported not eating" }),
      }),
      // Not doctor-relevant and not a task/med type — excluded entirely.
      careEvent({ eventType: "ADD_GROCERY_ITEMS", doctorRelevant: false }),
      // Unparseable payload — entry kept, title null.
      careEvent({
        eventType: "COMPLETE_TASK",
        createdAt: new Date("2026-08-21T01:00:00Z"),
        payload: "not-json{",
      }),
    ],
  };
  const report = assembleDoctorReport(window, data, NOW);

  it("counts only recorded outcomes inside the window", () => {
    expect(report.taskOutcomes.counts).toEqual({ completed: 2, refused: 1 });
    expect(report.dataAvailability.taskOutcomeEvents).toBe(3);
  });

  it("routes medication events to the medications section", () => {
    expect(report.medications.medEvents).toHaveLength(1);
    expect(report.medications.medEvents[0]!.outcome).toBe("confirmed");
    expect(report.medications.medEvents[0]!.detail).toBe("morning meds");
    expect(report.taskOutcomes.entries.map((t) => t.outcome)).not.toContain("confirmed");
  });

  it("shows doctor-relevant events as system-recorded entries, excludes the rest", () => {
    expect(report.careEvents).toHaveLength(1);
    expect(report.careEvents[0]!.eventType).toBe("WELLBEING_ALERT");
    expect(report.careEvents[0]!.severity).toBe("moderate");
    expect(JSON.stringify(report)).not.toContain("ADD_GROCERY_ITEMS");
  });

  it("keeps entries with unparseable payloads, without a task title", () => {
    const untitled = report.taskOutcomes.entries.filter((t) => t.taskTitle === null);
    expect(untitled).toHaveLength(1);
  });

  it("orders task entries ascending by time", () => {
    const times = report.taskOutcomes.entries.map((t) => t.occurredAt);
    expect(times).toEqual([...times].sort());
  });

  it("routes event types colliding with Object.prototype keys to care events, not task outcomes", () => {
    const r = assembleDoctorReport(
      window,
      { ...EMPTY, careEvents: [careEvent({ eventType: "constructor" })] },
      NOW,
    );
    expect(r.taskOutcomes.entries).toEqual([]);
    expect(r.medications.medEvents).toEqual([]);
    expect(r.careEvents).toHaveLength(1);
    expect(r.careEvents[0]!.eventType).toBe("constructor");
  });
});

describe("assembleDoctorReport — medications and appointments", () => {
  const window = resolveReportWindow("weekly", NOW);
  const data: DoctorReportData = {
    ...EMPTY,
    medications: [
      { name: "Beta", dose: "10mg", frequency: "daily", timeOfDay: "morning", notes: null },
      { name: "Alpha", dose: "5mg", frequency: "daily", timeOfDay: "evening", notes: "with food" },
    ],
    haldol: {
      lastInjectionDate: "2026-08-10",
      doseMg: 100,
      intervalDays: 28,
      zombiePhaseDays: 5,
      notes: "cycle note",
    },
    adjustments: [
      { adjustmentDate: "2026-08-20", medication: "Alpha", previousDose: "2mg", newDose: "5mg", reason: null, loggedBy: "caregiver" },
      { adjustmentDate: "2026-08-16", medication: "Beta", previousDose: null, newDose: "10mg", reason: "per prescriber", loggedBy: "caregiver" },
    ],
    appointments: [
      { appointmentDate: "2026-09-02", appointmentTime: "09:00", provider: "Clinic B", location: null, type: "psychiatry", notes: null },
      { appointmentDate: "2026-08-25", appointmentTime: "14:00", provider: "Clinic A", location: "Downtown", type: "lab_work", notes: null },
      { appointmentDate: "2026-08-18", appointmentTime: "10:00", provider: "Clinic C", location: null, type: "primary_care", notes: "seen" },
    ],
  };
  const report = assembleDoctorReport(window, data, NOW);

  it("computes the injection schedule through the shared cycle math", () => {
    expect(report.medications.injectionCycle).toEqual({
      lastInjectionDate: "2026-08-10",
      doseMg: 100,
      intervalDays: 28,
      nextInjectionDate: "2026-09-07",
      daysSinceInjection: 11,
      notes: "cycle note",
    });
    expect(report.dataAvailability.injectionRecordOnFile).toBe(true);
  });

  it("sorts adjustments ascending by date", () => {
    expect(report.medications.adjustments.map((a) => a.adjustmentDate)).toEqual([
      "2026-08-16",
      "2026-08-20",
    ]);
  });

  it("splits appointments into in-period and upcoming, both ascending", () => {
    expect(report.appointments.inPeriod.map((a) => a.appointmentDate)).toEqual(["2026-08-18"]);
    expect(report.appointments.upcoming.map((a) => a.appointmentDate)).toEqual([
      "2026-08-25",
      "2026-09-02",
    ]);
  });
});
