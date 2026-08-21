import { useState } from "react";
import { useLocation } from "wouter";
import { formatPacificDateTime, formatPacificLongDate, formatPacificDate } from "@/lib/time";
import { Printer, FileText, Download, Flag, ChevronLeft, Info } from "lucide-react";
import { useGetDoctorReport, type DoctorReport as DoctorReportPayload } from "@workspace/api-client-react";
import { formatDoctorReportText, SOURCE_LABELS, NO_DATA, labelType } from "@/lib/doctor-report-text";
import { Button } from "@/components/ui/button";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold text-gray-900 mb-3 uppercase tracking-wide border-b border-gray-200 pb-2">
      {children}
    </h2>
  );
}

function NoData() {
  return <p className="text-sm text-gray-500 italic">{NO_DATA}</p>;
}

function SourceTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50 text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
      {children}
    </span>
  );
}

function FlagTag() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-[11px] font-semibold text-amber-700 uppercase tracking-wide">
      <Flag size={10} /> System flag
    </span>
  );
}

function ReportBody({ report }: { report: DoctorReportPayload }) {
  const a = report.dataAvailability;
  const meds = report.medications;

  return (
    <div className="space-y-8 report-content">
      <section className="print:break-inside-avoid border border-gray-300 rounded-lg p-4 bg-gray-50">
        <p className="text-sm text-gray-700 leading-relaxed">{report.scopeStatement}</p>
        <div className="mt-3 text-xs text-gray-600 leading-relaxed">
          <span className="font-bold uppercase tracking-wide">Data source legend:</span>{" "}
          <strong>Recorded response</strong> — wording documented from a check-in question ·{" "}
          <strong>Caregiver entry</strong> — entered by the caregiver ·{" "}
          <strong>System flag</strong> — automated threshold marker, not a clinical judgment ·{" "}
          <strong>Care event</strong> — action recorded in the app's care log
        </div>
      </section>

      <section className="print:break-inside-avoid">
        <SectionHeading>Documented records in this period</SectionHeading>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            ["Check-in sessions", a.checkIns],
            ["Recorded responses", a.observations],
            ["Caregiver symptom entries", a.symptomEntries],
            ["Care task outcomes", a.taskOutcomeEvents],
            ["Medication events", a.medicationEvents],
            ["Medication adjustments", a.medicationAdjustments],
            ["Care events", a.careEvents],
            ["Appointments in period", a.appointmentsInPeriod],
          ].map(([label, count]) => (
            <div key={label} className="border rounded-lg p-3 bg-white print:border-gray-300 text-center">
              <div className="text-xl font-bold text-gray-800">{count}</div>
              <div className="text-xs text-gray-500 uppercase tracking-widest mt-1">{label}</div>
            </div>
          ))}
        </div>
        {report.observationCategories.length > 0 && (
          <p className="text-xs text-gray-500 mt-3">
            Responses by topic:{" "}
            {report.observationCategories
              .map((c) => `${labelType(c.category)} ${c.responseCount}${c.systemFlagCount > 0 ? ` (${c.systemFlagCount} flagged)` : ""}`)
              .join(" · ")}
          </p>
        )}
      </section>

      <section className="print:break-inside-avoid">
        <SectionHeading>Medications</SectionHeading>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">Current medication list (as configured by caregiver)</h3>
            {meds.activeMedications.length === 0 ? (
              <NoData />
            ) : (
              <ul className="text-sm text-gray-800 space-y-1">
                {meds.activeMedications.map((m, i) => (
                  <li key={i} className="border rounded p-2 bg-white print:border-gray-300">
                    <strong>{m.name}</strong> {m.dose} · {m.frequency} · {m.timeOfDay}
                    {m.notes && <span className="text-gray-500"> — {m.notes}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">Injection record</h3>
            {meds.injectionCycle ? (
              <div className="text-sm text-gray-800 border rounded p-2 bg-white print:border-gray-300">
                Last documented injection: <strong>{meds.injectionCycle.lastInjectionDate}</strong>
                {meds.injectionCycle.doseMg != null && <> ({meds.injectionCycle.doseMg} mg)</>} · prescriber-set interval{" "}
                {meds.injectionCycle.intervalDays} days · {meds.injectionCycle.daysSinceInjection} day(s) since last documented injection.
                <div className="text-xs text-gray-500 mt-1">
                  Next date by interval arithmetic (computed, not a recommendation): {meds.injectionCycle.nextInjectionDate}
                </div>
                {meds.injectionCycle.notes && (
                  <div className="text-xs text-gray-500 mt-1">Caregiver notes: {meds.injectionCycle.notes}</div>
                )}
              </div>
            ) : (
              <NoData />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">Medication adjustments (caregiver-recorded)</h3>
            {meds.adjustments.length === 0 ? (
              <NoData />
            ) : (
              <ul className="text-sm text-gray-800 space-y-1">
                {meds.adjustments.map((adj, i) => (
                  <li key={i} className="border rounded p-2 bg-white print:border-gray-300">
                    {adj.adjustmentDate}: <strong>{adj.medication}</strong>{" "}
                    {adj.previousDose ?? "(previous dose not documented)"} → {adj.newDose}
                    {adj.reason ? <span className="text-gray-500"> — reason recorded: {adj.reason}</span> : <span className="text-gray-500"> — no reason documented</span>}
                    <span className="text-xs text-gray-400"> · logged by {adj.loggedBy}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">Medication confirmations / refusals</h3>
            {meds.medEvents.length === 0 ? (
              <NoData />
            ) : (
              <ul className="text-sm text-gray-800 space-y-1">
                {meds.medEvents.map((ev, i) => (
                  <li key={i} className="border rounded p-2 bg-white print:border-gray-300 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">{formatPacificDateTime(ev.occurredAt)}</span>
                    <SourceTag>Care event</SourceTag>
                    <span className={ev.outcome === "refused" ? "font-semibold text-red-700" : "font-semibold"}>{ev.outcome}</span>
                    {ev.detail && <span className="text-gray-600">{ev.detail}</span>}
                    <span className="text-xs text-gray-400">recorded by {ev.recordedBy} via {labelType(ev.source)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="print:break-inside-avoid">
        <SectionHeading>Recorded check-in responses</SectionHeading>
        {report.observations.length === 0 ? (
          <NoData />
        ) : (
          <div className="space-y-2">
            {report.observations.map((o, i) => (
              <div key={i} className="border rounded-lg p-3 bg-white print:border-gray-300">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs text-gray-500">{formatPacificDateTime(o.recordedAt)}</span>
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{labelType(o.category)}</span>
                  <SourceTag>Recorded response — {SOURCE_LABELS[o.source] ?? o.source}</SourceTag>
                  {o.systemFlagged && <FlagTag />}
                </div>
                {o.questionText && <p className="text-xs text-gray-500">Question asked: {o.questionText}</p>}
                <p className="text-sm text-gray-800 italic">"{o.response}"</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="print:break-inside-avoid">
        <SectionHeading>Caregiver symptom entries</SectionHeading>
        {report.symptomEntries.length === 0 ? (
          <NoData />
        ) : (
          <div className="space-y-2">
            {report.symptomEntries.map((s, i) => (
              <div key={i} className="border rounded-lg p-3 bg-white text-sm print:border-gray-300">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">{formatPacificDateTime(s.loggedAt)}</span>
                  <SourceTag>Caregiver entry — {s.loggedBy}</SourceTag>
                  <span className="text-xs text-gray-600">PTSD trigger noted: <strong>{s.ptsdTrigger ? "yes" : "no"}</strong></span>
                  <span className="text-xs text-gray-600">Hallucination intensity recorded: <strong>{s.hallucinationIntensity}</strong></span>
                  <span className="text-xs text-gray-600">Motivation recorded: <strong>{s.motivationLevel}</strong></span>
                </div>
                {s.notes && <p className="text-xs text-gray-500 mt-1 italic">Notes as documented: "{s.notes}"</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="print:break-inside-avoid">
        <SectionHeading>Care task outcomes</SectionHeading>
        {report.taskOutcomes.entries.length === 0 ? (
          <NoData />
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-2">
              Recorded in period: <strong>{report.taskOutcomes.counts.completed}</strong> completed,{" "}
              <strong>{report.taskOutcomes.counts.refused}</strong> refused.
            </p>
            <div className="space-y-1">
              {report.taskOutcomes.entries.map((t, i) => (
                <div key={i} className="border rounded p-2 bg-white text-sm print:border-gray-300 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">{formatPacificDateTime(t.occurredAt)}</span>
                  <span>{t.taskTitle ?? "(task name not documented)"}</span>
                  <span className={t.outcome === "refused" ? "font-semibold text-red-700" : "font-semibold text-gray-800"}>{t.outcome}</span>
                  <span className="text-xs text-gray-400">recorded by {t.recordedBy} via {labelType(t.source)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="print:break-inside-avoid">
        <SectionHeading>Care events</SectionHeading>
        {report.careEvents.length === 0 ? (
          <NoData />
        ) : (
          <div className="space-y-1">
            {report.careEvents.map((ev, i) => (
              <div key={i} className="border rounded p-2 bg-white text-sm print:border-gray-300 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">{formatPacificDateTime(ev.occurredAt)}</span>
                <SourceTag>Care event</SourceTag>
                <span className="font-semibold text-gray-800">{labelType(ev.eventType)}</span>
                {ev.description && <span className="text-gray-600">{ev.description}</span>}
                {ev.severity && <span className="text-xs text-gray-600">severity recorded: {ev.severity}</span>}
                <span className="text-xs text-gray-400">{ev.actor} via {labelType(ev.source)} · {ev.outcome}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="print:break-inside-avoid">
        <SectionHeading>Check-in sessions</SectionHeading>
        {report.checkIns.length === 0 ? (
          <NoData />
        ) : (
          <div className="space-y-1">
            {report.checkIns.map((c, i) => (
              <div key={i} className="border rounded p-2 bg-white text-sm print:border-gray-300">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">{formatPacificDate(c.sessionDate + "T12:00:00Z")}</span>
                  <SourceTag>{SOURCE_LABELS[c.source] ?? c.source}</SourceTag>
                  {!c.reached && <span className="text-xs text-gray-600">not reached</span>}
                  {c.systemFlagged && <FlagTag />}
                </div>
                {c.automatedSummary && (
                  <p className="text-xs text-gray-500 mt-1">
                    <span className="font-semibold">Automated summary (AI-generated, not a clinical assessment):</span>{" "}
                    {c.automatedSummary}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="print:break-inside-avoid">
        <SectionHeading>Appointments</SectionHeading>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">In reporting period (chronological)</h3>
            {report.appointments.inPeriod.length === 0 ? (
              <NoData />
            ) : (
              <AppointmentList items={report.appointments.inPeriod} />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">Upcoming (chronological)</h3>
            {report.appointments.upcoming.length === 0 ? (
              <p className="text-sm text-gray-500 italic">None documented.</p>
            ) : (
              <AppointmentList items={report.appointments.upcoming} />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function AppointmentList({ items }: { items: DoctorReportPayload["appointments"]["inPeriod"] }) {
  return (
    <ul className="text-sm text-gray-800 space-y-1">
      {items.map((ap, i) => (
        <li key={i} className="border rounded p-2 bg-white print:border-gray-300">
          <strong>{ap.appointmentDate} {ap.appointmentTime}</strong> · {ap.provider} · {labelType(ap.type)}
          {ap.location && <span className="text-gray-500"> · {ap.location}</span>}
          {ap.notes && <span className="text-gray-500"> — {ap.notes}</span>}
        </li>
      ))}
    </ul>
  );
}

export function DoctorReport() {
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const [, navigate] = useLocation();
  const { data: report, isLoading, error } = useGetDoctorReport({ period });

  const handlePrint = () => window.print();

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([formatDoctorReportText(report)], { type: "text/plain" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `doctor-report-${report.periodStart}-to-${report.periodEnd}.txt`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #doctor-report-print, #doctor-report-print * { visibility: visible; }
          #doctor-report-print { position: absolute; inset: 0; padding: 2cm; }
          .print\\:hidden { display: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .print\\:border-gray-300 { border-color: #d1d5db !important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 print:bg-white">
        <div className="print:hidden bg-white border-b border-border px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/admin")}
              className="flex items-center gap-1.5 text-xs font-display uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors border border-border/50 rounded-sm px-2.5 py-1.5 hover:bg-secondary/50"
              title="Back to Admin"
            >
              <ChevronLeft size={14} />
              Admin
            </button>
            <span className="text-border/60 text-sm">|</span>
            <FileText size={20} className="text-primary" />
            <div>
              <h1 className="text-lg font-display font-bold text-primary tracking-widest uppercase leading-none">Doctor Report</h1>
              <p className="text-xs text-muted-foreground">Caregiver-recorded documentation for clinical review</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 border border-border rounded-md p-1 bg-secondary/30">
              <button
                onClick={() => setPeriod("weekly")}
                className={`px-3 py-1.5 text-xs font-display uppercase tracking-widest rounded-sm transition-colors ${period === "weekly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => setPeriod("monthly")}
                className={`px-3 py-1.5 text-xs font-display uppercase tracking-widest rounded-sm transition-colors ${period === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Last 30 Days
              </button>
            </div>
            <Button onClick={handleDownload} size="sm" variant="outline" className="gap-2" disabled={!report}>
              <Download size={14} />
              Download .txt
            </Button>
            <Button onClick={handlePrint} size="sm" variant="outline" className="gap-2" disabled={!report}>
              <Printer size={14} />
              Print / PDF
            </Button>
          </div>
        </div>

        <div className="print:hidden max-w-4xl mx-auto px-6 pt-4">
          <div className="flex items-start gap-2 text-xs text-muted-foreground border border-border/50 rounded-md p-3 bg-white">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>
              This report compiles what was documented in the app during the selected window: check-in responses (verbatim),
              caregiver symptom entries, recorded care task and medication outcomes, care events, medication records, and
              appointments. Anything not documented is shown as not documented — it is never summarized or filled in.
              Use Print / PDF for a clinician-ready copy.
            </p>
          </div>
        </div>

        <div id="doctor-report-print" className="max-w-4xl mx-auto px-6 py-8 print:px-0 print:py-0">
          <div className="print-header mb-8">
            <h1 className="text-2xl font-bold text-gray-900 print:block hidden">Care Documentation Report</h1>
            <p className="text-sm text-gray-500 mt-1">
              Reporting period: {report ? `${formatPacificDate(report.periodStart + "T12:00:00Z")} – ${formatPacificDate(report.periodEnd + "T12:00:00Z")}` : "…"}{" "}
              ({period === "weekly" ? "7 days" : "30 days"})
              {report && <> · Generated {formatPacificLongDate(report.generatedAt)}</>}
            </p>
          </div>

          {isLoading && <div className="py-20 text-center text-muted-foreground">Loading report…</div>}
          {error != null && !isLoading && !report && (
            <div className="py-20 text-center text-destructive">Failed to load report.</div>
          )}
          {report && !isLoading && <ReportBody report={report} />}
        </div>
      </div>
    </>
  );
}
