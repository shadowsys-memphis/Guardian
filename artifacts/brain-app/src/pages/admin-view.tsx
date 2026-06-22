import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Activity,
  Calendar,
  ShieldAlert,
  Check,
  Plus,
  Edit2,
  Trash2,
  HeartPulse,
  BrainCircuit,
  Mic,
  Cpu,
  AlertTriangle,
  Clock,
  ShoppingCart,
  X,
  RefreshCw,
  Flame,
  CheckCircle,
} from "lucide-react";

import {
  useGetAppState, useUpdateAppState,
  useGetSchedule, useCreateScheduleTask, useUpdateScheduleTask, useDeleteScheduleTask, useCompleteScheduleTask,
  useGetSymptomLogs, useCreateSymptomLog,
  useGetVoiceScripts, useUpdateVoiceScript,
  useGetHaldolCycle, useUpdateHaldolCycle,
  useGetGovernorPillars, useGetGovernorNotes, useCreateGovernorNote,
  useListHealthQuestions, useCreateHealthQuestion, useUpdateHealthQuestion, useDeleteHealthQuestion,
  useGetTodaySummary, useListCallSessions, useGetSessionDataPoints, useGetAssessmentTrends, useGetAssessmentAnomalies,
  useGetAssessmentSettings, useUpdateAssessmentSettings,
  useListMeals, useCreateMeal, useDeleteMeal, useSyncFromSheets,
  useGetCart, useAddMealToCart, useRemoveMealFromCart, useApproveCart, useDismissCart,
  useListCravings, useCreateCraving, useUpdateCraving,
  type UpdateAppStateInput,
  type VoiceScript,
  type ScheduleTask,
  type GovernorPillar,
  type GovernorNote,
  type HealthQuestion,
  type CallSession,
  type HealthDataPoint,
  type AssessmentSummary,
  type MealWithIngredients,
  type CartWithMeals,
  type MealCraving,
} from "@workspace/api-client-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";

type Tone = "gentle" | "grounding" | "urgent" | "encouraging" | "calm";
type Tab = "dashboard" | "schedule" | "symptoms" | "scripts" | "haldol" | "governor" | "health" | "shopper";

export function AdminView() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-card border-r border-border shrink-0 flex flex-col">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-display font-bold text-primary tracking-widest leading-none">COMMAND</h1>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Raymo / Admin</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-2 flex-1">
          <NavButton active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} icon={<Activity size={18} />} label="Dashboard" />
          <NavButton active={activeTab === "schedule"} onClick={() => setActiveTab("schedule")} icon={<Calendar size={18} />} label="Schedule Editor" />
          <NavButton active={activeTab === "symptoms"} onClick={() => setActiveTab("symptoms")} icon={<HeartPulse size={18} />} label="Symptom Log" />
          <NavButton active={activeTab === "scripts"} onClick={() => setActiveTab("scripts")} icon={<Mic size={18} />} label="Voice Scripts" />
          <NavButton active={activeTab === "haldol"} onClick={() => setActiveTab("haldol")} icon={<BrainCircuit size={18} />} label="Haldol Tracker" />
          <NavButton active={activeTab === "health"} onClick={() => setActiveTab("health")} icon={<Activity size={18} />} label="Health Intel" />
          <NavButton active={activeTab === "shopper"} onClick={() => setActiveTab("shopper")} icon={<ShoppingCart size={18} />} label="Shopper" />
          <div className="border-t border-border/30 my-2 pt-2">
            <NavButton active={activeTab === "governor"} onClick={() => setActiveTab("governor")} icon={<Cpu size={18} />} label="Governor" />
          </div>
        </nav>

        <div className="p-4 border-t border-border/30">
          <p className="text-xs text-muted-foreground/50 uppercase tracking-widest font-display">Unconditional Software v1</p>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {activeTab === "dashboard" && <DashboardTab />}
          {activeTab === "schedule" && <ScheduleTab />}
          {activeTab === "symptoms" && <SymptomsTab />}
          {activeTab === "scripts" && <ScriptsTab />}
          {activeTab === "haldol" && <HaldolTab />}
          {activeTab === "health" && <HealthIntelligenceTab />}
          {activeTab === "shopper" && <ShopperTab />}
          {activeTab === "governor" && <GovernorTab />}
        </div>
      </main>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  mood: "Mood", medication: "Medication", sleep: "Sleep", appetite: "Appetite",
  cognition: "Cognition", voices: "Voices", energy: "Energy", task: "Tasks",
};
const CATEGORY_ICONS: Record<string, string> = {
  mood: "😐", medication: "💊", sleep: "🌙", appetite: "🍽️",
  cognition: "🧠", voices: "👂", energy: "⚡", task: "✅",
};
const STATUS_COLORS: Record<string, string> = {
  green: "border-success/40 bg-success/10 text-success",
  yellow: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  red: "border-destructive/50 bg-destructive/10 text-destructive",
  unknown: "border-border bg-secondary text-muted-foreground",
};

