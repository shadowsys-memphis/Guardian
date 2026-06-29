import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Printer, FileText, TrendingUp, AlertTriangle, CheckCircle2, XCircle, MinusCircle, Activity, ChevronLeft } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useGetWeeklyReport, useGetMonthlyReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CATEGORY_LABELS: Record<string, string> = {
  mood: "Mood", medication: "Medication", sleep: "Sleep", appetite: "Appetite",
  cognition: "Cognition", voices: "Voices", energy: "Energy", task: "Tasks",
};
const CATEGORY_ICONS: Record<string, string> = {
  mood: "😐", medication: "💊", sleep: "🌙", appetite: "🍽️",
  cognition: "🧠", voices: "👂", energy: "⚡", task: "✅",
};
const CAT_COLORS: Record<string, string> = {
  mood: "#fbbf24", medication: "#22c55e", sleep: "#818cf8", appetite: "#f97316",
  cognition: "#06b6d4", voices: "#ec4899", energy: "#84cc16", task: "#a78bfa",
};
const CATS = ["mood", "medication", "sleep", "appetite", "cognition", "voices", "energy", "task"];

function StatusIcon({ status }: { status: string }) {
  if (status === "green") return <CheckCircle2 size={16} className="text-green-600 print:text-green-700" />;
  if (status === "yellow") return <MinusCircle size={16} className="text-yellow-500 print:text-yellow-600" />;
  if (status === "red") return <XCircle size={16} className="text-red-500 print:text-red-600" />;
  return <MinusCircle size={16} className="text-gray-400" />;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "green" ? "bg-green-50 text-green-700 border-green-200 print:bg-green-50 print:text-green-800" :
    status === "yellow" ? "bg-yellow-50 text-yellow-700 border-yellow-200 print:bg-yellow-50 print:text-yellow-800" :
    status === "red" ? "bg-red-50 text-red-700 border-red-200 print:bg-red-50 print:text-red-800" :
    "bg-gray-50 text-gray-500 border-gray-200";
  const label = status === "green" ? "Stable" : status === "yellow" ? "Monitor" : status === "red" ? "Concern" : "No Data";
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${cls}`}><StatusIcon status={status} />{label}</span>;
}

function WeeklyTab() {
  const { data: report, isLoading, error } = useGetWeeklyReport();

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Loading weekly report…</div>;
  if (error || !report) return <div className="py-20 text-center text-destructive">Failed to load report. No data available yet.</div>;

  const r = report as any;

  return (
    <div className="space-y-8 report-content">
      <section className="print:break-inside-avoid">
        <h2 className="text-xl font-bold text-gray-900 mb-1 uppercase tracking-wide border-b border-gray-200 pb-2">
          Summary Narrative
        </h2>
        <p className="text-gray-700 leading-relaxed mt-3">{r.narrative}</p>
        <div className="flex gap-6 mt-4 text-sm text-gray-600">
          <span><strong>{r.sessionCount}</strong> check-in calls</span>
          <span><strong>{r.voiceActiveDays}</strong> voice-active days</span>
          <span><strong>{r.flaggedEvents?.length ?? 0}</strong> flagged events</span>
        </div>
      </section>

      <section className="print:break-inside-avoid">
        <h2 className="text-xl font-bold text-gray-900 mb-4 uppercase tracking-wide border-b border-gray-200 pb-2">
          Category Status
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATS.map((cat) => {
            const status = r.categoryStatus?.[cat] ?? "unknown";
            const bd = r.categoryBreakdown?.[cat];
            return (
              <div key={cat} className="border rounded-lg p-3 bg-white print:border-gray-300 text-center">
                <div className="text-2xl mb-1">{CATEGORY_ICONS[cat]}</div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">{CATEGORY_LABELS[cat]}</div>
                <StatusBadge status={status} />
                {bd && (
                  <div className="text-xs text-gray-400 mt-2">
                    {bd.sessionCount} sessions · {bd.flaggedCount} flagged
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {r.flaggedEvents?.length > 0 && (
        <section className="print:break-inside-avoid">
          <h2 className="text-xl font-bold text-gray-900 mb-4 uppercase tracking-wide border-b border-gray-200 pb-2">
            Flagged / Unusual Events
          </h2>
          <div className="space-y-3">
            {r.flaggedEvents.map((ev: any, i: number) => (
              <div key={i} className="border border-red-200 bg-red-50 rounded-lg p-3 print:border-red-300">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={14} className="text-red-500" />
                  <span className="text-xs font-bold text-red-600 uppercase tracking-wider">{CATEGORY_LABELS[ev.category] ?? ev.category}</span>
                  <span className="text-xs text-gray-500">{ev.date}</span>
                  {ev.parsedIntensity && ev.parsedIntensity !== "none" && (
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 rounded font-semibold">{ev.parsedIntensity}</span>
                  )}
                </div>
                <p className="text-sm text-gray-800 italic">"{ev.rawResponse}"</p>
                {ev.parsedValue && <p className="text-xs text-gray-500 mt-1">Interpreted: {ev.parsedValue}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {r.symptomLogs?.length > 0 && (
        <section className="print:break-inside-avoid">
          <h2 className="text-xl font-bold text-gray-900 mb-4 uppercase tracking-wide border-b border-gray-200 pb-2">
            Caregiver Symptom Logs
          </h2>
          <div className="space-y-2">
            {r.symptomLogs.map((log: any, i: number) => (
              <div key={i} className="border rounded-lg p-3 bg-white text-sm print:border-gray-300">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-500">{format(new Date(log.loggedAt), "MMM d, h:mm a")}</span>
                  {log.ptsdTrigger && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 rounded font-semibold">PTSD Trigger</span>}
                  <span className="text-xs text-gray-600">Hallucination intensity: <strong>{log.hallucinationIntensity}/10</strong></span>
                  <span className="text-xs text-gray-600">Motivation: <strong>{log.motivationLevel}/5</strong></span>
                </div>
                {log.behaviorNotes && <p className="text-xs text-gray-500 mt-1 italic">Notes: {log.behaviorNotes}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {r.foodPreferences?.length > 0 && (
        <section className="print:break-inside-avoid">
          <h2 className="text-xl font-bold text-gray-900 mb-4 uppercase tracking-wide border-b border-gray-200 pb-2">
            Food Preferences & Cravings This Week
          </h2>
          <div className="flex flex-wrap gap-2">
            {[...new Set(r.foodPreferences as string[])].map((food, i) => (
              <span key={i} className="px-3 py-1 bg-green-50 border border-green-200 text-green-800 rounded-full text-sm print:border-green-300">
                🍽️ {food}
              </span>
            ))}
          </div>
        </section>
      )}

      {r.sessionCount === 0 && (
        <div className="py-12 text-center text-gray-400 border border-dashed rounded-lg">
          <FileText size={32} className="mx-auto mb-2 opacity-40" />
          <p>No check-in call data for this week yet.</p>
        </div>
      )}
    </div>
  );
}

function MonthlyTab() {
  const { data: report, isLoading, error } = useGetMonthlyReport();
  const [visibleCats, setVisibleCats] = useState<Set<string>>(new Set(["mood", "medication", "sleep", "voices"]));

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Loading monthly report…</div>;
  if (error || !report) return <div className="py-20 text-center text-destructive">Failed to load report. No data available yet.</div>;

  const r = report as any;

  const trendData: any[] = r.trendData ?? [];
  const dates = [...new Set(trendData.map((d: any) => d.date as string))].sort();
  const chartData = dates.map((date) => {
    const row: Record<string, any> = { date: date.slice(5) };
    for (const cat of CATS) {
      const pt = trendData.find((d: any) => d.date === date && d.category === cat);
      if (pt?.averageValue !== null && pt?.averageValue !== undefined) row[cat] = parseFloat(pt.averageValue.toFixed(2));
    }
    return row;
  });

  const toggleCat = (cat: string) => {
    setVisibleCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  return (
    <div className="space-y-8 report-content">
      <section className="print:break-inside-avoid">
        <h2 className="text-xl font-bold text-gray-900 mb-1 uppercase tracking-wide border-b border-gray-200 pb-2">
          Monthly Summary
        </h2>
        <p className="text-gray-700 leading-relaxed mt-3">{r.narrative}</p>
      </section>

      <section className="print:break-inside-avoid">
        <h2 className="text-xl font-bold text-gray-900 mb-4 uppercase tracking-wide border-b border-gray-200 pb-2">
          Key Statistics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Sessions" value={r.sessionCount} unit="calls" color="blue" />
          <StatCard label="Medication Adherence" value={r.medicationAdherenceRate !== null && r.medicationAdherenceRate !== undefined ? `${r.medicationAdherenceRate}%` : "N/A"} color={r.medicationAdherenceRate >= 80 ? "green" : "yellow"} />
          <StatCard label="Flagged Days" value={r.flaggedDays} color={r.flaggedDays === 0 ? "green" : r.flaggedDays <= 3 ? "yellow" : "red"} />
          <StatCard label="Voice Active Days" value={r.voiceActiveDays} unit={`(${r.voiceActiveRate}%)`} color={r.voiceActiveDays === 0 ? "green" : "yellow"} />
        </div>
      </section>

      <section className="print:break-inside-avoid">
        <h2 className="text-xl font-bold text-gray-900 mb-4 uppercase tracking-wide border-b border-gray-200 pb-2">
          30-Day Category Status
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATS.map((cat) => (
            <div key={cat} className="border rounded-lg p-3 bg-white print:border-gray-300 text-center">
              <div className="text-2xl mb-1">{CATEGORY_ICONS[cat]}</div>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">{CATEGORY_LABELS[cat]}</div>
              <StatusBadge status={r.categoryStatus?.[cat] ?? "unknown"} />
            </div>
          ))}
        </div>
      </section>

      {chartData.length > 0 && (
        <section className="print:break-inside-avoid">
          <h2 className="text-xl font-bold text-gray-900 mb-2 uppercase tracking-wide border-b border-gray-200 pb-2">
            Trend Charts
          </h2>
          <div className="print:hidden flex flex-wrap gap-2 mb-4">
            {CATS.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCat(cat)}
                className={`px-2.5 py-1 rounded border text-xs font-semibold transition-colors ${visibleCats.has(cat) ? "border-transparent text-white" : "border-gray-300 text-gray-500 bg-white"}`}
                style={visibleCats.has(cat) ? { backgroundColor: CAT_COLORS[cat], borderColor: CAT_COLORS[cat] } : {}}
              >
                {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <div className="bg-white border rounded-lg p-4 print:border-gray-300">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", fontSize: 11, borderRadius: 6 }}
                  formatter={(v: number, name: string) => [`${Math.round(v * 100)}%`, CATEGORY_LABELS[name] ?? name]}
                />
                <Legend formatter={(name) => `${CATEGORY_ICONS[name] ?? ""} ${CATEGORY_LABELS[name] ?? name}`} />
                {CATS.filter((c) => visibleCats.has(c)).map((cat) => (
                  <Line key={cat} type="monotone" dataKey={cat} stroke={CAT_COLORS[cat]} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {r.sessionCount === 0 && (
        <div className="py-12 text-center text-gray-400 border border-dashed rounded-lg">
          <Activity size={32} className="mx-auto mb-2 opacity-40" />
          <p>No data recorded in the past 30 days.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, unit, color }: { label: string; value: any; unit?: string; color?: string }) {
  const colorCls =
    color === "green" ? "text-green-700" :
    color === "yellow" ? "text-yellow-600" :
    color === "red" ? "text-red-600" :
    color === "blue" ? "text-blue-700" :
    "text-gray-800";
  return (
    <div className="border rounded-lg p-4 bg-white print:border-gray-300 text-center">
      <div className={`text-2xl font-bold ${colorCls}`}>{value}</div>
      {unit && <div className="text-xs text-gray-400 mt-0.5">{unit}</div>}
      <div className="text-xs text-gray-500 uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}

export function DoctorReport() {
  const [tab, setTab] = useState<"weekly" | "monthly">("weekly");
  const [, navigate] = useLocation();

  const handlePrint = () => {
    window.print();
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
          .print\\:text-green-800 { color: #166534 !important; }
          .print\\:bg-green-50 { background-color: #f0fdf4 !important; }
          .print\\:text-yellow-800 { color: #713f12 !important; }
          .print\\:bg-yellow-50 { background-color: #fefce8 !important; }
          .print\\:text-red-800 { color: #7f1d1d !important; }
          .print\\:bg-red-50 { background-color: #fef2f2 !important; }
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
              <p className="text-xs text-muted-foreground">Health summary for medical review</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 border border-border rounded-md p-1 bg-secondary/30">
              <button
                onClick={() => setTab("weekly")}
                className={`px-3 py-1.5 text-xs font-display uppercase tracking-widest rounded-sm transition-colors ${tab === "weekly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                This Week
              </button>
              <button
                onClick={() => setTab("monthly")}
                className={`px-3 py-1.5 text-xs font-display uppercase tracking-widest rounded-sm transition-colors ${tab === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                This Month
              </button>
            </div>
            <Button onClick={handlePrint} size="sm" variant="outline" className="gap-2">
              <Printer size={14} />
              Print / PDF
            </Button>
          </div>
        </div>

        <div id="doctor-report-print" className="max-w-4xl mx-auto px-6 py-8 print:px-0 print:py-0">
          <div className="print-header mb-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 print:block hidden">
                  {tab === "weekly" ? "Weekly" : "Monthly"} Health Report — Ray's Pops
                </h1>
                <p className="text-sm text-gray-500 print:block hidden mt-1">
                  Generated {format(new Date(), "MMMM d, yyyy")} · Confidential — For Medical Review Only
                </p>
              </div>
            </div>
          </div>

          {tab === "weekly" ? <WeeklyTab /> : <MonthlyTab />}
        </div>
      </div>
    </>
  );
}
