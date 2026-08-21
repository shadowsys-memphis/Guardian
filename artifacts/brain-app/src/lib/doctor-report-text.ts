import type { DoctorReport } from "@workspace/api-client-react";
import { formatPacificDateTime, formatPacificDate } from "@/lib/time";

// Shared by the printable page (doctor-report.tsx) and this .txt renderer so
// the two outputs of the same clinician-facing document can't drift apart.
export const SOURCE_LABELS: Record<string, string> = {
  phone_call: "Jessica phone check-in",
  app_check_in: "App check-in",
  caregiver_entry: "Caregiver entry",
};

export const NO_DATA = "Not documented in this reporting period.";

export function labelType(type: string): string {
  return type.replace(/_/g, " ");
}

function heading(title: string): string[] {
  return ["", title.toUpperCase(), "-".repeat(title.length)];
}

/**
 * Renders the structured doctor report as a plain-text document suitable for
 * saving or handing to a clinician. Same rules as the printable page: every
 * line traces to a dated, labeled source; empty sections say so explicitly.
 */
export function formatDoctorReportText(report: DoctorReport): string {
  const lines: string[] = [
    "CARE DOCUMENTATION REPORT",
    `Reporting period: ${formatPacificDate(report.periodStart + "T12:00:00Z")} to ${formatPacificDate(report.periodEnd + "T12:00:00Z")} (${report.period === "weekly" ? "7 days" : "30 days"})`,
    `Generated: ${formatPacificDateTime(report.generatedAt)}`,
    "",
    report.scopeStatement,
    "",
    "Data sources: [Recorded response] wording documented from a check-in · [Caregiver entry] entered by the caregiver · [System flag] automated threshold marker, not a clinical judgment · [Care event] app-recorded care action",
  ];

  lines.push(...heading("Documented records in this period"));
  const a = report.dataAvailability;
  lines.push(
    `Check-in sessions: ${a.checkIns}`,
    `Recorded check-in responses: ${a.observations}`,
    `Caregiver symptom entries: ${a.symptomEntries}`,
    `Care task outcomes recorded: ${a.taskOutcomeEvents}`,
    `Medication confirmations/refusals recorded: ${a.medicationEvents}`,
    `Medication adjustments recorded: ${a.medicationAdjustments}`,
    `Care events recorded: ${a.careEvents}`,
    `Appointments in period: ${a.appointmentsInPeriod} · Upcoming: ${a.upcomingAppointments}`,
  );

  lines.push(...heading("Medications"));
  if (report.medications.activeMedications.length === 0) {
    lines.push(`Current medication list: ${NO_DATA}`);
  } else {
    lines.push("Current medication list (as configured by caregiver):");
    for (const m of report.medications.activeMedications) {
      lines.push(`  - ${m.name} ${m.dose}, ${m.frequency}, ${m.timeOfDay}${m.notes ? ` — ${m.notes}` : ""}`);
    }
  }
  const inj = report.medications.injectionCycle;
  if (inj) {
    lines.push(
      `Injection record: last documented injection ${inj.lastInjectionDate}${inj.doseMg != null ? ` (${inj.doseMg} mg)` : ""}, prescriber-set interval ${inj.intervalDays} days.`,
      `  Next date by interval arithmetic (computed, not a recommendation): ${inj.nextInjectionDate} — ${inj.daysSinceInjection} day(s) since last documented injection.`,
    );
    if (inj.notes) lines.push(`  Caregiver notes: ${inj.notes}`);
  } else {
    lines.push(`Injection record: ${NO_DATA}`);
  }
  if (report.medications.adjustments.length === 0) {
    lines.push(`Medication adjustments: ${NO_DATA}`);
  } else {
    lines.push("Medication adjustments (caregiver-recorded):");
    for (const adj of report.medications.adjustments) {
      lines.push(
        `  - ${adj.adjustmentDate}: ${adj.medication} ${adj.previousDose ?? "(previous dose not documented)"} -> ${adj.newDose}${adj.reason ? ` — reason recorded: ${adj.reason}` : " — no reason documented"} (logged by ${adj.loggedBy})`,
      );
    }
  }
  if (report.medications.medEvents.length === 0) {
    lines.push(`Medication confirmations/refusals: ${NO_DATA}`);
  } else {
    lines.push("Medication confirmations/refusals [Care event]:");
    for (const ev of report.medications.medEvents) {
      lines.push(
        `  - ${formatPacificDateTime(ev.occurredAt)}: ${ev.outcome}${ev.detail ? ` — ${ev.detail}` : ""} (recorded by ${ev.recordedBy} via ${ev.source})`,
      );
    }
  }

  lines.push(...heading("Recorded check-in responses"));
  if (report.observations.length === 0) {
    lines.push(NO_DATA);
  } else {
    for (const o of report.observations) {
      const src = SOURCE_LABELS[o.source] ?? o.source;
      lines.push(
        `- ${formatPacificDateTime(o.recordedAt)} · ${labelType(o.category)} · [Recorded response — ${src}]${o.systemFlagged ? " [System flag]" : ""}`,
      );
      if (o.questionText) lines.push(`    Question asked: ${o.questionText}`);
      lines.push(`    Response as documented: "${o.response}"`);
    }
  }

  lines.push(...heading("Caregiver symptom entries"));
  if (report.symptomEntries.length === 0) {
    lines.push(NO_DATA);
  } else {
    for (const s of report.symptomEntries) {
      lines.push(
        `- ${formatPacificDateTime(s.loggedAt)} [Caregiver entry — ${s.loggedBy}]: PTSD trigger noted: ${s.ptsdTrigger ? "yes" : "no"} · hallucination intensity recorded: ${s.hallucinationIntensity} · motivation recorded: ${s.motivationLevel}`,
      );
      if (s.notes) lines.push(`    Notes as documented: "${s.notes}"`);
    }
  }

  lines.push(...heading("Care task outcomes"));
  if (report.taskOutcomes.entries.length === 0) {
    lines.push(NO_DATA);
  } else {
    lines.push(
      `Recorded in period: ${report.taskOutcomes.counts.completed} completed, ${report.taskOutcomes.counts.refused} refused.`,
    );
    for (const t of report.taskOutcomes.entries) {
      lines.push(
        `- ${formatPacificDateTime(t.occurredAt)}: ${t.taskTitle ?? "(task name not documented)"} — ${t.outcome} (recorded by ${t.recordedBy} via ${t.source})`,
      );
    }
  }

  lines.push(...heading("Care events"));
  if (report.careEvents.length === 0) {
    lines.push(NO_DATA);
  } else {
    for (const ev of report.careEvents) {
      lines.push(
        `- ${formatPacificDateTime(ev.occurredAt)} [Care event]: ${labelType(ev.eventType)}${ev.description ? ` — ${ev.description}` : ""}${ev.severity ? ` · severity recorded: ${ev.severity}` : ""} (${ev.actor} via ${ev.source}, ${ev.outcome})`,
      );
    }
  }

  lines.push(...heading("Check-in sessions"));
  if (report.checkIns.length === 0) {
    lines.push(NO_DATA);
  } else {
    for (const c of report.checkIns) {
      lines.push(
        `- ${c.sessionDate} · ${SOURCE_LABELS[c.source] ?? c.source}${c.reached ? "" : " · not reached"}${c.systemFlagged ? " · [System flag]" : ""}`,
      );
      if (c.automatedSummary) {
        lines.push(`    Automated summary (AI-generated, not a clinical assessment): ${c.automatedSummary}`);
      }
    }
  }

  lines.push(...heading("Appointments"));
  if (report.appointments.inPeriod.length === 0) {
    lines.push(`In reporting period: ${NO_DATA}`);
  } else {
    lines.push("In reporting period (chronological):");
    for (const ap of report.appointments.inPeriod) {
      lines.push(
        `  - ${ap.appointmentDate} ${ap.appointmentTime} · ${ap.provider} · ${labelType(ap.type)}${ap.location ? ` · ${ap.location}` : ""}${ap.notes ? ` — ${ap.notes}` : ""}`,
      );
    }
  }
  if (report.appointments.upcoming.length === 0) {
    lines.push("Upcoming: none documented.");
  } else {
    lines.push("Upcoming (chronological):");
    for (const ap of report.appointments.upcoming) {
      lines.push(
        `  - ${ap.appointmentDate} ${ap.appointmentTime} · ${ap.provider} · ${labelType(ap.type)}${ap.location ? ` · ${ap.location}` : ""}${ap.notes ? ` — ${ap.notes}` : ""}`,
      );
    }
  }

  lines.push("", "End of report.");
  return lines.join("\n");
}