function HealthIntelligenceTab() {
  const [activeSection, setActiveSection] = useState<"summary" | "sessions" | "questions" | "settings">("summary");
  return (
    <div className="space-y-6">
      <header className="mb-6 border-b border-border/50 pb-4 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Health Intelligence</h2>
          <p className="text-muted-foreground">Pops' health data extracted from Jessica's daily conversations.</p>
        </div>
        <div className="flex gap-2">
          {(["summary", "sessions", "questions", "settings"] as const).map((s) => (
            <button key={s} onClick={() => setActiveSection(s)}
              className={`px-3 py-1.5 text-xs font-display uppercase tracking-widest rounded-sm border transition-colors ${activeSection === s ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {s}
            </button>
          ))}
        </div>
      </header>
      {activeSection === "summary" && <HealthSummarySection />}
      {activeSection === "sessions" && <HealthSessionsSection />}
      {activeSection === "questions" && <HealthQuestionsSection />}
      {activeSection === "settings" && <HealthSettingsSection />}
    </div>
  );
}

const CYCLE_DAY_COLORS = ["#ef4444","#ef4444","#ef4444","#ef4444","#ef4444","#f97316","#f97316","#eab308","#eab308","#84cc16","#22c55e","#22c55e","#22c55e","#22c55e"];

function CycleDayHeatmap({ trends, haldolCycleDay }: { trends: any[]; haldolCycleDay: number | null }) {
  const CATS = ["mood", "voices", "sleep", "medication"];
  // Build map: cycleDay -> category -> averageValue
  const grid: Record<number, Record<string, number>> = {};
  for (const t of trends) {
    if (!t.cycleDay) continue;
    if (!grid[t.cycleDay]) grid[t.cycleDay] = {};
    if (t.averageValue !== null) grid[t.cycleDay][t.category] = t.averageValue;
  }
  const hasCycleData = Object.keys(grid).length > 0;
  if (!hasCycleData) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-display uppercase tracking-widest text-muted-foreground">
          📅 Cycle-Day Correlation Heatmap
        </CardTitle>
        <CardDescription className="text-xs">Average health score per medication cycle day (1–14). Red = high-symptom zone.</CardDescription>
      </CardHeader>
      <CardContent className="pb-4 px-4 overflow-x-auto">
        <div className="min-w-[540px]">
          <div className="flex gap-1 mb-1">
            <div className="w-20 shrink-0" />
            {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => (
              <div key={d} className={`flex-1 text-center text-xs font-bold ${d === haldolCycleDay ? "text-primary" : "text-muted-foreground/50"}`}>{d}</div>
            ))}
          </div>
          {CATS.map((cat) => (
            <div key={cat} className="flex gap-1 mb-1 items-center">
              <div className="w-20 shrink-0 text-xs text-muted-foreground uppercase font-bold">{CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}</div>
              {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => {
                const val = grid[d]?.[cat];
                const isCurrent = d === haldolCycleDay;
                let bg = "bg-secondary/30";
                if (val !== undefined) {
                  if (val >= 0.7) bg = "bg-success/60";
                  else if (val >= 0.4) bg = "bg-yellow-500/50";
                  else bg = "bg-destructive/60";
                }
                return (
                  <div key={d} title={val !== undefined ? `Day ${d}: ${val.toFixed(2)}` : `Day ${d}: no data`}
                    className={`flex-1 h-6 rounded-sm ${bg} ${isCurrent ? "ring-1 ring-primary" : ""} transition-colors`} />
                );
              })}
            </div>
          ))}
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-destructive/60" /> Low (&lt;0.4)</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-yellow-500/50" /> Mid</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-success/60" /> Good (≥0.7)</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-secondary/30" /> No data</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthSummarySection() {
  const { data: summary } = useGetTodaySummary({ query: { queryKey: getGetTodaySummaryQueryKey(), refetchInterval: 30000 } });
  const { data: trendsResp } = useGetAssessmentTrends();
  const { data: anomaliesResp } = useGetAssessmentAnomalies();
  const { data: haldol } = useGetHaldolCycle();
  const CATS = ["mood", "medication", "sleep", "appetite", "cognition", "voices", "energy", "task"];

  const trends: any[] = Array.isArray(trendsResp) ? trendsResp : [];
  const sustainedAnomalies: string[] = anomaliesResp?.sustainedAnomalies ?? [];

  const trendsByCategory = (category: string) =>
    trends.filter((t) => t.category === category).slice(-30)
      .map((t) => ({ date: t.date.slice(5), value: t.averageValue ?? 0, day: t.cycleDay }));

  const flaggedCategories = CATS.filter((c) => (summary as any)?.categoryStatus?.[c] === "red");

  return (
    <div className="space-y-6">
      {sustainedAnomalies.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-destructive/15 border border-destructive/50 rounded-md">
          <AlertTriangle className="text-destructive shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-bold text-destructive uppercase tracking-widest">Sustained Pattern Alert</p>
            <p className="text-sm text-destructive/80 mt-1">
              {sustainedAnomalies.map((c) => CATEGORY_LABELS[c]).join(", ")} — flagged in 3+ of last 5 sessions. Consider raising with provider.
            </p>
          </div>
        </div>
      )}
      {flaggedCategories.length > 0 && sustainedAnomalies.length === 0 && (
        <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
          <AlertTriangle className="text-yellow-400 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-bold text-yellow-400 uppercase tracking-widest">Today's Alert</p>
            <p className="text-sm text-yellow-400/80 mt-1">
              Flagged today: {flaggedCategories.map((c) => CATEGORY_LABELS[c]).join(", ")}.
            </p>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-display text-muted-foreground uppercase tracking-widest mb-3">Today's Assessment</h3>
        {(!summary || (summary as any).totalDataPoints === 0) ? (
          <div className="p-8 text-center border border-border/40 rounded-md">
            <p className="text-muted-foreground">No call session recorded yet today.</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Start a Jessica call to begin collecting health data.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CATS.map((cat) => {
              const status = (summary as any)?.categoryStatus?.[cat] ?? "unknown";
              const isSustained = sustainedAnomalies.includes(cat);
              return (
                <div key={cat} className={`border rounded-md p-4 text-center transition-colors ${STATUS_COLORS[status]} ${isSustained ? "ring-2 ring-destructive/60" : ""}`}>
                  <div className="text-2xl mb-1">{CATEGORY_ICONS[cat]}</div>
                  <div className="text-xs font-display uppercase tracking-widest">{CATEGORY_LABELS[cat]}</div>
                  <div className="text-xs mt-1 opacity-70 capitalize">{status === "unknown" ? "no data" : status}</div>
                  {isSustained && <div className="text-xs text-destructive font-bold mt-1">sustained ↑</div>}
                </div>
              );
            })}
          </div>
        )}
        {(summary as any)?.totalDataPoints > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {(summary as any).totalDataPoints} data points from today · Cycle Day {(summary as any).cycleDay ?? haldol?.cycleDay ?? "--"}
          </p>
        )}
      </div>

      <CycleDayHeatmap trends={trends} haldolCycleDay={haldol?.cycleDay ?? null} />

      <div>
        <h3 className="text-lg font-display text-muted-foreground uppercase tracking-widest mb-3">30-Day Trends</h3>
        {trends.length === 0 ? (
          <p className="text-muted-foreground italic text-sm">No trend data yet. Data builds up over daily calls.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {["mood", "voices", "sleep", "medication"].map((cat) => {
              const data = trendsByCategory(cat);
              if (data.length === 0) return null;
              return (
                <Card key={cat}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-display uppercase tracking-widest text-muted-foreground">
                      {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
                      {sustainedAnomalies.includes(cat) && <span className="ml-2 text-destructive text-xs">sustained alert</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 px-2">
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} />
                        <YAxis tick={{ fontSize: 9, fill: "#888" }} domain={[0, 1]} />
                        <Tooltip
                          contentStyle={{ background: "#1a1a1a", border: "1px solid #333", fontSize: 11 }}
                          formatter={(v: number) => [v.toFixed(2), CATEGORY_LABELS[cat]]}
                        />
                        <Line type="monotone" dataKey="value" stroke={sustainedAnomalies.includes(cat) ? "#ef4444" : "#fbbf24"} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function HealthSessionsSection() {
  const { data: sessions } = useListCallSessions({ limit: 20 });
  const { data: allQuestions } = useListHealthQuestions();
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const { data: dataPoints } = useGetSessionDataPoints(selectedSession ?? 0, {
    query: { queryKey: getGetSessionDataPointsQueryKey(selectedSession ?? 0), enabled: selectedSession !== null },
  });

  const questionsMap: Record<number, string> = {};
  if (allQuestions) {
    for (const q of allQuestions as any[]) questionsMap[q.id] = q.text;
  }

  const coverageFromDps = (dps: any[]) => [...new Set(dps.map((d) => d.category))];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-display text-muted-foreground uppercase tracking-widest">Call Session Log</h3>
      {(!sessions || (sessions as any[]).length === 0) ? (
        <p className="text-muted-foreground italic">No sessions recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {(sessions as any[]).map((session) => (
            <Card key={session.id} className={session.flagged ? "border-destructive/40" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{session.sessionDate}</span>
                      {session.cycleDay && <Badge variant="outline" className="text-xs">Day {session.cycleDay}</Badge>}
                      {session.flagged && <Badge variant="destructive" className="text-xs animate-pulse">⚠ Flagged</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{session.summary ?? "In progress..."}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelectedSession(selectedSession === session.id ? null : session.id)}>
                    {selectedSession === session.id ? "Hide" : "View Data"}
                  </Button>
                </div>
                {selectedSession === session.id && dataPoints && (
                  <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
                    {(dataPoints as any[]).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No structured data points captured in this session.</p>
                    ) : (
                      <>
                        <div className="pb-3 border-b border-border/30">
                          <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-2">Topics Covered This Call</p>
                          <div className="flex flex-wrap gap-1.5">
                            {coverageFromDps(dataPoints as any[]).map((cat) => {
                              // Show only the specific questions actually asked in this session
                              // by looking up questionIds from the data points for this category
                              const askedQIds = [...new Set((dataPoints as any[])
                                .filter((d) => d.category === cat && d.questionId)
                                .map((d) => d.questionId as number))];
                              const askedQuestions = askedQIds.map((id) => questionsMap[id]).filter(Boolean);
                              return (
                                <div key={cat} className="group relative">
                                  <span className="px-2 py-0.5 rounded-sm bg-primary/10 border border-primary/30 text-xs text-primary font-bold uppercase cursor-default">
                                    {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat] ?? cat}
                                  </span>
                                  {askedQuestions.length > 0 && (
                                    <div className="absolute bottom-full left-0 mb-1 z-10 w-64 p-2 bg-card border border-border rounded-sm shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                      <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Questions asked this session:</p>
                                      {askedQuestions.map((text, i) => (
                                        <p key={i} className="text-xs text-foreground/80 leading-snug">· {text}</p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Extracted Data Points</p>
                          {(dataPoints as any[]).map((dp) => (
                            <div key={dp.id} className={`flex items-start gap-3 p-2 rounded-sm text-xs ${dp.flagged ? "bg-destructive/10" : "bg-secondary/30"}`}>
                              <span className="shrink-0">{CATEGORY_ICONS[dp.category] ?? "📊"}</span>
                              <div className="flex-1">
                                <span className="text-muted-foreground uppercase font-bold tracking-widest">{CATEGORY_LABELS[dp.category] ?? dp.category}</span>
                                {dp.parsedValue && <span className="ml-2 text-primary">→ {dp.parsedValue}</span>}
                                {dp.parsedIntensity && dp.parsedIntensity !== "none" && <span className="ml-1 text-yellow-400">({dp.parsedIntensity})</span>}
                                {dp.questionId && questionsMap[dp.questionId] && (
                                  <p className="text-primary/50 mt-0.5 text-xs">Q: {questionsMap[dp.questionId]}</p>
                                )}
                                <p className="text-muted-foreground/60 mt-0.5 italic">"{dp.rawResponse}"</p>
                              </div>
                              {dp.flagged && <AlertTriangle size={12} className="text-destructive shrink-0" />}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function HealthQuestionsSection() {
  const { data: questions, refetch } = useListHealthQuestions();
  const createQ = useCreateHealthQuestion();
  const updateQ = useUpdateHealthQuestion();
  const deleteQ = useDeleteHealthQuestion();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ text: "", category: "mood", responseType: "yes_no", priority: 5, alwaysAsk: false, cycleDays: "" });

  const resetForm = () => { setForm({ text: "", category: "mood", responseType: "yes_no", priority: 5, alwaysAsk: false, cycleDays: "" }); setEditingId(null); setShowForm(false); };

  const parseCycleDays = (val: string): string | null => {
    const nums = val.trim().split(/[\s,]+/).map(Number).filter((n) => !isNaN(n) && n >= 1 && n <= 14);
    return nums.length > 0 ? JSON.stringify(nums) : null;
  };

  const handleSave = () => {
    if (!form.text.trim()) return;
    const payload = { ...form, cycleDays: form.cycleDays ? parseCycleDays(form.cycleDays) : null };
    if (editingId) {
      updateQ.mutate({ id: editingId, data: payload }, { onSuccess: () => { toast({ title: "Question updated" }); resetForm(); refetch(); } });
    } else {
      createQ.mutate({ data: payload }, { onSuccess: () => { toast({ title: "Question added" }); resetForm(); refetch(); } });
    }
  };

  const toggleActive = (q: any) => {
    updateQ.mutate({ id: q.id, data: { active: !q.active } }, { onSuccess: () => refetch() });
  };

  const CATS = ["mood", "medication", "sleep", "appetite", "cognition", "voices", "energy", "task"];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-display text-muted-foreground uppercase tracking-widest">Question Library</h3>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}><Plus size={14} className="mr-1" /> Add Question</Button>
      </div>

      {showForm && (
        <Card className="border-primary/40">
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-muted-foreground">Question Text</label>
              <Input value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="How'd you sleep last night?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="flex h-9 w-full rounded-sm border border-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Response Type</label>
                <select value={form.responseType} onChange={(e) => setForm({ ...form, responseType: e.target.value })}
                  className="flex h-9 w-full rounded-sm border border-border bg-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <option value="yes_no">Yes / No</option>
                  <option value="scale_1_5">Scale 1–5</option>
                  <option value="free_text">Free Text</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Priority (1–10)</label>
                <input type="range" min={1} max={10} value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })} className="w-32 accent-primary" />
                <span className="text-xs text-primary ml-2">{form.priority}</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={form.alwaysAsk} onChange={(e) => setForm({ ...form, alwaysAsk: e.target.checked })} className="accent-primary" />
                Always ask (every call)
              </label>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-muted-foreground">Cycle Days (optional)</label>
              <p className="text-xs text-muted-foreground/60">Only ask on specific days of the 14-day cycle. Enter day numbers separated by commas (e.g. 1,2,3,4,5). Leave blank to ask on any day.</p>
              <Input
                value={form.cycleDays}
                onChange={(e) => setForm({ ...form, cycleDays: e.target.value })}
                placeholder="e.g. 1,2,3,4,5  (leave blank = any day)"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleSave} disabled={createQ.isPending || updateQ.isPending}>{editingId ? "Update" : "Add"} Question</Button>
              <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {(questions as any[] ?? []).map((q) => (
          <div key={q.id} className={`flex items-start gap-3 p-3 rounded-sm border transition-colors ${q.active ? "border-border bg-card" : "border-border/30 bg-secondary/20 opacity-50"}`}>
            <span className="text-lg shrink-0">{CATEGORY_ICONS[q.category] ?? "❓"}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{q.text}</p>
              <div className="flex gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground uppercase font-bold">{CATEGORY_LABELS[q.category]}</span>
                <span className="text-xs text-muted-foreground">· {q.responseType.replace("_", " ")}</span>
                <span className="text-xs text-muted-foreground">· Priority {q.priority}</span>
                {q.alwaysAsk && <Badge variant="outline" className="text-xs text-success border-success/40">Always Ask</Badge>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => toggleActive(q)} className={`p-1.5 rounded-sm border text-xs transition-colors ${q.active ? "border-success/40 text-success hover:bg-success/10" : "border-border text-muted-foreground hover:bg-secondary"}`} title={q.active ? "Disable" : "Enable"}>
                {q.active ? <Check size={12} /> : <Plus size={12} />}
              </button>
              <button onClick={() => { setEditingId(q.id); setForm({ text: q.text, category: q.category, responseType: q.responseType, priority: q.priority, alwaysAsk: q.alwaysAsk, cycleDays: q.cycleDays ? JSON.parse(q.cycleDays).join(",") : "" }); setShowForm(true); }}
                className="p-1.5 rounded-sm border border-border text-muted-foreground hover:bg-secondary transition-colors">
                <Edit2 size={12} />
              </button>
              <button onClick={() => { if (confirm("Delete question?")) deleteQ.mutate({ id: q.id }, { onSuccess: () => refetch() }); }}
                className="p-1.5 rounded-sm border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthSettingsSection() {
  const { data: settings } = useGetAssessmentSettings();
  const updateSettings = useUpdateAssessmentSettings();
  const { toast } = useToast();
  const [form, setForm] = useState({ quietWindowStart: "22:00", quietWindowEnd: "07:00", engagementIntervalHours: 4 });

  useEffect(() => {
    if (settings) setForm({ quietWindowStart: (settings as any).quietWindowStart ?? "22:00", quietWindowEnd: (settings as any).quietWindowEnd ?? "07:00", engagementIntervalHours: (settings as any).engagementIntervalHours ?? 4 });
  }, [settings]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate({ data: form }, { onSuccess: () => toast({ title: "Settings saved" }) });
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h3 className="text-lg font-display text-muted-foreground uppercase tracking-widest">Assessment Settings</h3>
      <Card>
        <CardHeader>
          <CardTitle>Quiet Window</CardTitle>
          <CardDescription>Jessica will not initiate check-ins during these hours.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">Start (e.g. 22:00)</label>
                <Input value={form.quietWindowStart} onChange={(e) => setForm({ ...form, quietWindowStart: e.target.value })} placeholder="22:00" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">End (e.g. 07:00)</label>
                <Input value={form.quietWindowEnd} onChange={(e) => setForm({ ...form, quietWindowEnd: e.target.value })} placeholder="07:00" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground">Engagement Interval (hours)</label>
              <p className="text-xs text-muted-foreground">If Pops hasn't had a check-in in this many hours, Jessica initiates one.</p>
              <Input type="number" min={1} max={12} value={form.engagementIntervalHours} onChange={(e) => setForm({ ...form, engagementIntervalHours: parseInt(e.target.value) })} />
            </div>
            <Button type="submit" disabled={updateSettings.isPending}>Save Settings</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm font-bold uppercase tracking-wider font-display transition-all ${
        active
          ? "bg-primary/10 text-primary border-l-4 border-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground border-l-4 border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function DashboardTab() {
  const { data: state } = useGetAppState();
  const { data: haldol } = useGetHaldolCycle();
  const { data: schedule } = useGetSchedule();
  const updateState = useUpdateAppState();
  const { toast } = useToast();
  const [broadcastValue, setBroadcastValue] = useState(state?.activeMessage ?? "");

  const handleStateChange = (updates: UpdateAppStateInput) => {
    updateState.mutate({ data: updates }, {
      onSuccess: () => toast({ title: "State updated" }),
      onError: () => toast({ title: "Update failed", variant: "destructive" }),
    });
  };

  const completedCount = schedule?.filter((t) => t.isCompleted).length ?? 0;
  const totalCount = schedule?.length ?? 0;
  const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const hasOverride = !!state?.quarterOverride;

  return (
    <div className="space-y-6">
      <header className="mb-8 border-b border-border/50 pb-4">
        <h2 className="text-4xl font-display text-primary tracking-widest uppercase">System Overview</h2>
        <p className="text-muted-foreground">Live status of the br(AI)n App ecosystem.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className={hasOverride ? "border-primary/50" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold flex items-center gap-2">
              <Clock size={14} /> Current Quarter
            </CardDescription>
            <CardTitle className="text-5xl">{state?.currentQuarter ?? "--"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={`text-xs uppercase font-bold tracking-widest px-2 py-1 rounded-sm inline-block ${hasOverride ? "bg-primary/10 text-primary" : "bg-success/10 text-success"}`}>
              {hasOverride ? `Override: ${state?.quarterOverride}` : "Auto — Wall Clock"}
            </div>
            <p className="text-xs text-muted-foreground">
              Clock: <span className="font-bold text-foreground">{state?.computedQuarter ?? "--"}</span>
            </p>
            {hasOverride ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={() => handleStateChange({ quarterOverride: null })}
              >
                Clear Override → Resume Auto
              </Button>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-1 uppercase font-bold">Override Quarter</p>
                <div className="flex gap-1">
                  {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => handleStateChange({ quarterOverride: q })}
                      className="px-2 py-1 text-xs font-bold rounded bg-secondary text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={state?.zombieMode ? "border-destructive shadow-[0_0_15px_rgba(220,38,38,0.2)]" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold">Mode Status</CardDescription>
            <CardTitle className={`text-4xl ${state?.zombieMode ? "text-destructive" : "text-success"}`}>
              {state?.zombieMode ? "REST MODE" : "NORMAL"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant={state?.zombieMode ? "outline" : "destructive"}
              size="sm"
              className="w-full mt-2"
              onClick={() => handleStateChange({ zombieMode: !state?.zombieMode })}
            >
              {state?.zombieMode ? "Deactivate Rest Mode" : "Trigger Rest Mode"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold">Schedule Activity</CardDescription>
            <CardTitle className="text-5xl">{completionRate}%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-secondary h-2 mt-4 rounded-full overflow-hidden">
              <div className="bg-primary h-full" style={{ width: `${completionRate}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-right">
              {completedCount} of {totalCount} tasks logged
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold">Haldol Cycle</CardDescription>
            <CardTitle className="text-5xl">Day {haldol?.cycleDay ?? "-"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mt-2">
              Next: {haldol ? haldol.nextInjectionDate : "--"}
            </p>
            {haldol?.isZombiePhase && (
              <Badge variant="destructive" className="mt-2">High Symptom Phase</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Active Broadcast Message</CardTitle>
          <CardDescription>Displayed prominently on Pops' ambient screen. Overrides the current task display.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              value={broadcastValue}
              onChange={(e) => setBroadcastValue(e.target.value)}
              className="font-display text-xl"
              placeholder="Type message to show Pops..."
            />
            <Button onClick={() => handleStateChange({ activeMessage: broadcastValue })}>
              Broadcast
            </Button>
            {state?.activeMessage && (
              <Button variant="outline" onClick={() => { setBroadcastValue(""); handleStateChange({ activeMessage: null }); }}>
                Clear
              </Button>
            )}
          </div>
          {state?.activeMessage && (
            <p className="text-xs text-primary mt-2 font-bold">
              Currently showing: "{state.activeMessage}"
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleTab() {
  const { data: schedule } = useGetSchedule();
  const createTask = useCreateScheduleTask();
  const updateTask = useUpdateScheduleTask();
  const deleteTask = useDeleteScheduleTask();
  const completeTask = useCompleteScheduleTask();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduleTask | null>(null); 

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      quarter: formData.get("quarter") as "Q1" | "Q2" | "Q3" | "Q4",
      timeLabel: formData.get("timeLabel") as string,
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      voiceScript: formData.get("voiceScript") as string,
      order: parseInt(formData.get("order") as string, 10),
    };

    if (editingTask) {
      updateTask.mutate({ id: editingTask.id, data }, {
        onSuccess: () => { setIsModalOpen(false); toast({ title: "Task updated" }); },
      });
    } else {
      createTask.mutate({ data }, {
        onSuccess: () => { setIsModalOpen(false); toast({ title: "Task created" }); },
      });
    }
  };

  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const quarterLabels: Record<string, string> = {
    Q1: "Q1 — Morning (0600-1200)",
    Q2: "Q2 — Afternoon (1200-1800)",
    Q3: "Q3 — Evening (1800-2200)",
    Q4: "Q4 — Night (2200-0600)",
  };

  return (
    <div>
      <header className="mb-8 border-b border-border/50 pb-4 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Schedule Editor</h2>
          <p className="text-muted-foreground">Manage the state machine. Each task becomes a Jessica voice prompt.</p>
        </div>
        <Button onClick={() => { setEditingTask(null); setIsModalOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Task
        </Button>
      </header>

      <div className="space-y-8">
        {quarters.map((q) => {
          const qTasks = schedule?.filter((t) => t.quarter === q).sort((a, b) => a.order - b.order) ?? [];
          return (
            <Card key={q}>
              <CardHeader className="bg-secondary/50 py-3">
                <CardTitle className="text-xl font-display tracking-widest">{quarterLabels[q]}</CardTitle>
              </CardHeader>
              <div className="p-0">
                {qTasks.length === 0 ? (
                  <p className="p-6 text-muted-foreground italic">No tasks in this quarter.</p>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-card border-b border-border">
                      <tr>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Time</th>
                        <th className="px-6 py-3">Title</th>
                        <th className="px-6 py-3">Order</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qTasks.map((task) => (
                        <tr key={task.id} className="border-b border-border/50 hover:bg-secondary/20">
                          <td className="px-6 py-4">
                            {task.isCompleted ? (
                              <Badge variant="success">Done</Badge>
                            ) : (
                              <Badge variant="outline">Pending</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 font-bold">{task.timeLabel}</td>
                          <td className="px-6 py-4 font-display text-lg tracking-wider">{task.title}</td>
                          <td className="px-6 py-4">{task.order}</td>
                          <td className="px-6 py-4 text-right flex justify-end gap-2">
                            {!task.isCompleted && (
                              <Button size="icon" variant="outline" className="h-8 w-8 text-success hover:bg-success/20 hover:text-success border-success/30" onClick={() => completeTask.mutate({ id: task.id })}>
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { setEditingTask(task); setIsModalOpen(true); }}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => { if (confirm("Delete task?")) deleteTask.mutate({ id: task.id }); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingTask ? "Edit Task" : "New Task"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase text-muted-foreground">Quarter</label>
              <select name="quarter" defaultValue={editingTask?.quarter ?? "Q1"} className="flex h-10 w-full rounded-sm border border-border bg-input px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <option value="Q1">Q1 (Morning)</option>
                <option value="Q2">Q2 (Afternoon)</option>
                <option value="Q3">Q3 (Evening)</option>
                <option value="Q4">Q4 (Night)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase text-muted-foreground">Time Label</label>
              <Input name="timeLabel" defaultValue={editingTask?.timeLabel} required placeholder="e.g. 0800" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase text-muted-foreground">Title</label>
            <Input name="title" defaultValue={editingTask?.title} required placeholder="Task Title" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase text-muted-foreground">Description (Optional)</label>
            <Input name="description" defaultValue={editingTask?.description} placeholder="Short details" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase text-muted-foreground">Jessica's Voice Prompt (Optional)</label>
            <Input name="voiceScript" defaultValue={editingTask?.voiceScript} placeholder="What the AI should say..." />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase text-muted-foreground">Sort Order</label>
            <Input name="order" type="number" defaultValue={editingTask?.order ?? 0} required />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createTask.isPending || updateTask.isPending}>Save Task</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SymptomsTab() {
  const { data: logs } = useGetSymptomLogs();
  const createLog = useCreateSymptomLog();
  const { toast } = useToast();
  const [hiVal, setHiVal] = useState(0);
  const [mlVal, setMlVal] = useState(3);

  const handleLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      ptsdTrigger: formData.get("ptsdTrigger") === "on",
      hallucinationIntensity: hiVal,
      motivationLevel: mlVal,
      behaviorNotes: formData.get("behaviorNotes") as string,
      loggedBy: "Raymo",
    };

    createLog.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Symptom logged successfully" });
        (e.target as HTMLFormElement).reset();
        setHiVal(0);
        setMlVal(3);
      },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-1 space-y-6">
        <header className="border-b border-border/50 pb-4">
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">New Log</h2>
        </header>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleLogSubmit} className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-bold uppercase text-muted-foreground flex items-center justify-between">
                  Hallucination Intensity (0-5)
                  <span className="text-primary font-display text-xl px-2 bg-secondary rounded">{hiVal}</span>
                </label>
                <input type="range" min="0" max="5" value={hiVal} onChange={(e) => setHiVal(parseInt(e.target.value))} className="w-full accent-primary" />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold uppercase text-muted-foreground flex items-center justify-between">
                  Motivation Level (1-5)
                  <span className="text-primary font-display text-xl px-2 bg-secondary rounded">{mlVal}</span>
                </label>
                <input type="range" min="1" max="5" value={mlVal} onChange={(e) => setMlVal(parseInt(e.target.value))} className="w-full accent-primary" />
              </div>

              <div className="flex items-center gap-3 bg-secondary/50 p-4 rounded-md border border-border">
                <input type="checkbox" name="ptsdTrigger" id="ptsd" className="w-5 h-5 accent-destructive" />
                <label htmlFor="ptsd" className="text-sm font-bold uppercase text-destructive tracking-widest cursor-pointer">
                  PTSD Trigger Event Occurred
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold uppercase text-muted-foreground">Behavior Notes</label>
                <textarea
                  name="behaviorNotes"
                  className="flex min-h-[100px] w-full rounded-sm border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="Observations..."
                />
              </div>

              <Button type="submit" className="w-full" disabled={createLog.isPending}>Submit Log</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-6">
        <header className="border-b border-border/50 pb-4">
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Recent History</h2>
        </header>
        <div className="space-y-4">
          {logs?.length === 0 ? (
            <p className="text-muted-foreground italic">No logs recorded yet.</p>
          ) : (
            logs?.map((log) => (
              <Card key={log.id} className={log.ptsdTrigger ? "border-destructive/50 border-l-4 border-l-destructive" : ""}>
                <CardContent className="p-4 flex gap-4">
                  <div className="shrink-0 text-center w-20 p-2 bg-secondary rounded border border-border/50">
                    <div className="text-xs text-muted-foreground uppercase font-bold">Time</div>
                    <div className="text-lg font-display text-primary">{format(new Date(log.loggedAt), "HH:mm")}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(log.loggedAt), "MM/dd")}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex gap-2 mb-2">
                      <Badge variant={log.hallucinationIntensity > 2 ? "destructive" : "secondary"}>
                        Intensity: {log.hallucinationIntensity}/5
                      </Badge>
                      <Badge variant={log.motivationLevel < 3 ? "destructive" : "default"}>
                        Motivation: {log.motivationLevel}/5
                      </Badge>
                      {log.ptsdTrigger && <Badge variant="destructive" className="animate-pulse">PTSD Trigger</Badge>}
                    </div>
                    {log.behaviorNotes && (
                      <p className="text-sm text-foreground/80 mt-2 p-3 bg-background rounded border border-border/30">
                        "{log.behaviorNotes}"
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ScriptsTab() {
  const { data: scripts } = useGetVoiceScripts();
  const updateScript = useUpdateVoiceScript();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editTone, setEditTone] = useState<Tone>("gentle");

  const startEdit = (script: VoiceScript) => {
    setEditingId(script.id);
    setEditText(script.scriptText);
    setEditTone(script.tone as Tone);
  };

  const handlePatch = (id: number) => {
    updateScript.mutate({
      id,
      data: { scriptText: editText, tone: editTone, patchNote: "Live admin override" },
    }, {
      onSuccess: () => {
        setEditingId(null);
        toast({ title: "Script patched. Jessica updated." });
      },
    });
  };

  return (
    <div className="space-y-6">
      <header className="mb-8 border-b border-border/50 pb-4">
        <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Live Voice Scripts</h2>
        <p className="text-muted-foreground">Patch Jessica's AI prompts in real-time based on Pops' condition.</p>
      </header>

      <div className="grid gap-4">
        {scripts?.map((script) => (
          <Card key={script.id} className={`transition-all ${editingId === script.id ? "border-primary shadow-[0_0_20px_rgba(251,191,36,0.1)]" : ""}`}>
            <CardHeader className="py-3 flex flex-row items-center justify-between bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${script.isActive ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                <CardTitle className="text-xl">
                  {script.label}{" "}
                  <span className="text-xs text-muted-foreground ml-2 font-sans tracking-normal">[{script.taskKey}]</span>
                </CardTitle>
              </div>
              <Badge variant="outline">{script.tone}</Badge>
            </CardHeader>
            <CardContent className="p-4">
              {editingId === script.id ? (
                <div className="space-y-4">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="flex min-h-[80px] w-full rounded-sm border border-border bg-input px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-bold text-primary"
                  />
                  <div className="flex gap-4">
                    <select
                      value={editTone}
                      onChange={(e) => setEditTone(e.target.value as Tone)}
                      className="h-10 rounded-sm border border-border bg-input px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {["gentle", "grounding", "urgent", "encouraging", "calm"].map((t) => (
                        <option key={t} value={t}>{t.toUpperCase()}</option>
                      ))}
                    </select>
                    <Button onClick={() => handlePatch(script.id)} disabled={updateScript.isPending}>
                      Deploy Patch
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center gap-4">
                  <p className="font-sans text-lg text-foreground/90 border-l-2 border-primary/50 pl-4 py-1 italic">"{script.scriptText}"</p>
                  <Button variant="outline" size="sm" onClick={() => startEdit(script)}>Edit / Patch</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {scripts?.length === 0 && <p className="text-muted-foreground">No voice scripts configured.</p>}
      </div>
    </div>
  );
}

function HaldolTab() {
  const { data: haldol } = useGetHaldolCycle();
  const updateHaldol = useUpdateHaldolCycle();
  const { toast } = useToast();

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    updateHaldol.mutate({
      data: {
        lastInjectionDate: formData.get("lastInjectionDate") as string,
        notes: formData.get("notes") as string,
      },
    }, {
      onSuccess: () => toast({ title: "Cycle tracking updated" }),
    });
  };

  return (
    <div className="space-y-6">
      <header className="mb-8 border-b border-border/50 pb-4">
        <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Haldol Cycle Tracker</h2>
        <p className="text-muted-foreground">Manage the 14-day medication cycle and anticipate high-symptom rest phases.</p>
      </header>

      {haldol && (
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="bg-primary/5 border-primary/30">
            <CardHeader>
              <CardTitle className="text-3xl text-center">Current Status</CardTitle>
            </CardHeader>
            <CardContent className="text-center pb-8 space-y-6">
              <div>
                <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm mb-2">Cycle Day</p>
                <div className="text-8xl font-display text-primary tracking-wider">
                  {haldol.cycleDay}<span className="text-4xl text-muted-foreground">/14</span>
                </div>
              </div>

              {haldol.isZombiePhase ? (
                <div className="inline-block px-6 py-3 bg-destructive/20 border border-destructive rounded-md">
                  <h4 className="text-xl font-display text-destructive uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle size={20} /> High Symptom Phase (Rest Mode)
                  </h4>
                  <p className="text-sm text-destructive/80 mt-1">Days 1-5 typically require reduced stimulation.</p>
                </div>
              ) : (
                <div className="inline-block px-6 py-3 bg-success/10 border border-success/30 rounded-md">
                  <h4 className="text-xl font-display text-success uppercase tracking-widest flex items-center gap-2">
                    <Check size={20} /> Stabilization Phase
                  </h4>
                </div>
              )}

              <div className="pt-4 border-t border-border/50">
                <p className="text-muted-foreground uppercase text-xs font-bold tracking-widest mb-1">Next Scheduled Injection</p>
                <p className="text-3xl font-display text-foreground">{haldol.nextInjectionDate}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Update Cycle</CardTitle>
              <CardDescription>Log a new injection to reset the 14-day cycle counter.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase text-muted-foreground">Last Injection Date</label>
                  <Input type="date" name="lastInjectionDate" defaultValue={haldol.lastInjectionDate} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase text-muted-foreground">Clinical Notes</label>
                  <textarea
                    name="notes"
                    defaultValue={haldol.notes ?? ""}
                    className="flex min-h-[120px] w-full rounded-sm border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    placeholder="Observations around injection time..."
                  />
                </div>
                <Button type="submit" className="w-full" disabled={updateHaldol.isPending}>
                  Reset &amp; Save Cycle
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

const PILLAR_COLORS: Record<string, string> = {
  productivity: "border-yellow-500/40 bg-yellow-500/5",
  passion: "border-blue-500/40 bg-blue-500/5",
  curiosity: "border-green-500/40 bg-green-500/5",
};

const PILLAR_ACCENT: Record<string, string> = {
  productivity: "text-yellow-400",
  passion: "text-blue-400",
  curiosity: "text-green-400",
};

function GovernorTab() {
  const { data: pillars } = useGetGovernorPillars();
  const { data: notes, refetch: refetchNotes } = useGetGovernorNotes();
  const createNote = useCreateGovernorNote();
  const { toast } = useToast();
  const [noteText, setNoteText] = useState("");
  const [notePillar, setNotePillar] = useState("");

  const handleSubmitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    createNote.mutate({
      data: { noteText: noteText.trim(), pillarKey: notePillar || undefined },
    }, {
      onSuccess: () => {
        toast({ title: "Synthesis note logged" });
        setNoteText("");
        setNotePillar("");
        refetchNotes();
      },
    });
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-border/50 pb-4">
        <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Sovereign Staff Governor</h2>
        <p className="text-muted-foreground">Raymo's three-pillar productivity engine — separate from Pops' care system.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pillars?.map((pillar) => (
          <Card key={pillar.pillarKey} className={`border-2 ${PILLAR_COLORS[pillar.pillarKey] ?? "border-border"}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline" className={`text-xs uppercase font-bold ${PILLAR_ACCENT[pillar.pillarKey]}`}>
                  {pillar.pillarKey}
                </Badge>
                <span className="text-xs text-muted-foreground font-bold">
                  {pillar.focusDurationMins} min
                </span>
              </div>
              <CardTitle className={`text-2xl font-display tracking-widest ${PILLAR_ACCENT[pillar.pillarKey]}`}>
                {pillar.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{pillar.description}</p>
              {pillar.metrics.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-2">Metrics</p>
                  <ul className="space-y-1">
                    {pillar.metrics.map((m, i) => (
                      <li key={i} className="text-xs text-foreground/70 flex items-start gap-2">
                        <span className="text-primary mt-0.5">›</span>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Log Synthesis Note</CardTitle>
          <CardDescription>
            Record a daily insight, trajectory observation, or Goldilocks action across your pillars.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitNote} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase text-muted-foreground">Pillar (Optional)</label>
              <select
                value={notePillar}
                onChange={(e) => setNotePillar(e.target.value)}
                className="flex h-10 w-full rounded-sm border border-border bg-input px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="">General / All Pillars</option>
                {pillars?.map((p) => (
                  <option key={p.pillarKey} value={p.pillarKey}>
                    {p.name} ({p.pillarKey})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase text-muted-foreground">Synthesis Note</label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="flex min-h-[120px] w-full rounded-sm border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="Trajectory analysis, lagging pillar, Goldilocks action, logic bridge..."
                required
              />
            </div>
            <Button type="submit" disabled={createNote.isPending || !noteText.trim()}>
              Save Synthesis Note
            </Button>
          </form>
        </CardContent>
      </Card>

      {notes && notes.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-2xl font-display text-primary tracking-widest uppercase border-b border-border/50 pb-3">
            Recent Notes
          </h3>
          {notes.map((note) => {
            const pillar = pillars?.find((p) => p.pillarKey === note.pillarKey);
            return (
              <Card key={note.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    {pillar ? (
                      <Badge className={`text-xs uppercase font-bold ${PILLAR_ACCENT[pillar.pillarKey]}`} variant="outline">
                        {pillar.name}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs uppercase font-bold">General</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(note.createdAt), "EEE MMM dd, HH:mm")}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{note.noteText}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {notes?.length === 0 && (
        <p className="text-muted-foreground italic text-center py-8">
          No synthesis notes yet. Log your first one above.
        </p>
      )}
    </div>
  );
}

function ShopperTab() {
  const { toast } = useToast();
  const [sheetId, setSheetId] = useState("");
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [newMealName, setNewMealName] = useState("");

  const { data: meals, refetch: refetchMeals } = useListMeals();
  const { data: cart, refetch: refetchCart } = useGetCart();
  const { data: cravings, refetch: refetchCravings } = useListCravings();

  const addMealToCart = useAddMealToCart({ mutation: { onSuccess: () => refetchCart() } });
  const removeMealFromCart = useRemoveMealFromCart({ mutation: { onSuccess: () => refetchCart() } });
  const approveCart = useApproveCart({ mutation: { onSuccess: () => { refetchCart(); toast({ title: "Cart approved!", description: "Order is ready." }); } } });
  const dismissCart = useDismissCart({ mutation: { onSuccess: () => { refetchCart(); toast({ title: "Cart dismissed." }); } } });
  const syncFromSheets = useSyncFromSheets({ mutation: {
    onSuccess: (data) => { refetchMeals(); toast({ title: `Synced! ${data.mealsImported} meal(s) imported, ${data.rowsProcessed} rows processed.` }); setSheetId(""); },
    onError: () => toast({ title: "Sync failed", description: "Make sure the sheet is publicly shared.", variant: "destructive" }),
  }});
  const createMeal = useCreateMeal({ mutation: { onSuccess: () => { refetchMeals(); setNewMealName(""); setShowAddMeal(false); toast({ title: "Meal added." }); } } });
  const deleteMeal = useDeleteMeal({ mutation: { onSuccess: () => { refetchMeals(); refetchCart(); } } });
  const updateCraving = useUpdateCraving({ mutation: { onSuccess: () => refetchCravings() } });

  const budget = cart?.budgetCents ?? 15000;
  const spent = cart?.totalEstimatedCostCents ?? 0;
  const budgetPct = Math.min(100, Math.round((spent / budget) * 100));
  const cartMealIds = new Set((cart?.meals ?? []).map((m: any) => m.id));
  const cartStatus = cart?.status ?? "pending";
  const cartIsLocked = cartStatus !== "pending";

  const fmtDollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <header className="mb-6 border-b border-border/50 pb-4">
        <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Shopper</h2>
        <p className="text-sm text-muted-foreground mt-1">Weekly meal planning &amp; grocery cart for Pops</p>
      </header>

      {/* Budget Bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display uppercase tracking-widest">Weekly Budget</CardTitle>
            <div className="flex items-center gap-3">
              <span className={`text-lg font-bold font-display ${budgetPct >= 90 ? "text-destructive" : budgetPct >= 70 ? "text-yellow-400" : "text-success"}`}>
                {fmtDollars(spent)}
              </span>
              <span className="text-muted-foreground text-sm">of {fmtDollars(budget)}</span>
              {cartStatus === "approved" && (
                <span className="px-2 py-0.5 rounded-sm bg-success/10 border border-success/40 text-success text-xs font-bold uppercase">✓ Approved</span>
              )}
              {cartStatus === "dismissed" && (
                <span className="px-2 py-0.5 rounded-sm bg-muted border border-border text-muted-foreground text-xs font-bold uppercase">Dismissed</span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-4 rounded-sm bg-secondary overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-sm ${budgetPct >= 90 ? "bg-destructive" : budgetPct >= 70 ? "bg-yellow-500" : "bg-success"}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{budgetPct}% of $150 budget used</p>
        </CardContent>
      </Card>

      {/* This Week's Cart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
              <ShoppingCart size={16} /> This Week's Meal Lineup
            </CardTitle>
            <span className="text-xs text-muted-foreground">Week of {cart?.weekStartDate ?? "..."}</span>
          </div>
        </CardHeader>
        <CardContent>
          {(cart?.meals ?? []).length === 0 ? (
            <p className="text-muted-foreground italic text-sm text-center py-4">No meals added yet. Browse the catalog below to add meals.</p>
          ) : (
            <div className="space-y-2">
              {(cart?.meals ?? []).map((meal: any) => (
                <div key={meal.cartMealId ?? meal.id} className="flex items-start justify-between gap-3 p-3 bg-secondary/30 rounded-sm border border-border/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{meal.name}</span>
                      <span className="text-xs text-primary font-bold">{fmtDollars(meal.estimatedCostCents)}</span>
                    </div>
                    {meal.description && <p className="text-xs text-muted-foreground mt-0.5">{meal.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(meal.ingredients ?? []).slice(0, 4).map((ing: any) => (
                        <span key={ing.id} className="text-xs px-1.5 py-0.5 bg-primary/10 border border-primary/20 rounded-sm text-primary/80">
                          {ing.name}
                        </span>
                      ))}
                      {(meal.ingredients ?? []).length > 4 && (
                        <span className="text-xs text-muted-foreground">+{(meal.ingredients ?? []).length - 4} more</span>
                      )}
                    </div>
                  </div>
                  {!cartIsLocked && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive h-7 w-7 p-0 shrink-0"
                      onClick={() => removeMealFromCart.mutate({ cartMealId: meal.cartMealId })}
                      disabled={removeMealFromCart.isPending}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!cartIsLocked && (cart?.meals ?? []).length > 0 && (
            <div className="flex gap-2 mt-4 pt-4 border-t border-border/30">
              <Button
                className="flex-1"
                onClick={() => approveCart.mutate()}
                disabled={approveCart.isPending}
              >
                <CheckCircle size={16} className="mr-2" />
                Approve Order — {fmtDollars(spent)}
              </Button>
              <Button
                variant="outline"
                onClick={() => dismissCart.mutate()}
                disabled={dismissCart.isPending}
              >
                Dismiss
              </Button>
            </div>
          )}

          {cartIsLocked && (
            <p className="text-xs text-muted-foreground italic mt-4 pt-3 border-t border-border/30">
              Cart is {cartStatus}. A new cart will be created next Monday.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Craving Suggestions */}
      {(cravings ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
              <Flame size={16} className="text-orange-400" /> Pops' Cravings
            </CardTitle>
            <CardDescription className="text-xs">Jessica captured these during check-ins — add to next week if you want</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(cravings ?? []).map((craving: MealCraving) => (
                <div key={craving.id} className="flex items-center justify-between gap-3 p-3 bg-orange-500/5 border border-orange-500/20 rounded-sm">
                  <div className="flex items-center gap-2">
                    <Flame size={14} className="text-orange-400 shrink-0" />
                    <span className="text-sm font-semibold">{craving.mealName}</span>
                    <span className="text-xs text-muted-foreground">via {craving.source}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => updateCraving.mutate({ id: craving.id, data: { status: "added" } })}
                      disabled={updateCraving.isPending}
                    >
                      <Check size={12} className="mr-1" /> Add to List
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => updateCraving.mutate({ id: craving.id, data: { status: "dismissed" } })}
                      disabled={updateCraving.isPending}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meal Catalog */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display uppercase tracking-widest">Meal Catalog</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowAddMeal(!showAddMeal)}>
              <Plus size={14} className="mr-1" /> New Meal
            </Button>
          </div>
          <CardDescription className="text-xs">Click a meal to add it to this week's cart</CardDescription>
        </CardHeader>
        <CardContent>
          {showAddMeal && (
            <form
              className="flex gap-2 mb-4 p-3 bg-secondary/30 rounded-sm border border-border/30"
              onSubmit={(e) => {
                e.preventDefault();
                if (newMealName.trim()) createMeal.mutate({ data: { name: newMealName.trim() } });
              }}
            >
              <Input
                value={newMealName}
                onChange={(e) => setNewMealName(e.target.value)}
                placeholder="Meal name..."
                className="flex-1 h-8 text-sm"
              />
              <Button type="submit" size="sm" disabled={createMeal.isPending || !newMealName.trim()} className="h-8">
                Add
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowAddMeal(false)}>
                <X size={14} />
              </Button>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(meals ?? []).map((meal: MealWithIngredients) => {
              const inCart = cartMealIds.has(meal.id);
              return (
                <div
                  key={meal.id}
                  className={`p-3 rounded-sm border transition-colors ${inCart ? "bg-primary/10 border-primary/40" : "bg-secondary/20 border-border/30 hover:border-primary/30 hover:bg-secondary/40"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{meal.name}</span>
                        <span className="text-xs text-primary font-bold">{fmtDollars(meal.estimatedCostCents)}</span>
                        {inCart && <span className="text-xs text-primary font-bold uppercase">✓ In Cart</span>}
                      </div>
                      {meal.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{meal.description}</p>}
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{meal.ingredients?.length ?? 0} ingredients</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!cartIsLocked && !inCart && (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => addMealToCart.mutate({ data: { mealId: meal.id } })}
                          disabled={addMealToCart.isPending}
                        >
                          <Plus size={12} className="mr-1" /> Add
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMeal.mutate({ id: meal.id })}
                        disabled={deleteMeal.isPending}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Google Sheets Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <RefreshCw size={16} /> Sync from Google Sheets
          </CardTitle>
          <CardDescription className="text-xs">
            Paste the ID of a publicly-shared Google Sheet (File → Share → "Anyone with link" view access).
            Format: Column A = Meal Name, B = Ingredient, C = Quantity, D = Unit, E = Cost ($).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="Sheet ID (from the URL: /spreadsheets/d/HERE/edit)"
              className="flex-1 text-sm font-mono"
            />
            <Button
              onClick={() => syncFromSheets.mutate({ data: { sheetId } })}
              disabled={!sheetId.trim() || syncFromSheets.isPending}
            >
              {syncFromSheets.isPending ? <RefreshCw size={14} className="animate-spin mr-2" /> : <RefreshCw size={14} className="mr-2" />}
              Sync
            </Button>
          </div>
          {syncFromSheets.isError && (
            <p className="text-xs text-destructive mt-2">Sync failed — make sure the sheet is shared publicly with view access.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
