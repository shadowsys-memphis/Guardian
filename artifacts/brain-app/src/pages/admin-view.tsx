import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  getGoogleToken,
  promptGoogleToken,
  pushToCalendar,
  makeMedEventDescription,
  makeShoppingEventDescription,
  makeUrgentItemDescription,
  makeScheduleTaskDescription,
  makeRotationTaskDescription,
  todayAtTime,
  quarterToHour,
  extractCalendarTitle,
  handleCalendarError,
} from "@/lib/calendar";
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
  AlertTriangle,
  Clock,
  ShoppingCart,
  X,
  RefreshCw,
  Flame,
  CheckCircle,
  FileText,
  RotateCcw,
  MessageSquare,
  Download,
  Copy,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Send,
  Cloud,
  CalendarPlus,
  Package,
  Scan,
  Image,
  Wand2,
  AlertCircle,
  Archive,
  Stethoscope,
  SlidersHorizontal,
  MapPin,
  Store,
  Syringe,
  CircleDot,
  Zap,
  Volume2,
  Lightbulb,
  History,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

import {
  useGetAppState, useUpdateAppState,
  useGetSchedule, useCreateScheduleTask, useUpdateScheduleTask, useDeleteScheduleTask, useCompleteScheduleTask,
  useGetSymptomLogs, useCreateSymptomLog,
  useGetVoiceScripts, useUpdateVoiceScript,
  useGetHaldolCycle, useUpdateHaldolCycle,
  useListHealthQuestions, useCreateHealthQuestion, useUpdateHealthQuestion, useDeleteHealthQuestion,
  useGetTodaySummary, getGetTodaySummaryQueryKey, useListCallSessions, useGetSessionDataPoints, getGetSessionDataPointsQueryKey, useGetAssessmentTrends, useGetAssessmentAnomalies,
  useGetAssessmentSettings, useUpdateAssessmentSettings,
  useGetAiModel, useSetAiModel, getGetAiModelQueryKey,
  useGetLmStudioUrl, useSetLmStudioUrl, testLmStudioConnection,
  type LmStudioConnectionResult,
  useListMeals, useCreateMeal, useDeleteMeal, useSyncFromSheets,
  useGetCart, useAddMealToCart, useRemoveMealFromCart, useApproveCart, useDismissCart,
  useListCravings, useCreateCraving, useUpdateCraving,
  useListRotationTasks, useCreateRotationTask, useUpdateRotationTask, useDeleteRotationTask, getListRotationTasksQueryKey,
  useListCareLogs, useCreateCareLog, getListCareLogsQueryKey,
  useGenerateClinicalSummary, useChatWithAssistant,
  useListInventory, getListInventoryQueryKey, useCreateInventoryItem, useRestockInventoryItem, useRemixMealPlan,
  type UpdateAppStateInput,
  type VoiceScript,
  type ScheduleTask,
  type HealthQuestion,
  type CallSession,
  type HealthDataPoint,
  type AssessmentSummary,
  type MealWithIngredients,
  type CartWithMeals,
  type MealCraving,
  type RotationTask,
  type HistoricalCareLog,
  type InventoryItem,
} from "@workspace/api-client-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleTabDnD } from "@/components/schedule-dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import { useVault } from "@/lib/vault-context";

function decodeJwtType(token: string | null): "local" | "tenant" | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.type === "local" ? "local" : "tenant";
  } catch {
    return null;
  }
}

type Tone = "gentle" | "grounding" | "urgent" | "encouraging" | "calm";
type Tab = "dashboard" | "schedule" | "symptoms" | "scripts" | "haldol" | "health" | "shopper" | "rotation" | "inventory" | "calendar-sync" | "appointments" | "documents" | "settings" | "devices" | "subscribers";

const WORKSPACE_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function AdminView() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [, navigate] = useLocation();
  const { sessionToken } = useVault();
  const isLocal = decodeJwtType(sessionToken) === "local";

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
          <NavButton active={activeTab === "devices"} onClick={() => setActiveTab("devices")} icon={<Zap size={18} />} label="Devices" />
          <NavButton active={activeTab === "inventory"} onClick={() => setActiveTab("inventory")} icon={<Package size={18} />} label="Inventory" />
          <NavButton active={activeTab === "rotation"} onClick={() => setActiveTab("rotation")} icon={<RotateCcw size={18} />} label="Rotation" />
          <NavButton active={activeTab === "calendar-sync"} onClick={() => setActiveTab("calendar-sync")} icon={<CalendarPlus size={18} />} label="Calendar Sync" />
          <div className="pt-2 border-t border-border/30 mt-2">
            <NavButton active={activeTab === "appointments"} onClick={() => setActiveTab("appointments")} icon={<Stethoscope size={18} />} label="Appointments" />
            <NavButton active={activeTab === "documents"} onClick={() => setActiveTab("documents")} icon={<Scan size={18} />} label="Scan Docs" />
            {isLocal && <NavButton active={activeTab === "subscribers"} onClick={() => setActiveTab("subscribers")} icon={<ShieldAlert size={18} />} label="Subscribers" />}
            <NavButton active={false} onClick={() => navigate("/settings")} icon={<SlidersHorizontal size={18} />} label="Settings" />
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
          {activeTab === "devices" && <DevicesTab />}
          {activeTab === "inventory" && <InventoryTab />}
          {activeTab === "rotation" && <RotationTab />}
          {activeTab === "calendar-sync" && <CalendarSyncTab />}
          {activeTab === "appointments" && <AppointmentsTab />}
          {activeTab === "documents" && <DocumentsTab />}
          {activeTab === "subscribers" && isLocal && <SubscribersTab />}
          {activeTab === "settings" && <AppSettingsTab />}
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
  yellow: "border-accent/40 bg-accent/10 text-accent",
  red: "border-destructive/50 bg-destructive/10 text-destructive",
  unknown: "border-border bg-secondary text-muted-foreground",
};

function HealthIntelligenceTab() {
  const [activeSection, setActiveSection] = useState<"summary" | "sessions" | "questions" | "settings" | "ai-brain">("summary");
  return (
    <div className="space-y-6">
      <header className="mb-6 border-b border-border/50 pb-4 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Health Intelligence</h2>
          <p className="text-muted-foreground">Pops' health data extracted from Jessica's daily conversations.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["summary", "sessions", "questions", "settings", "ai-brain"] as const).map((s) => (
            <button key={s} onClick={() => setActiveSection(s)}
              className={`px-3 py-1.5 text-xs font-display uppercase tracking-widest rounded-sm border transition-colors ${activeSection === s ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {s === "ai-brain" ? "AI Brain" : s}
            </button>
          ))}
        </div>
      </header>
      {activeSection === "summary" && <HealthSummarySection />}
      {activeSection === "sessions" && <HealthSessionsSection />}
      {activeSection === "questions" && <HealthQuestionsSection />}
      {activeSection === "settings" && <HealthSettingsSection />}
      {activeSection === "ai-brain" && <AiBrainSection />}
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
                  else if (val >= 0.4) bg = "bg-sky-400/50";
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
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-sky-400/50" /> Mid</span>
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
        <div className="flex items-start gap-3 p-4 bg-accent/10 border border-accent/30 rounded-md">
          <AlertTriangle className="text-accent shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-bold text-accent uppercase tracking-widest">Today's Alert</p>
            <p className="text-sm text-accent/80 mt-1">
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

      <div>
        <h3 className="text-lg font-display text-muted-foreground uppercase tracking-widest mb-3">7-Day Sparklines</h3>
        {trends.length === 0 ? (
          <p className="text-muted-foreground italic text-sm">No data yet — sparklines build up over daily calls.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CATS.map((cat) => {
              const cutoff = new Date();
              cutoff.setDate(cutoff.getDate() - 7);
              const cutoffStr = cutoff.toISOString().split("T")[0];
              const spark = trends
                .filter((t) => t.category === cat && t.date >= cutoffStr)
                .sort((a: any, b: any) => a.date.localeCompare(b.date))
                .map((t: any) => ({ d: t.date.slice(5), v: t.averageValue ?? 0 }));
              const lastVal = spark[spark.length - 1]?.v;
              const prevVal = spark[spark.length - 2]?.v;
              const trend = lastVal !== undefined && prevVal !== undefined
                ? lastVal > prevVal ? "↑" : lastVal < prevVal ? "↓" : "→"
                : null;
              const isSustained = sustainedAnomalies.includes(cat);
              return (
                <div key={cat} className={`border rounded-md p-3 ${isSustained ? "border-destructive/60 bg-destructive/5" : "border-border/50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-display uppercase tracking-widest text-muted-foreground truncate">
                      {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
                    </span>
                    {trend && (
                      <span className={`text-xs font-bold ml-1 shrink-0 ${trend === "↑" ? "text-success" : trend === "↓" ? "text-destructive" : "text-muted-foreground"}`}>
                        {trend}
                      </span>
                    )}
                  </div>
                  {spark.length > 0 ? (
                    <ResponsiveContainer width="100%" height={40}>
                      <LineChart data={spark} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                        <Line
                          type="monotone"
                          dataKey="v"
                          stroke={isSustained ? "#ef4444" : "#4a9f68"}
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <YAxis domain={[0, 1]} hide />
                        <Tooltip
                          contentStyle={{ background: "#fafaf8", border: "1px solid #d1d5db", fontSize: 10, padding: "2px 6px" }}
                          formatter={(v: number) => [v.toFixed(2), ""]}
                          labelFormatter={(l) => l}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-10 flex items-center justify-center">
                      <span className="text-xs text-muted-foreground/40 italic">no data</span>
                    </div>
                  )}
                  {spark.length > 0 && (
                    <div className="text-right text-xs text-muted-foreground mt-0.5">
                      {lastVal !== undefined ? lastVal.toFixed(2) : "--"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b7280" }} />
                        <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} domain={[0, 1]} />
                        <Tooltip
                          contentStyle={{ background: "#fafaf8", border: "1px solid #d1d5db", fontSize: 11 }}
                          formatter={(v: number) => [v.toFixed(2), CATEGORY_LABELS[cat]]}
                        />
                        <Line type="monotone" dataKey="value" stroke={sustainedAnomalies.includes(cat) ? "#ef4444" : "#4a9f68"} strokeWidth={2} dot={false} />
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
                                {dp.parsedIntensity && dp.parsedIntensity !== "none" && <span className="ml-1 text-accent">({dp.parsedIntensity})</span>}
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

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

function AiBrainSection() {
  const { data: aiStatus, refetch } = useGetAiModel({ query: { queryKey: getGetAiModelQueryKey() } });
  const setAiModel = useSetAiModel();
  const { toast } = useToast();

  const activeModel = (aiStatus as any)?.activeModel ?? "gemini";
  const models: Array<{ id: string; label: string; provider: string; lmStudioModelId: string | null }> = (aiStatus as any)?.models ?? [];

  const { data: lmUrlData } = useGetLmStudioUrl();
  const saveLmUrl = useSetLmStudioUrl();

  const [lmUrl, setLmUrl] = useState("http://localhost:1234");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LmStudioConnectionResult | null>(null);

  useEffect(() => {
    if ((lmUrlData as any)?.url) setLmUrl((lmUrlData as any).url);
  }, [lmUrlData]);

  const handleSelect = (modelId: string) => {
    setAiModel.mutate({ data: { activeModel: modelId } }, {
      onSuccess: () => {
        toast({ title: "AI Brain updated", description: `Now using: ${models.find((m) => m.id === modelId)?.label ?? modelId}` });
        refetch();
      },
      onError: () => toast({ title: "Failed to update model", variant: "destructive" }),
    });
  };

  const handleSaveUrl = () => {
    setTestResult(null);
    saveLmUrl.mutate({ data: { url: lmUrl.trim() } }, {
      onSuccess: () => toast({ title: "LM Studio URL saved" }),
      onError: () => toast({ title: "Failed to save URL", variant: "destructive" }),
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const d = await testLmStudioConnection({ url: lmUrl.trim() });
      setTestResult(d);
    } catch {
      setTestResult({ connected: false, error: "Could not reach the API server" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h3 className="text-lg font-display text-muted-foreground uppercase tracking-widest">AI Brain</h3>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit size={18} className="text-primary" />
            Active Model
          </CardTitle>
          <CardDescription>
            Select which AI model powers Jessica's conversations. LM Studio models require the LM Studio app to be open and the model loaded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {models.map((model) => {
            const isActive = model.id === activeModel;
            const isLm = model.provider === "lmstudio";
            return (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                disabled={setAiModel.isPending}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-sm border transition-all text-left ${
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/30 text-foreground hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{isLm ? "🖥️" : "✨"}</span>
                  <div>
                    <p className="font-display text-sm uppercase tracking-widest font-bold">{model.label}</p>
                    <p className="text-xs text-muted-foreground capitalize">{isLm ? "Local · LM Studio" : "Cloud · Google"}</p>
                  </div>
                </div>
                {isActive && (
                  <span className="px-2 py-0.5 text-xs font-display uppercase tracking-widest bg-primary/20 text-primary rounded-sm border border-primary/30">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit size={18} className="text-muted-foreground" />
            LM Studio URL
          </CardTitle>
          <CardDescription>
            Paste your LM Studio address here. Use a tunnel (ngrok, Cloudflare Tunnel) to reach it from the deployed app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={lmUrl}
              onChange={(e) => { setLmUrl(e.target.value); setTestResult(null); }}
              placeholder="http://localhost:1234"
              className="flex-1 bg-secondary border border-border rounded-sm px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button size="sm" onClick={handleSaveUrl} disabled={saveLmUrl.isPending}>
              {saveLmUrl.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testing}
            className="w-full"
          >
            {testing ? "Testing…" : "Test Connection"}
          </Button>
          {testResult && (
            <div className={`p-3 rounded-sm border text-xs font-display space-y-2 ${
              testResult.connected
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}>
              <p className="uppercase tracking-widest">
                {testResult.connected
                  ? `Connected — ${testResult.modelCount ?? 0} model${testResult.modelCount === 1 ? "" : "s"} loaded`
                  : `Not reachable — ${testResult.error ?? "unknown error"}`}
              </p>
              {testResult.connected && testResult.modelIds && testResult.modelIds.length > 0 && (
                <ul className="space-y-1 pt-1 border-t border-success/20">
                  {testResult.modelIds.map((id) => {
                    const knownModel = models.find((m) => m.lmStudioModelId && id.toLowerCase().includes(m.lmStudioModelId.toLowerCase()));
                    return (
                      <li key={id} className={`flex items-center gap-2 ${knownModel ? "text-success" : "text-success/50"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${knownModel ? "bg-success" : "bg-success/30"}`} />
                        <span className="font-mono normal-case tracking-normal truncate">{id}</span>
                        {knownModel && <span className="ml-auto shrink-0 opacity-60">{knownModel.label}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {testResult.connected && (testResult.modelIds ?? []).length === 0 && (
                <p className="uppercase tracking-widest text-accent border-t border-success/20 pt-1">
                  No models loaded — open a model in LM Studio
                </p>
              )}
              {testResult.connected && activeModel !== "gemini" && (testResult.modelIds ?? []).length > 0 && (() => {
                const activeInfo = models.find((m) => m.id === activeModel);
                const isLoaded = activeInfo?.lmStudioModelId && testResult.modelIds!.some((id) => id.toLowerCase().includes(activeInfo.lmStudioModelId!.toLowerCase()));
                return !isLoaded ? (
                  <p className="uppercase tracking-widest text-accent border-t border-success/20 pt-1">
                    ⚠ Active model ({activeInfo?.label ?? activeModel}) not found in loaded list
                  </p>
                ) : null;
              })()}
            </div>
          )}
          <p className="text-xs text-muted-foreground/50">
            Falls back to <span className="font-mono">LM_STUDIO_URL</span> env var, then <span className="font-mono">http://localhost:1234</span>.
          </p>
        </CardContent>
      </Card>
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
  const { data: symptomLogs } = useGetSymptomLogs();
  const { data: todaySummary } = useGetTodaySummary();
  const { data: cart } = useGetCart();
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

      {/* ── Pops Status Card ───────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold flex items-center gap-2">
              <HeartPulse size={14} /> Pops Status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const last = (symptomLogs as any[])?.[0];
              if (!last) return <p className="text-xs text-muted-foreground">No symptom logs yet.</p>;
              return (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest">Hallucinations</span>
                    <span className={`text-sm font-bold ${last.hallucinationIntensity >= 3 ? "text-destructive" : last.hallucinationIntensity >= 1 ? "text-warning" : "text-success"}`}>
                      {last.hallucinationIntensity}/5
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest">PTSD Trigger</span>
                    <span className={`text-sm font-bold ${last.ptsdTrigger ? "text-destructive" : "text-success"}`}>
                      {last.ptsdTrigger ? "Active" : "None"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest">Motivation</span>
                    <span className="text-sm font-bold">{last.motivationLevel}/5</span>
                  </div>
                  {last.behaviorNotes && (
                    <p className="text-xs text-muted-foreground italic border-t border-border/40 pt-2">{last.behaviorNotes}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 pt-1">
                    Last log: {last.loggedAt ? new Date(last.loggedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Unknown"}
                  </p>
                </>
              );
            })()}
            {todaySummary && (
              <div className="border-t border-border/40 pt-2">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1">Last Check-in</p>
                <p className="text-xs text-muted-foreground">
                  {(todaySummary as any).sessionCount ?? 0} session{(todaySummary as any).sessionCount !== 1 ? "s" : ""} today
                  {(todaySummary as any).lastSessionTime ? ` · ${new Date((todaySummary as any).lastSessionTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Today's Schedule by Q1-Q4 ─────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold flex items-center gap-2">
              <Clock size={14} /> Today's Schedule
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => {
              const qLabels: Record<string, string> = { Q1: "Morning", Q2: "Afternoon", Q3: "Evening", Q4: "Night" };
              const tasks = (schedule ?? []).filter((t) => t.quarter === q && t.isActive !== false);
              const done = tasks.filter((t) => t.isCompleted).length;
              return (
                <div key={q}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{q} — {qLabels[q]}</span>
                    <span className="text-[10px] text-muted-foreground">{done}/{tasks.length}</span>
                  </div>
                  {tasks.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/40 italic">No tasks</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {tasks.map((t) => (
                        <div
                          key={t.id}
                          title={t.title}
                          className={`h-2 w-2 rounded-full shrink-0 ${t.isCompleted ? "bg-success" : "bg-border"}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {(schedule ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground/60">No active schedule tasks.</p>
            )}
          </CardContent>
        </Card>

        {/* ── Cart Status ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold flex items-center gap-2">
              <ShoppingCart size={14} /> Grocery Cart
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!cart ? (
              <p className="text-xs text-muted-foreground">No cart this week yet.</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-widest ${
                    (cart as any).status === "approved" ? "bg-success/10 text-success" :
                    (cart as any).status === "ordered" ? "bg-primary/10 text-primary" :
                    "bg-secondary text-muted-foreground"
                  }`}>
                    {(cart as any).status ?? "pending"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">Estimated</span>
                  <span className="text-sm font-bold">${(((cart as any).totalEstimatedCostCents ?? 0) / 100).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">Budget</span>
                  <span className="text-sm font-bold">${(((cart as any).budgetCents ?? 15000) / 100).toFixed(2)}</span>
                </div>
                <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${((cart as any).totalEstimatedCostCents ?? 0) > ((cart as any).budgetCents ?? 15000) ? "bg-destructive" : "bg-success"}`}
                    style={{ width: `${Math.min(100, (((cart as any).totalEstimatedCostCents ?? 0) / ((cart as any).budgetCents ?? 15000)) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/50">
                  Week of {(cart as any).weekStartDate}
                  {(cart as any).approvedAt ? ` · Approved ${new Date((cart as any).approvedAt).toLocaleDateString()}` : ""}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
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
  const [calSyncingId, setCalSyncingId] = useState<number | null>(null);

  const handlePushTaskToCalendar = async (task: ScheduleTask) => {
    let token = getGoogleToken();
    if (!token) token = promptGoogleToken(toast);
    if (!token) return;
    setCalSyncingId(task.id);
    const today = new Date().toISOString().split("T")[0];
    const h = quarterToHour(task.quarter);
    const startIso = `${today}T${String(h).padStart(2, "0")}:00:00`;
    const result = await pushToCalendar(
      token,
      {
        summary: `[Schedule] ${task.title}`,
        description: makeScheduleTaskDescription(task),
        startTime: startIso,
      },
      "appointment"
    );
    setCalSyncingId(null);
    if (result.success) {
      toast({ title: "Added to Calendar!", description: `${task.title} · 30-min alert set.` });
    } else {
      handleCalendarError(result.error ?? "Unknown error", toast);
    }
  }; 

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const quarter = formData.get("quarter") as "Q1" | "Q2" | "Q3" | "Q4";
    const autoOrder = (schedule ?? []).filter((t) => t.quarter === quarter).length;
    const data = {
      quarter,
      timeLabel: formData.get("timeLabel") as string,
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      voiceScript: formData.get("voiceScript") as string,
      order: editingTask ? editingTask.order : autoOrder,
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

      <ScheduleTabDnD
        schedule={schedule}
        updateTask={(vars) => updateTask.mutate(vars)}
        completeTask={(vars) => completeTask.mutate(vars)}
        deleteTask={(vars) => deleteTask.mutate(vars)}
        onEdit={(task) => { setEditingTask(task); setIsModalOpen(true); }}
        onCalendar={handlePushTaskToCalendar}
        calSyncingId={calSyncingId}
      />

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
          <Card key={script.id} className={`transition-all ${editingId === script.id ? "border-primary shadow-[0_0_20px_rgba(70,159,104,0.15)]" : ""}`}>
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
  const [calPushing, setCalPushing] = useState(false);

  const handlePushInjectionToCalendar = async () => {
    let token = getGoogleToken();
    if (!token) token = promptGoogleToken(toast);
    if (!token) return;
    if (!haldol?.nextInjectionDate) return;
    setCalPushing(true);
    const result = await pushToCalendar(token, {
      summary: "💊 Pops — Haldol Decanoate Injection",
      description: makeMedEventDescription({
        cycleDay: haldol.cycleDay ?? null,
        nextInjectionDate: haldol.nextInjectionDate,
        isZombiePhase: haldol.isZombiePhase ?? false,
        notes: haldol.notes,
      }),
      startTime: `${haldol.nextInjectionDate}T09:00:00`,
      allDay: false,
    });
    setCalPushing(false);
    if (result.success) {
      toast({ title: "Injection added to Calendar!", description: `Event created for ${haldol.nextInjectionDate}. Alert set for 30 min before.` });
    } else {
      handleCalendarError(result.error ?? "Unknown error", toast);
    }
  };

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

      {/* 14-Segment Phase Arc */}
      {haldol && (
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-display uppercase tracking-widest">14-Day Cycle Arc</CardTitle>
            <CardDescription>Days 1–5 = High Symptom (rest). Days 6–14 = Stabilization.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: 14 }, (_, i) => {
                const day = i + 1;
                const isZombie = day <= 5;
                const isCurrent = day === haldol.cycleDay;
                return (
                  <div
                    key={day}
                    className={`flex flex-col items-center gap-1 flex-1 min-w-[32px]`}
                  >
                    <div
                      className={`w-full h-10 rounded-sm flex items-center justify-center text-xs font-bold transition-all border-2 ${
                        isCurrent
                          ? isZombie
                            ? "bg-destructive border-destructive text-destructive-foreground shadow-lg scale-110"
                            : "bg-success border-success text-white shadow-lg scale-110"
                          : isZombie
                            ? "bg-destructive/20 border-destructive/30 text-destructive/70"
                            : "bg-success/15 border-success/25 text-success/70"
                      }`}
                    >
                      {day}
                    </div>
                    <div className={`w-1 h-1 rounded-full ${isZombie ? "bg-destructive/50" : "bg-success/50"}`} />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-destructive/30 inline-block" /> Days 1–5 High Symptom</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-success/30 inline-block" /> Days 6–14 Stabilization</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border-2 border-primary inline-block" /> Today (Day {haldol.cycleDay})</span>
            </div>
          </CardContent>
        </Card>
      )}

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
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 gap-2 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={handlePushInjectionToCalendar}
                  disabled={calPushing || !haldol.nextInjectionDate}
                >
                  <CalendarPlus size={14} />
                  {calPushing ? "Pushing…" : "Push to Calendar"}
                </Button>
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

      {/* Medication Reconciliation Log */}
      <MedicationReconciliationLog />
    </div>
  );
}

export function ShopperTab() {
  const { toast } = useToast();
  const [sheetId, setSheetId] = useState("");
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [newMealName, setNewMealName] = useState("");

  const { data: meals, refetch: refetchMeals } = useListMeals();
  const { data: cart, refetch: refetchCart } = useGetCart();
  const { data: cravings, refetch: refetchCravings } = useListCravings();
  const [mealDriveExporting, setMealDriveExporting] = useState(false);
  const [remixInput, setRemixInput] = useState("");
  const [remixedPlan, setRemixedPlan] = useState("");
  const [calPushingShop, setCalPushingShop] = useState(false);
  const [urgentItems, setUrgentItems] = useState<Set<string>>(new Set());
  const [urgentPushingKey, setUrgentPushingKey] = useState<string | null>(null);
  const [expandedMeals, setExpandedMeals] = useState<Set<number>>(new Set());
  const [fulfillment, setFulfillment] = useState<{
    store: string;
    checkoutUrl: string;
    totalEstimatedCents: number;
    budgetCents: number;
    overBudgetCount: number;
    status: string;
    fallbackMode: boolean;
    initiatedBy: string;
    createdAt: string;
    items: Array<{ itemName: string; priceCents: number; quantity: number; status: string }>;
  } | null>(null);
  const [fulfillmentLoading, setFulfillmentLoading] = useState(false);
  const [fulfillmentFetching, setFulfillmentFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchFulfillment = async (initial = false) => {
      try {
        const res = await fetch(`${WORKSPACE_BASE}/api/shopper/fulfill/current`);
        if (res.ok) {
          const data = await res.json();
          if (data && !cancelled) setFulfillment(data);
        }
      } catch {} finally {
        if (initial && !cancelled) setFulfillmentFetching(false);
      }
    };
    fetchFulfillment(true);
    // Poll every 30 s to catch Pops-initiated fulfillments that arrive while Ray is on the tab
    const poll = setInterval(() => fetchFulfillment(false), 30_000);
    return () => { cancelled = true; clearInterval(poll); };
  }, []);

  const toggleMealExpand = (id: number) =>
    setExpandedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleMarkUrgent = async (item: any) => {
    const key = item.ingredientName as string;
    const nowUrgent = !urgentItems.has(key);
    setUrgentItems((prev) => {
      const next = new Set(prev);
      if (nowUrgent) next.add(key); else next.delete(key);
      return next;
    });
    if (!nowUrgent) return;
    let token = getGoogleToken();
    if (!token) token = promptGoogleToken(toast);
    if (!token) return;
    setUrgentPushingKey(key);
    const today = new Date().toISOString().split("T")[0];
    const result = await pushToCalendar(
      token,
      {
        summary: `⚡ URGENT — Pick up: ${key}`,
        description: makeUrgentItemDescription({
          ingredientName: item.ingredientName,
          totalQuantity: item.totalQuantity,
          unit: item.unit,
          estimatedCostCents: item.estimatedCostCents,
        }),
        startTime: today,
        allDay: true,
      },
      "urgent"
    );
    setUrgentPushingKey(null);
    if (result.success) {
      toast({ title: `⚡ Urgent alert pushed!`, description: `"${key}" added to today's calendar.` });
    } else {
      handleCalendarError(result.error ?? "Unknown error", toast);
    }
  };

  const handlePushShoppingToCalendar = async () => {
    let token = getGoogleToken();
    if (!token) token = promptGoogleToken(toast);
    if (!token) return;
    const items = (cart?.items ?? []) as any[];
    if (items.length === 0) {
      toast({ title: "No items in cart", description: "Add meals first, then push the shopping reminder.", variant: "destructive" });
      return;
    }
    const weekStart = cart?.weekStartDate ?? new Date().toISOString().split("T")[0];
    setCalPushingShop(true);
    const result = await pushToCalendar(token, {
      summary: `🛒 Grocery Run — Week of ${weekStart}`,
      description: makeShoppingEventDescription({
        weekStartDate: weekStart,
        items: items.map((it: any) => ({
          ingredientName: it.ingredientName,
          totalQuantity: it.totalQuantity,
          unit: it.unit,
          estimatedCostCents: it.estimatedCostCents,
        })),
        totalCostCents: cart?.totalEstimatedCostCents ?? 0,
        budgetCents: cart?.budgetCents ?? 15000,
      }),
      startTime: weekStart,
      allDay: true,
    });
    setCalPushingShop(false);
    if (result.success) {
      toast({ title: "Shopping Reminder pushed!", description: `All-day event added to your calendar for ${weekStart}.` });
    } else {
      handleCalendarError(result.error ?? "Unknown error", toast);
    }
  };

  const handleExportMealPlan = async () => {
    let token = getGoogleToken();
    if (!token) token = promptGoogleToken(toast);
    if (!token) return;
    const mealsInCart = (cart?.meals ?? []) as any[];
    if (mealsInCart.length === 0) {
      toast({ title: "No meals in cart", description: "Add meals to this week's cart before exporting.", variant: "destructive" });
      return;
    }
    const lines: string[] = [
      `br(AI)n Weekly Meal Plan — Week of ${cart?.weekStartDate ?? new Date().toISOString().split("T")[0]}`,
      `Generated: ${new Date().toLocaleString()}`,
      `Budget: $${((cart?.totalEstimatedCostCents ?? 0) / 100).toFixed(2)} of $${((cart?.budgetCents ?? 15000) / 100).toFixed(2)}`,
      `Status: ${(cart?.status ?? "pending").toUpperCase()}`,
      "",
      "== MEALS ==",
      ...mealsInCart.map((m: any, i: number) => [
        `${i + 1}. ${m.name} — $${(m.estimatedCostCents / 100).toFixed(2)}`,
        ...((m.ingredients ?? []) as any[]).map((ing: any) => `   • ${ing.name}: ${ing.quantity} ${ing.unit}`),
      ].join("\n")),
      "",
      "== SHOPPING LIST ==",
      ...((cart as any)?.items ?? []).map((item: any) =>
        `• ${item.ingredientName}: ${item.totalQuantity} ${item.unit} — $${(item.estimatedCostCents / 100).toFixed(2)}`
      ),
    ];
    const content = lines.join("\n");
    const filename = `meal-plan-${cart?.weekStartDate ?? new Date().toISOString().split("T")[0]}.txt`;
    setMealDriveExporting(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/drive/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-google-access-token": token },
        body: JSON.stringify({ filename, content, mimeType: "text/plain" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Drive export failed.");
      toast({ title: "Meal Plan exported!", description: data.link ? `Saved as "${data.filename}"` : "File saved to Google Drive." });
    } catch (err: any) {
      const msg: string = err?.message ?? "Drive export failed.";
      if (msg.includes("denied") || msg.includes("access")) {
        toast({ title: "Google access denied", description: "Re-grant Drive permissions in your Google Account.", variant: "destructive" });
      } else {
        toast({ title: "Drive export failed", description: msg, variant: "destructive" });
      }
    } finally {
      setMealDriveExporting(false);
    }
  };

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
  const remixMealPlanMutation = useRemixMealPlan({ mutation: {
    onSuccess: (data) => { setRemixedPlan((data as any).updatedPlan ?? ""); setRemixInput(""); toast({ title: "Meal plan remixed!" }); },
    onError: () => toast({ title: "Remix failed", description: "Gemini could not remix the plan.", variant: "destructive" }),
  }});

  const currentPlanText = (() => {
    const mealsInCart = (cart?.meals ?? []) as any[];
    if (mealsInCart.length === 0) return "";
    return [
      `Weekly Meal Plan — Week of ${cart?.weekStartDate ?? "this week"}`,
      ...mealsInCart.map((m: any) => `• ${m.name} ($${(m.estimatedCostCents / 100).toFixed(2)})`),
      `Total: $${((cart?.totalEstimatedCostCents ?? 0) / 100).toFixed(2)} of $200 budget`,
    ].join("\n");
  })();

  const handleRemix = () => {
    const plan = remixedPlan || currentPlanText;
    if (!plan || !remixInput.trim()) return;
    remixMealPlanMutation.mutate({ data: { currentPlan: plan, remixPrompt: remixInput.trim() } });
  };

  const budget = cart?.budgetCents ?? 15000;
  const spent = cart?.totalEstimatedCostCents ?? 0;
  const budgetPct = Math.min(100, Math.round((spent / budget) * 100));
  const cartMealIds = new Set((cart?.meals ?? []).map((m: any) => m.id));
  const cartStatus = cart?.status ?? "pending";
  const cartIsLocked = cartStatus !== "pending";

  const fmtDollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <header className="mb-6 border-b border-border/50 pb-4 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Shopper</h2>
          <p className="text-sm text-muted-foreground mt-1">Weekly meal planning &amp; grocery cart for Pops</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handlePushShoppingToCalendar} disabled={calPushingShop} className="gap-2 shrink-0">
            <CalendarPlus size={14} /> {calPushingShop ? "Pushing…" : "Push to Calendar"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportMealPlan} disabled={mealDriveExporting} className="gap-2 shrink-0">
            <Cloud size={14} /> Export to Drive
          </Button>
        </div>
      </header>

      {/* Budget Rules */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <AlertCircle size={14} className="text-primary" /> Budget Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-sm border border-border/40 bg-secondary/20">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Weekly Cap</p>
              <p className="text-2xl font-display text-primary">$200</p>
            </div>
            <div className="p-3 rounded-sm border-2 border-primary/60 bg-primary/10 relative">
              <div className="absolute -top-2 left-2 px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded-sm">⚠ Critical</div>
              <p className="text-xs font-bold text-primary uppercase tracking-widest">Pepsi Factor</p>
              <p className="text-lg font-display text-primary leading-tight">4× 2L bottles/wk</p>
              <p className="text-xs text-primary/70 mt-0.5">Non-negotiable. Always on list.</p>
            </div>
            <div className="p-3 rounded-sm border border-border/40 bg-secondary/20">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Snack Limit</p>
              <p className="text-xl font-display text-foreground">$25<span className="text-sm text-muted-foreground">/wk</span></p>
            </div>
            <div className="p-3 rounded-sm border border-border/40 bg-secondary/20">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Beverage Limit</p>
              <p className="text-xl font-display text-foreground">$20<span className="text-sm text-muted-foreground">/wk</span></p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget Bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display uppercase tracking-widest">Weekly Budget</CardTitle>
            <div className="flex items-center gap-3">
              <span className={`text-lg font-bold font-display ${budgetPct >= 90 ? "text-destructive" : budgetPct >= 70 ? "text-accent" : "text-success"}`}>
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
              className={`h-full transition-all duration-500 rounded-sm ${budgetPct >= 90 ? "bg-destructive" : budgetPct >= 70 ? "bg-accent" : "bg-success"}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{budgetPct}% of ${(budget / 100).toFixed(0)} budget used</p>
        </CardContent>
      </Card>

      {/* Cart Status Timeline */}
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display uppercase tracking-widest">Cart Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-0">
            {(["Draft", "Approved", "Ordered"] as const).map((step, idx) => {
              const stepStatus = ["pending", "approved", "ordered"][idx];
              const isDone =
                cartStatus === "ordered"
                  ? idx <= 2
                  : cartStatus === "approved"
                    ? idx <= 1
                    : idx === 0;
              const isCurrent =
                (step === "Draft" && cartStatus === "pending") ||
                (step === "Approved" && cartStatus === "approved") ||
                (step === "Ordered" && cartStatus === "ordered");
              const isCancelled = cartStatus === "dismissed" && step === "Draft";
              return (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1.5 flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold transition-all ${
                      isCancelled
                        ? "border-muted-foreground/30 bg-muted text-muted-foreground"
                        : isCurrent
                          ? "border-primary bg-primary/10 text-primary"
                          : isDone
                            ? "border-success bg-success/10 text-success"
                            : "border-border/30 bg-secondary/30 text-muted-foreground/40"
                    }`}>
                      {isDone && !isCurrent ? <Check size={14} /> : idx + 1}
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wide ${isCurrent ? "text-primary" : isDone ? "text-success" : "text-muted-foreground/40"}`}>
                      {isCancelled ? "Cancelled" : step}
                    </span>
                  </div>
                  {idx < 2 && (
                    <div className={`h-0.5 flex-1 mx-1 rounded-full ${isDone && !isCurrent ? "bg-success/40" : "bg-border/30"}`} />
                  )}
                </div>
              );
            })}
          </div>
          {cartStatus === "dismissed" && (
            <p className="text-xs text-muted-foreground/60 mt-3 text-center italic">This cart was dismissed. Start fresh to begin a new order.</p>
          )}
        </CardContent>
      </Card>

      {/* Fulfillment Panel */}
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
              <ShoppingCart size={16} /> Agentic Fulfillment
            </CardTitle>
            <button
              onClick={async () => {
                setFulfillmentLoading(true);
                try {
                  const res = await fetch(`${WORKSPACE_BASE}/api/shopper/fulfill`, { method: "POST" });
                  const data = await res.json();
                  if (data && !data.error) {
                    setFulfillment(data);
                    toast({ title: "Fulfillment complete", description: `${data.items?.length ?? 0} items queued for ${data.store === "stater_bros" ? "Instacart" : "Walmart"}.` });
                  } else {
                    toast({ title: "Fulfillment failed", description: data.error ?? "Unknown error", variant: "destructive" });
                  }
                } catch {
                  toast({ title: "Fulfillment failed", description: "Network error", variant: "destructive" });
                } finally {
                  setFulfillmentLoading(false);
                }
              }}
              disabled={fulfillmentLoading}
              className="px-4 py-1.5 bg-primary text-primary-foreground rounded-sm font-display text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {fulfillmentLoading ? "Running Agent…" : "Run Fulfillment"}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {fulfillmentFetching ? (
            <p className="text-xs text-muted-foreground italic">Loading…</p>
          ) : !fulfillment ? (
            <p className="text-xs text-muted-foreground italic">No fulfillment run yet — click "Run Fulfillment" or say "grocery order" to Jessica.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    {fulfillment.store === "stater_bros" ? "Instacart / Stater Bros" : "Walmart Grocery"}
                  </span>
                  <span className={`px-2 py-0.5 rounded-sm text-xs font-bold uppercase ${fulfillment.status === "ready" ? "bg-success/10 border border-success/40 text-success" : "bg-muted border border-border text-muted-foreground"}`}>
                    {fulfillment.status}
                  </span>
                  {fulfillment.fallbackMode && (
                    <span className="px-2 py-0.5 rounded-sm text-xs font-bold uppercase bg-accent/10 border border-accent/40 text-accent">Estimated Prices</span>
                  )}
                  {fulfillment.initiatedBy === "pops" && (
                    <span className="px-2 py-0.5 rounded-sm text-xs font-bold uppercase bg-primary/10 border border-primary/40 text-primary">Pops → Ray</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-foreground">${(fulfillment.totalEstimatedCents / 100).toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground ml-1">est.</span>
                  {fulfillment.overBudgetCount > 0 && (
                    <span className="ml-2 text-xs text-accent font-bold">{fulfillment.overBudgetCount} over budget</span>
                  )}
                </div>
              </div>

              {(fulfillment.items ?? []).length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {(fulfillment.items ?? []).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.status === "found" ? "bg-success" : item.status === "over_budget" ? "bg-accent" : "bg-muted-foreground/40"}`} />
                        {item.affiliateUrl && item.status === "found" ? (
                          <a href={item.affiliateUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{item.itemName}</a>
                        ) : (
                          <span className={`${item.status === "over_budget" ? "text-muted-foreground/60 line-through" : "text-foreground"} truncate`}>{item.itemName}</span>
                        )}
                        {item.status === "over_budget" && <span className="text-accent text-[10px] font-bold uppercase shrink-0">over budget</span>}
                      </div>
                      <span className="text-muted-foreground shrink-0 ml-2">${(item.priceCents / 100).toFixed(2)} × {item.quantity}</span>
                    </div>
                  ))}
                </div>
              )}

              {fulfillment.checkoutUrl && (
                <a
                  href={fulfillment.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-sm font-display text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors"
                >
                  Open {fulfillment.store === "stater_bros" ? "Instacart" : "Walmart"} Cart →
                </a>
              )}
              {fulfillment.createdAt && (
                <p className="text-[10px] text-muted-foreground/50">Last run: {new Date(fulfillment.createdAt).toLocaleString()}</p>
              )}
            </div>
          )}
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
                    {(meal.ingredients ?? []).length > 0 && (
                      <div className="mt-1.5">
                        <button
                          onClick={() => toggleMealExpand(meal.id)}
                          className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary font-bold uppercase tracking-wide"
                        >
                          {expandedMeals.has(meal.id) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {(meal.ingredients ?? []).length} ingredient{(meal.ingredients ?? []).length !== 1 ? "s" : ""}
                        </button>
                        {expandedMeals.has(meal.id) && (
                          <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-primary/20">
                            {(meal.ingredients ?? []).map((ing: any) => (
                              <div key={ing.id} className="flex items-center justify-between text-xs">
                                <span className="text-foreground/80">{ing.name} <span className="text-muted-foreground">× {ing.quantity} {ing.unit}</span></span>
                                {ing.estimatedCostCents > 0 && (
                                  <span className="text-muted-foreground ml-2 shrink-0">${(ing.estimatedCostCents / 100).toFixed(2)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30 gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground italic">
                Cart is {cartStatus}.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={async () => {
                  await fetch(`${WORKSPACE_BASE}/api/shopper/cart/reset`, { method: "POST" });
                  refetchCart();
                }}
              >
                <RefreshCw size={12} className="mr-1" /> Start Fresh
              </Button>
            </div>
          )}

          {(cart?.items ?? []).length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Shopping List</p>
              <div className="space-y-1.5">
                {(cart?.items ?? []).map((item: any) => {
                  const isUrgent = urgentItems.has(item.ingredientName);
                  const isPushing = urgentPushingKey === item.ingredientName;
                  return (
                    <div key={item.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm text-xs transition-colors ${isUrgent ? "bg-accent/10 border border-accent/30" : "hover:bg-secondary/30"}`}>
                      <span className={`${isUrgent ? "text-accent font-bold" : "text-foreground/80"}`}>
                        {isUrgent && "⚡ "}{item.ingredientName} <span className="text-muted-foreground font-normal">×{item.totalQuantity} {item.unit}</span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground">{fmtDollars(item.estimatedCostCents)}</span>
                        <button
                          onClick={() => handleMarkUrgent(item)}
                          disabled={isPushing}
                          title={isUrgent ? "Marked urgent — click to un-mark" : "Mark urgent & push calendar alert"}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                            isUrgent
                              ? "bg-accent/20 border-accent/50 text-accent"
                              : "border-border/40 text-muted-foreground/60 hover:border-accent/40 hover:text-accent"
                          }`}
                        >
                          {isPushing ? <RefreshCw size={8} className="animate-spin" /> : <CalendarPlus size={8} />}
                          {isPushing ? "…" : isUrgent ? "Urgent" : "Urgent"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Craving Suggestions */}
      {(cravings ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
              <Flame size={16} className="text-accent" /> Pops' Cravings
            </CardTitle>
            <CardDescription className="text-xs">Jessica captured these during check-ins — add to next week if you want</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(cravings ?? []).map((craving: MealCraving) => (
                <div key={craving.id} className="flex items-center justify-between gap-3 p-3 bg-accent/5 border border-accent/20 rounded-sm">
                  <div className="flex items-center gap-2">
                    <Flame size={14} className="text-accent shrink-0" />
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

      {/* AI Meal Remix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Wand2 size={16} className="text-primary" /> AI Meal Remix
          </CardTitle>
          <CardDescription className="text-xs">Describe a modification — Gemini rewrites the plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 rounded-sm border border-border/40 bg-secondary/20 min-h-[80px] text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs leading-relaxed">
            {remixedPlan || currentPlanText || "Add meals to the cart to generate a plan for remix."}
          </div>
          <div className="flex gap-2">
            <Input
              value={remixInput}
              onChange={(e) => setRemixInput(e.target.value)}
              placeholder="e.g. Low-sodium chicken instead of steak this week"
              className="flex-1 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && remixInput.trim()) handleRemix(); }}
            />
            <Button size="sm" onClick={handleRemix} disabled={!remixInput.trim() || !currentPlanText || remixMealPlanMutation.isPending}>
              {remixMealPlanMutation.isPending ? <RefreshCw size={14} className="animate-spin mr-1" /> : <Wand2 size={14} className="mr-1" />}
              Remix
            </Button>
          </div>
          {remixedPlan && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-success">✓ Remix applied — review the updated plan above</p>
              <button onClick={() => setRemixedPlan("")} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>
            </div>
          )}
        </CardContent>
      </Card>

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

const ROTATION_CATEGORY_EMOJI: Record<string, string> = {
  "Medication": "💊",
  "Food Intake": "🍽️",
  "Physical Rotation": "🔄",
  "Biometric Read": "📊",
  "Cognitive": "🧠",
};

const MED_RESPONSES = [
  { key: "stable", label: "Stable", emoji: "🟢", color: "border-success/40 text-success" },
  { key: "drowsy", label: "Drowsy", emoji: "🟡", color: "border-accent/40 text-accent" },
  { key: "fatigued", label: "Fatigued", emoji: "🟠", color: "border-accent/60 text-accent/80" },
  { key: "agitated", label: "Agitated", emoji: "🔴", color: "border-destructive/40 text-destructive" },
] as const;

function InventoryTab() {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ itemName: "", category: "food", replenishmentCycle: "weekly", notes: "" });
  const [intakeImagePreview, setIntakeImagePreview] = useState<string | null>(null);
  const [intakeImageBase64, setIntakeImageBase64] = useState<string | null>(null);
  const [intakeMimeType, setIntakeMimeType] = useState("image/jpeg");
  const [intakeResult, setIntakeResult] = useState<any>(null);
  const [editedIntakeItems, setEditedIntakeItems] = useState<any[]>([]);
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");

  const { data: rawInventory = [], refetch } = useListInventory({ query: { queryKey: getListInventoryQueryKey() } });
  const inventory = rawInventory as InventoryItem[];

  const createItem = useCreateInventoryItem({
    mutation: {
      onSuccess: () => { refetch(); setShowAddForm(false); setAddForm({ itemName: "", category: "food", replenishmentCycle: "weekly", notes: "" }); toast({ title: "Item added." }); },
      onError: () => toast({ title: "Failed to add item", variant: "destructive" }),
    }
  });
  const restockItem = useRestockInventoryItem({
    mutation: {
      onSuccess: () => { refetch(); toast({ title: "Marked as restocked." }); },
      onError: () => toast({ title: "Restock failed", variant: "destructive" }),
    }
  });

  const today = new Date().toISOString().split("T")[0];

  const grouped: Record<"weekly" | "monthly" | "quarterly" | "yearly", InventoryItem[]> = {
    weekly: inventory.filter((i) => i.replenishmentCycle === "weekly"),
    monthly: inventory.filter((i) => i.replenishmentCycle === "monthly"),
    quarterly: inventory.filter((i) => i.replenishmentCycle === "quarterly"),
    yearly: inventory.filter((i) => i.replenishmentCycle === "yearly"),
  };

  const isOverdue = (item: InventoryItem) =>
    !!(item.estimatedRunOutDate && item.estimatedRunOutDate < today);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setIntakeImageBase64(dataUrl.split(",")[1]);
      setIntakeImagePreview(dataUrl);
      setIntakeMimeType(file.type || "image/jpeg");
      setIntakeResult(null);
    };
    reader.readAsDataURL(file);
  };

  const handleIntakeAnalyze = async () => {
    if (!intakeImageBase64) return;
    setIntakeLoading(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/intake/image`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: intakeImageBase64, mimeType: intakeMimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Intake failed");
      setIntakeResult(data);
      setEditedIntakeItems((data.items_detected ?? []).map((item: any) => ({ ...item })));
    } catch (err: any) {
      toast({ title: "Intake failed", description: err.message, variant: "destructive" });
    } finally {
      setIntakeLoading(false);
    }
  };

  const handleVoiceDictation = async () => {
    if (!voiceNote.trim()) return;
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/assistant`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: voiceNote }],
          context: `You are helping Raymo update a household inventory list. If the message mentions needing to buy or restock an item, extract the item name and respond with the exact string ADD_INVENTORY_ITEM followed by valid JSON on the same line like: ADD_INVENTORY_ITEM:{"itemName":"...","category":"food","replenishmentCycle":"weekly"}. Otherwise just acknowledge what you heard. Categories: food, paper, toiletry, cleaning, medical. Cycles: weekly, monthly, quarterly, yearly.`,
        }),
      });
      const data = await res.json();
      const reply: string = data?.reply ?? "";
      const match = reply.match(/ADD_INVENTORY_ITEM:(\{[^\n]+\})/);
      if (match) {
        try {
          const item = JSON.parse(match[1]);
          createItem.mutate({ data: item });
          toast({ title: "Item added from voice note", description: item.itemName });
        } catch {
          toast({ title: "Heard you", description: reply.slice(0, 120) });
        }
      } else {
        toast({ title: "Jessica heard you", description: reply.slice(0, 120) });
      }
    } catch {
      toast({ title: "Voice note failed", variant: "destructive" });
    }
    setVoiceNote("");
  };

  const CAT_ICON: Record<string, string> = { food: "🛒", paper: "📦", toiletry: "🧴", cleaning: "🧹", medical: "💊" };
  const CYCLE_COLOR: Record<string, string> = {
    weekly: "text-primary border-primary/40",
    monthly: "text-success border-success/40",
    quarterly: "text-primary/70 border-primary/30",
    yearly: "text-accent border-accent/40",
  };
  const CYCLE_LABEL: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };

  const renderGroup = (cycle: keyof typeof grouped) => {
    const group = grouped[cycle];
    if (group.length === 0) return null;
    const overdueCount = group.filter(isOverdue).length;
    return (
      <Card key={cycle}>
        <CardHeader className="pb-3">
          <CardTitle className={`text-sm font-display uppercase tracking-widest flex items-center gap-2 ${CYCLE_COLOR[cycle]}`}>
            <Archive size={14} /> {CYCLE_LABEL[cycle]}
            {overdueCount > 0 && (
              <span className="ml-auto px-2 py-0.5 rounded-sm bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold">
                {overdueCount} overdue
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {group.map((item) => {
              const overdue = isOverdue(item);
              const isPepsi = !!(item.notes?.includes("PEPSI FACTOR"));
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-2.5 rounded-sm border transition-colors ${
                    isPepsi ? "border-primary bg-primary/10" :
                    overdue ? "border-destructive/40 bg-destructive/5" :
                    "border-border/40 bg-secondary/20"
                  }`}
                >
                  <span className="text-base shrink-0">{CAT_ICON[item.category] ?? "📦"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${isPepsi ? "text-primary" : ""}`}>{item.itemName}</span>
                      {isPepsi && <span className="text-[10px] font-bold text-primary uppercase border border-primary/50 bg-primary/10 px-1.5 py-0.5 rounded-sm">⚠ critical</span>}
                      {overdue && !isPepsi && <span className="text-xs text-destructive font-bold">overdue</span>}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      {item.lastRestockedDate && <span>Restocked: {item.lastRestockedDate}</span>}
                      {item.estimatedRunOutDate && (
                        <span className={overdue ? "text-destructive font-semibold" : ""}>
                          Runs out: {item.estimatedRunOutDate}
                        </span>
                      )}
                    </div>
                    {isPepsi && <p className="text-xs text-primary/70 mt-0.5 italic">{item.notes}</p>}
                  </div>
                  <button
                    onClick={() => restockItem.mutate({ id: item.id })}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-sm border border-green-500/40 text-green-400 text-xs hover:bg-green-500/10 transition-colors"
                  >
                    <Check size={10} /> Restocked
                  </button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <header className="mb-6 border-b border-border/50 pb-4 flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Inventory</h2>
          <p className="text-sm text-muted-foreground mt-1">Household supply tracking by replenishment cycle</p>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={14} className="mr-1" /> Add Item
        </Button>
      </header>

      {showAddForm && (
        <Card className="border-primary/40">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Item Name</label>
                <Input value={addForm.itemName} onChange={(e) => setAddForm({ ...addForm, itemName: e.target.value })} placeholder="e.g. Milk (1 gallon)" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Category</label>
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                  className="flex h-9 w-full rounded-sm border border-border bg-input px-3 text-sm text-foreground"
                >
                  <option value="food">🛒 Food</option>
                  <option value="paper">📦 Paper</option>
                  <option value="toiletry">🧴 Toiletry</option>
                  <option value="cleaning">🧹 Cleaning</option>
                  <option value="medical">💊 Medical</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Cycle</label>
                <select
                  value={addForm.replenishmentCycle}
                  onChange={(e) => setAddForm({ ...addForm, replenishmentCycle: e.target.value })}
                  className="flex h-9 w-full rounded-sm border border-border bg-input px-3 text-sm text-foreground"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Notes (optional)</label>
                <Input value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} placeholder="Optional notes..." />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => createItem.mutate({ data: addForm })} disabled={!addForm.itemName.trim() || createItem.isPending}>
                Add Item
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(["weekly", "monthly", "quarterly", "yearly"] as const).map(renderGroup)}

      {/* Phone Intake */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Scan size={16} className="text-primary" /> Phone Intake
          </CardTitle>
          <CardDescription className="text-xs">Upload a fridge/pantry photo or grocery receipt — Gemini Vision extracts items automatically</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-sm border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
              <Image size={14} />
              {intakeImagePreview ? "Change Photo" : "Upload Photo"}
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
            {intakeImagePreview && (
              <>
                <img src={intakeImagePreview} alt="Intake preview" className="h-14 w-14 object-cover rounded-sm border border-border" />
                <Button size="sm" onClick={handleIntakeAnalyze} disabled={intakeLoading}>
                  {intakeLoading ? <RefreshCw size={14} className="animate-spin mr-1" /> : <Sparkles size={14} className="mr-1" />}
                  Analyze with Gemini
                </Button>
              </>
            )}
          </div>

          {intakeResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <p className="text-xs text-muted-foreground italic">{intakeResult.summary}</p>
                <span className="text-xs font-bold text-muted-foreground uppercase">{intakeResult.source_type}</span>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Edit items before adding</p>
                {editedIntakeItems.map((item: any, i: number) => (
                  <div key={i} className="p-3 bg-secondary/20 rounded-sm border border-border/30 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Name</label>
                        <Input
                          value={item.name}
                          onChange={(e) => { const next = [...editedIntakeItems]; next[i] = { ...next[i], name: e.target.value }; setEditedIntakeItems(next); }}
                          className="h-7 text-sm mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Qty</label>
                        <Input
                          value={item.quantity}
                          onChange={(e) => { const next = [...editedIntakeItems]; next[i] = { ...next[i], quantity: e.target.value }; setEditedIntakeItems(next); }}
                          className="h-7 text-sm mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Price</label>
                        <Input
                          type="number"
                          value={item.price_per_unit ?? ""}
                          onChange={(e) => { const next = [...editedIntakeItems]; next[i] = { ...next[i], price_per_unit: parseFloat(e.target.value) || null }; setEditedIntakeItems(next); }}
                          className="h-7 text-sm mt-0.5"
                          placeholder="$0.00"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Category</label>
                        <select
                          value={item.category ?? "food"}
                          onChange={(e) => { const next = [...editedIntakeItems]; next[i] = { ...next[i], category: e.target.value }; setEditedIntakeItems(next); }}
                          className="flex h-7 w-full rounded-sm border border-border bg-input px-2 text-xs text-foreground mt-0.5"
                        >
                          <option value="food">Food</option>
                          <option value="paper">Paper</option>
                          <option value="toiletry">Toiletry</option>
                          <option value="cleaning">Cleaning</option>
                          <option value="medical">Medical</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Cycle</label>
                        <select
                          value={item.replenishment_cycle ?? "monthly"}
                          onChange={(e) => { const next = [...editedIntakeItems]; next[i] = { ...next[i], replenishment_cycle: e.target.value }; setEditedIntakeItems(next); }}
                          className="flex h-7 w-full rounded-sm border border-border bg-input px-2 text-xs text-foreground mt-0.5"
                        >
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      {item.needs_restock && <span className="text-xs text-accent font-bold">needs restock</span>}
                      <div className="flex gap-2 ml-auto">
                        <button
                          onClick={() => setEditedIntakeItems(editedIntakeItems.filter((_, j) => j !== i))}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Remove
                        </button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => createItem.mutate({ data: {
                            itemName: item.name,
                            category: item.category ?? "food",
                            replenishmentCycle: item.replenishment_cycle ?? "monthly",
                            notes: `Intake: qty ${item.quantity}${item.price_per_unit != null ? `, ~$${Number(item.price_per_unit).toFixed(2)}` : ""}`,
                          }})}
                          disabled={createItem.isPending || !item.name?.trim()}
                        >
                          <Plus size={10} className="mr-1" /> Add to Inventory
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-border/30">
            <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-2">Voice / Text Note</p>
            <div className="flex gap-2">
              <Input
                value={voiceNote}
                onChange={(e) => setVoiceNote(e.target.value)}
                placeholder="Jessica, we need taco seasoning and paper towels..."
                className="flex-1 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") handleVoiceDictation(); }}
              />
              <Button size="sm" onClick={handleVoiceDictation} disabled={!voiceNote.trim()}>
                <Send size={14} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/60 mt-1">Jessica parses your note and automatically adds items to the inventory list.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DevicesTab() {
  const [devices, setDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [actionLogs, setActionLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logTypeFilter, setLogTypeFilter] = useState<string>("");

  const fetchDevices = async () => {
    setDevicesLoading(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/smarthome/devices`);
      if (res.ok) setDevices(await res.json());
    } catch {} finally {
      setDevicesLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const url = logTypeFilter
        ? `${WORKSPACE_BASE}/api/actions/log?limit=50&type=${encodeURIComponent(logTypeFilter)}`
        : `${WORKSPACE_BASE}/api/actions/log?limit=50`;
      const res = await fetch(url);
      if (res.ok) setActionLogs(await res.json());
    } catch {} finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => { fetchDevices(); fetchLogs(); }, []);
  useEffect(() => { fetchLogs(); }, [logTypeFilter]);

  const toggleDevice = async (deviceKey: string, currentIsOn: boolean) => {
    setDevices((prev) => prev.map((d) => d.deviceKey === deviceKey ? { ...d, isOn: !currentIsOn } : d));
    setToggling((prev) => new Set([...prev, deviceKey]));
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/smarthome/devices/${deviceKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOn: !currentIsOn }),
      });
      if (!res.ok) throw new Error("Failed");
      fetchLogs();
    } catch {
      setDevices((prev) => prev.map((d) => d.deviceKey === deviceKey ? { ...d, isOn: currentIsOn } : d));
    } finally {
      setToggling((prev) => { const next = new Set(prev); next.delete(deviceKey); return next; });
    }
  };

  const getDeviceIcon = (deviceKey: string, type: string) => {
    if (type === "light" || deviceKey.includes("light")) return <Lightbulb size={22} />;
    if (type === "echo" || deviceKey.includes("echo")) return <Zap size={22} />;
    if (type === "sonos" || deviceKey.includes("sonos")) return <Volume2 size={22} />;
    return <CircleDot size={22} />;
  };

  const LOG_TYPE_OPTIONS = [
    "", "QUICK_ACTION", "TOGGLE_SMART_DEVICE", "ADD_EVENT", "ADD_TASK",
    "GROCERY_ORDER", "ADD_MEAL_TO_CART", "APPROVE_CART", "CANCEL_CART",
    "SCHEDULE_APPOINTMENT", "MED_CONFIRMED", "MED_REFUSED", "WELLBEING_ALERT", "COMMAND",
  ];
  const LOG_TYPE_LABELS: Record<string, string> = {
    "": "All Types", QUICK_ACTION: "Quick Action", TOGGLE_SMART_DEVICE: "Device Toggle",
    ADD_EVENT: "Event Added", ADD_TASK: "Task Added", GROCERY_ORDER: "Grocery Order",
    ADD_MEAL_TO_CART: "Meal Added", APPROVE_CART: "Cart Approved", CANCEL_CART: "Cart Cancelled",
    SCHEDULE_APPOINTMENT: "Appointment", MED_CONFIRMED: "Med Confirmed", MED_REFUSED: "Med Refused",
    WELLBEING_ALERT: "Wellbeing Alert", COMMAND: "Command",
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-border/50 pb-4">
        <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Devices</h2>
        <p className="text-muted-foreground text-sm mt-1">Smart home control grid and Jessica action dispatch history.</p>
      </header>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-display text-muted-foreground uppercase tracking-widest">Smart Home Grid</h3>
          <button
            onClick={fetchDevices}
            disabled={devicesLoading}
            className="flex items-center gap-1.5 text-xs font-display uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw size={12} className={devicesLoading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        {devicesLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm italic">
            <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Loading devices…
          </div>
        ) : devices.length === 0 ? (
          <p className="text-muted-foreground italic text-sm">No devices found. Devices are auto-seeded on first API call.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {devices.map((device) => {
              const isToggling = toggling.has(device.deviceKey);
              return (
                <button
                  key={device.deviceKey}
                  onClick={() => !isToggling && toggleDevice(device.deviceKey, device.isOn)}
                  disabled={isToggling}
                  className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-sm border text-center transition-all duration-150 ${
                    device.isOn
                      ? "bg-primary/10 border-primary/40 text-primary shadow-[0_0_16px_rgba(70,159,104,0.1)]"
                      : "bg-secondary/40 border-border text-muted-foreground"
                  } hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-wait`}
                >
                  <div className={device.isOn ? "text-primary" : "text-muted-foreground/50"}>
                    {getDeviceIcon(device.deviceKey, device.type)}
                  </div>
                  <div>
                    <p className="text-xs font-display uppercase tracking-widest leading-tight">{device.name}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{device.room}</p>
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${device.isOn ? "text-primary" : "text-muted-foreground/40"}`}>
                    {device.isOn ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    {device.isOn ? "On" : "Off"}
                  </div>
                  {device.volume !== null && device.volume !== undefined && (
                    <p className="text-[9px] text-muted-foreground/40 font-display uppercase tracking-widest">Vol {device.volume}</p>
                  )}
                  {isToggling && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-sm">
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-display text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <History size={14} /> Action History <span className="text-muted-foreground/40 font-normal normal-case tracking-normal">— last 50</span>
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={logTypeFilter}
              onChange={(e) => setLogTypeFilter(e.target.value)}
              className="text-xs font-display uppercase tracking-widest border border-border rounded-sm px-2 py-1 bg-background text-muted-foreground focus:outline-none"
            >
              {LOG_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{LOG_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
            <button
              onClick={fetchLogs}
              disabled={logsLoading}
              className="flex items-center gap-1 text-xs font-display uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw size={12} className={logsLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        {logsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm italic">
            <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Loading…
          </div>
        ) : actionLogs.length === 0 ? (
          <p className="text-muted-foreground italic text-sm">
            No dispatches recorded yet. Actions appear here when Jessica or Quick Actions send commands.
          </p>
        ) : (
          <div className="border border-border rounded-sm overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 px-4 py-2 bg-secondary/40 text-xs font-display uppercase tracking-widest text-muted-foreground border-b border-border/50">
              <span>Time</span><span>Action</span><span>Status</span>
            </div>
            <div className="divide-y divide-border/30 max-h-96 overflow-y-auto">
              {actionLogs.map((log) => (
                <div key={log.id} className="grid grid-cols-[auto_1fr_auto] gap-x-4 px-4 py-2.5 text-xs hover:bg-secondary/20 items-center">
                  <span className="text-muted-foreground/70 font-display whitespace-nowrap tabular-nums">
                    {format(new Date(log.createdAt), "MMM d HH:mm")}
                  </span>
                  <div className="min-w-0">
                    <span className="font-display uppercase tracking-widest text-foreground/80 text-[11px]">
                      {(LOG_TYPE_LABELS[log.type] ?? log.type.replace(/_/g, " "))}
                    </span>
                    {log.payload?.device && (
                      <span className="ml-1.5 text-muted-foreground/50 text-[10px]">
                        · {String(log.payload.device).replace(/_/g, " ")}
                      </span>
                    )}
                    {log.payload?.label && (
                      <span className="ml-1.5 text-muted-foreground/50 text-[10px]">· {log.payload.label}</span>
                    )}
                  </div>
                  <span className={`font-display text-[10px] uppercase tracking-widest whitespace-nowrap ${log.result?.ok === false ? "text-destructive" : "text-success"}`}>
                    {log.result?.ok === false ? "✕ err" : "✓ ok"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RotationTab() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<"all" | "morning" | "afternoon" | "night">("all");
  const [hourlyOnly, setHourlyOnly] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", period: "morning" as "morning" | "afternoon" | "night", timeSlot: "9:00 AM", category: "Physical Rotation", isHourly: false });
  const [showSummary, setShowSummary] = useState(false);
  const [summaryMarkdown, setSummaryMarkdown] = useState("");
  const [summaryDate, setSummaryDate] = useState("");
  const [inlineNotes, setInlineNotes] = useState<Record<number, string>>({});

  const { data: tasks = [], refetch: refetchTasks } = useListRotationTasks({ query: { queryKey: getListRotationTasksQueryKey() } });
  const { data: logs = [] } = useListCareLogs({ query: { queryKey: getListCareLogsQueryKey() } });
  const { data: haldolData } = useGetHaldolCycle();

  const createTask = useCreateRotationTask();
  const updateTask = useUpdateRotationTask();
  const deleteTask = useDeleteRotationTask();
  const generateSummary = useGenerateClinicalSummary();
  const [calSyncing, setCalSyncing] = useState<number | null>(null);
  const [driveExporting, setDriveExporting] = useState(false);

  const taskList = tasks as RotationTask[];
  const logList = logs as HistoricalCareLog[];

  const cycleDay = (() => {
    const lastDate = (haldolData as any)?.lastInjectionDate;
    if (!lastDate) return null;
    const diff = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
    return Math.max(1, Math.min(14, (diff % 14) + 1));
  })();

  const filtered = taskList.filter((t) => {
    if (period !== "all" && t.period !== period) return false;
    if (hourlyOnly && !t.isHourly) return false;
    return true;
  });

  const total = taskList.length;
  const done = taskList.filter((t) => t.status === "done").length;
  const hourlyTotal = taskList.filter((t) => t.isHourly).length;
  const hourlyDone = taskList.filter((t) => t.isHourly && t.status === "done").length;
  const completePct = total > 0 ? Math.round((done / total) * 100) : 0;
  const hourlyPct = hourlyTotal > 0 ? Math.round((hourlyDone / hourlyTotal) * 100) : 0;

  const handleToggleTask = (t: RotationTask) => {
    updateTask.mutate({ id: t.id, data: { status: t.status === "done" ? "pending" : "done" } }, { onSuccess: () => refetchTasks() });
  };

  const handleMedResponse = (t: RotationTask, response: string) => {
    updateTask.mutate({ id: t.id, data: { medResponse: t.medResponse === response ? null : response } }, { onSuccess: () => refetchTasks() });
  };

  const handleSaveNote = (t: RotationTask) => {
    const note = inlineNotes[t.id] !== undefined ? inlineNotes[t.id] : (t.loggedNote ?? "");
    updateTask.mutate({ id: t.id, data: { loggedNote: note.trim() || null } }, { onSuccess: () => refetchTasks() });
  };

  const handleAddTask = () => {
    if (!newTask.title.trim()) return;
    createTask.mutate({ data: { title: newTask.title.trim(), period: newTask.period, timeSlot: newTask.timeSlot, isHourly: newTask.isHourly, category: newTask.category } }, {
      onSuccess: () => {
        refetchTasks();
        setShowAddTask(false);
        setNewTask({ title: "", period: "morning", timeSlot: "9:00 AM", category: "Physical Rotation", isHourly: false });
      },
    });
  };

  const handleSyncCal = async (t: RotationTask) => {
    let token = getGoogleToken();
    if (!token) token = promptGoogleToken(toast);
    if (!token) return;
    setCalSyncing(t.id);
    const result = await pushToCalendar(token, {
      summary: `[Pops] ${t.title}`,
      description: makeRotationTaskDescription(t),
      startTime: todayAtTime(t.timeSlot),
    });
    setCalSyncing(null);
    if (result.success) {
      toast({ title: "Synced to Calendar!", description: "Event added to Google Calendar." });
    } else {
      handleCalendarError(result.error ?? "Unknown error", toast);
    }
  };

  const handleExportSummaryToDrive = async () => {
    let token = getGoogleToken();
    if (!token) token = promptGoogleToken(toast);
    if (!token) return;
    setDriveExporting(true);
    try {
      const filename = `clinical-summary-${new Date().toISOString().split("T")[0]}.txt`;
      const res = await fetch(`${WORKSPACE_BASE}/api/drive/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-google-access-token": token },
        body: JSON.stringify({ filename, content: summaryMarkdown, mimeType: "text/plain" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Drive export failed.");
      toast({ title: "Exported to Drive!", description: data.link ? `Saved as "${data.filename}"` : "File saved to Google Drive." });
    } catch (err: any) {
      const msg: string = err?.message ?? "Drive export failed.";
      if (msg.includes("denied") || msg.includes("access")) {
        toast({ title: "Google access denied", description: "Re-grant Drive permissions in your Google Account.", variant: "destructive" });
      } else {
        toast({ title: "Drive export failed", description: msg, variant: "destructive" });
      }
    } finally {
      setDriveExporting(false);
    }
  };

  const handleGenerateSummary = () => {
    generateSummary.mutate({ data: { tasks: taskList, logs: logList, patientName: "Pops", cycleDay } }, {
      onSuccess: (res: any) => {
        setSummaryMarkdown((res as any).markdown ?? "");
        setSummaryDate((res as any).generatedAt ?? "");
        setShowSummary(true);
      },
      onError: () => toast({ title: "Summary generation failed", variant: "destructive" }),
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(summaryMarkdown);
    toast({ title: "Copied to clipboard" });
  };

  const handleDownload = () => {
    const blob = new Blob([summaryMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clinical-summary-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="border-b border-border/50 pb-4 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Rotation</h2>
          <p className="text-muted-foreground text-sm">Caregiver task tracking, med response logging &amp; clinical summaries.</p>
          {cycleDay !== null && <p className="text-xs text-primary/70 mt-0.5">Haldol Cycle Day <span className="font-bold">{cycleDay}</span>/14</p>}
        </div>
        <Button onClick={handleGenerateSummary} disabled={generateSummary.isPending} size="sm" className="gap-2">
          {generateSummary.isPending ? <RefreshCw size={14} className="animate-spin" /> : <ClipboardList size={14} />}
          Clinical Summary
        </Button>
      </header>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-display mb-2">Overall Completion</p>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-3xl font-display font-bold text-primary">{completePct}%</span>
            <span className="text-xs text-muted-foreground mb-1">{done}/{total} tasks</span>
          </div>
          <div className="w-full h-2 rounded-full bg-secondary/50">
            <div className="h-2 rounded-full bg-primary transition-all duration-500" style={{ width: `${completePct}%` }} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-display mb-2">Rotation Compliance</p>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-3xl font-display font-bold text-accent">{hourlyPct}%</span>
            <span className="text-xs text-muted-foreground mb-1">{hourlyDone}/{hourlyTotal} repositions</span>
          </div>
          <div className="w-full h-2 rounded-full bg-secondary/50">
            <div className="h-2 rounded-full bg-accent transition-all duration-500" style={{ width: `${hourlyPct}%` }} />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {(["all", "morning", "afternoon", "night"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-display uppercase tracking-widest rounded-sm border transition-colors ${period === p ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {p}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={hourlyOnly} onChange={(e) => setHourlyOnly(e.target.checked)} className="accent-primary" />
          Hourly rotations only
        </label>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground/60 text-sm border border-dashed border-border/30 rounded-sm">
            No tasks match this filter.
          </div>
        )}
        {filtered.map((t) => {
          const emoji = ROTATION_CATEGORY_EMOJI[t.category] ?? "⚙️";
          const isDone = t.status === "done";
          return (
            <div key={t.id} className={`rounded-sm border transition-all ${isDone ? "border-success/25 bg-success/5 opacity-75" : "border-border bg-card"}`}>
              <div className="flex items-start gap-3 p-3">
                <button onClick={() => handleToggleTask(t)}
                  className={`mt-0.5 shrink-0 w-6 h-6 rounded-sm border flex items-center justify-center transition-colors ${isDone ? "bg-success/20 border-success/40 text-success" : "border-border hover:border-primary/40 hover:bg-primary/5"}`}>
                  {isDone && <Check size={11} />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {emoji} {t.title}
                    </span>
                    <span className="text-xs text-muted-foreground/60">{t.timeSlot}</span>
                    {t.isHourly && <Badge variant="outline" className="text-xs text-accent border-accent/30 py-0">↺ 2hr</Badge>}
                    <Badge variant="outline" className="text-xs text-muted-foreground/50 border-border/20 capitalize py-0">{t.period}</Badge>
                    <Badge variant="outline" className="text-xs text-muted-foreground/50 border-border/20 py-0">{t.category}</Badge>
                  </div>

                  {t.category === "Medication" && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {MED_RESPONSES.map((r) => (
                        <button key={r.key} onClick={() => handleMedResponse(t, r.key)}
                          className={`px-2 py-0.5 text-xs rounded-sm border transition-colors ${t.medResponse === r.key ? `${r.color} font-bold` : "border-border text-muted-foreground hover:border-border/60"}`}>
                          {r.emoji} {r.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-1 mt-2">
                    <Input
                      value={inlineNotes[t.id] !== undefined ? inlineNotes[t.id] : (t.loggedNote ?? "")}
                      onChange={(e) => setInlineNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                      placeholder="Clinical note..."
                      className="h-7 text-xs flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(t); }}
                    />
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => handleSaveNote(t)} title="Save note">
                      <Check size={11} />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => handleSyncCal(t)}
                    disabled={calSyncing === t.id}
                    title="Sync to Google Calendar"
                    className="flex items-center gap-1 px-2 py-1 rounded-sm border border-primary/20 text-primary/40 hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40 text-[10px] font-mono uppercase tracking-wide"
                  >
                    <CalendarPlus size={10} /> SYNC CAL
                  </button>
                  <button onClick={() => { if (confirm(`Delete "${t.title}"?`)) deleteTask.mutate({ id: t.id }, { onSuccess: () => refetchTasks() }); }}
                    className="p-1.5 rounded-sm border border-destructive/20 text-destructive/40 hover:border-destructive/50 hover:text-destructive transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add custom task */}
      {showAddTask ? (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-display uppercase tracking-widest">Add Custom Task</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <Input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="Task title..." className="text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={newTask.period} onChange={(e) => setNewTask({ ...newTask, period: e.target.value as any })}
                className="h-9 rounded-sm border border-border bg-background px-2 text-sm text-foreground">
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="night">Night</option>
              </select>
              <Input value={newTask.timeSlot} onChange={(e) => setNewTask({ ...newTask, timeSlot: e.target.value })} placeholder="e.g. 9:00 AM" className="text-sm" />
              <select value={newTask.category} onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                className="h-9 rounded-sm border border-border bg-background px-2 text-sm text-foreground col-span-2">
                <option>Medication</option>
                <option>Food Intake</option>
                <option>Physical Rotation</option>
                <option>Biometric Read</option>
                <option>Cognitive</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={newTask.isHourly} onChange={(e) => setNewTask({ ...newTask, isHourly: e.target.checked })} className="accent-primary" />
              Bi-hourly rotation task
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddTask} disabled={createTask.isPending || !newTask.title.trim()}>Add Task</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddTask(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowAddTask(true)} className="gap-2 w-full justify-center border-dashed">
          <Plus size={14} /> Add Custom Task
        </Button>
      )}

      {/* Historical Efficacy */}
      <div>
        <h3 className="text-sm font-display uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Activity size={14} /> Historical Efficacy
        </h3>
        {logList.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 text-center py-4 border border-dashed border-border/30 rounded-sm">No historical logs yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {logList.slice(0, 7).map((l) => (
              <div key={l.id} className="rounded-sm border border-border bg-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-display uppercase tracking-widest text-muted-foreground">{l.dateLabel}</span>
                  <span className={`text-xl font-bold font-display ${l.efficacyScore >= 8 ? "text-success" : l.efficacyScore >= 5 ? "text-accent" : "text-destructive"}`}>{l.efficacyScore}/10</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-muted-foreground"><span>Wants responded</span><span className="text-foreground">{l.wantsRespondedRate}%</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Med adherence</span><span className={l.medAdherence === 100 ? "text-success font-semibold" : "text-accent"}>{l.medAdherence}%</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Rotation complete</span><span className="text-foreground">{l.soreRotationComplete}%</span></div>
                </div>
                {l.generalNotes && <p className="text-xs text-muted-foreground/60 mt-2 italic leading-relaxed">{l.generalNotes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System AI Panel */}
      <SystemAIPanel tasks={taskList} logs={logList} />

      {/* Clinical Summary Modal */}
      <Modal isOpen={showSummary} onClose={() => setShowSummary(false)} title="Clinical Summary">
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-2" onClick={handleCopy}>
              <Copy size={12} /> Copy
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={handleDownload}>
              <Download size={12} /> Download .txt
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={handleExportSummaryToDrive} disabled={driveExporting}>
              <Cloud size={12} /> Export to Drive
            </Button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto rounded-sm border border-border bg-secondary/10 p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap text-foreground leading-relaxed">{summaryMarkdown || "Generating…"}</pre>
          </div>
          {summaryDate && <p className="text-xs text-muted-foreground/40">Generated: {new Date(summaryDate).toLocaleString()}</p>}
        </div>
      </Modal>
    </div>
  );
}

function CalendarSyncTab() {
  const { toast } = useToast();
  const { data: haldol } = useGetHaldolCycle();
  const { data: schedule } = useGetSchedule();
  const { data: cart } = useGetCart();
  const { data: tasks = [] } = useListRotationTasks({ query: { queryKey: getListRotationTasksQueryKey() } });

  const [selected, setSelected] = useState({
    medications: true,
    shopping: true,
    schedule: false,
    rotation: false,
  });
  const [pushing, setPushing] = useState(false);
  const [results, setResults] = useState<Array<{ label: string; ok: boolean; detail?: string }>>([]);

  const taskList = tasks as RotationTask[];
  const scheduleTasks = (schedule ?? []) as ScheduleTask[];

  const handlePushAll = async () => {
    let token = getGoogleToken();
    if (!token) token = promptGoogleToken(toast);
    if (!token) return;

    setPushing(true);
    setResults([]);
    const newResults: Array<{ label: string; ok: boolean; detail?: string }> = [];

    if (selected.medications && haldol?.nextInjectionDate) {
      const r = await pushToCalendar(token, {
        summary: "💊 Pops — Haldol Decanoate Injection",
        description: makeMedEventDescription({
          cycleDay: haldol.cycleDay ?? null,
          nextInjectionDate: haldol.nextInjectionDate,
          isZombiePhase: haldol.isZombiePhase ?? false,
          notes: haldol.notes,
        }),
        startTime: `${haldol.nextInjectionDate}T09:00:00`,
        allDay: false,
      });
      newResults.push({ label: `Haldol injection (${haldol.nextInjectionDate})`, ok: r.success, detail: r.error });
    }

    if (selected.shopping) {
      const items = (cart?.items ?? []) as any[];
      if (items.length > 0) {
        const weekStart = cart?.weekStartDate ?? new Date().toISOString().split("T")[0];
        const r = await pushToCalendar(token, {
          summary: `🛒 Grocery Run — Week of ${weekStart}`,
          description: makeShoppingEventDescription({
            weekStartDate: weekStart,
            items: items.map((it: any) => ({
              ingredientName: it.ingredientName,
              totalQuantity: it.totalQuantity,
              unit: it.unit,
              estimatedCostCents: it.estimatedCostCents,
            })),
            totalCostCents: cart?.totalEstimatedCostCents ?? 0,
            budgetCents: cart?.budgetCents ?? 15000,
          }),
          startTime: weekStart,
          allDay: true,
        });
        newResults.push({ label: `Shopping reminder (${weekStart})`, ok: r.success, detail: r.error });
      } else {
        newResults.push({ label: "Shopping reminder", ok: false, detail: "No items in current cart." });
      }
    }

    if (selected.schedule) {
      const pending = scheduleTasks.filter((t) => !t.isCompleted);
      for (const t of pending) {
        const quarterHours: Record<string, number> = { Q1: 8, Q2: 13, Q3: 18, Q4: 22 };
        const h = quarterHours[t.quarter] ?? 9;
        const today = new Date().toISOString().split("T")[0];
        const startIso = `${today}T${String(h).padStart(2, "0")}:00:00`;
        const r = await pushToCalendar(token, {
          summary: `[Schedule] ${t.title}`,
          description: t.description ?? `Quarter: ${t.quarter} · Time: ${t.timeLabel}`,
          startTime: startIso,
        });
        newResults.push({ label: `${t.quarter}: ${t.title}`, ok: r.success, detail: r.error });
      }
      if (pending.length === 0) {
        newResults.push({ label: "Schedule tasks", ok: false, detail: "No pending schedule tasks." });
      }
    }

    if (selected.rotation) {
      const pending = taskList.filter((t) => t.status !== "done");
      for (const t of pending) {
        const r = await pushToCalendar(token, {
          summary: `[Pops] ${t.title}`,
          description: makeRotationTaskDescription(t),
          startTime: todayAtTime(t.timeSlot),
        });
        newResults.push({ label: `${t.timeSlot} — ${t.title}`, ok: r.success, detail: r.error });
      }
      if (pending.length === 0) {
        newResults.push({ label: "Rotation tasks", ok: false, detail: "No pending rotation tasks." });
      }
    }

    setPushing(false);
    setResults(newResults);

    const okCount = newResults.filter((r) => r.ok).length;
    const failCount = newResults.length - okCount;
    if (okCount > 0 && failCount === 0) {
      toast({ title: `${okCount} event${okCount === 1 ? "" : "s"} pushed to Calendar!` });
    } else if (okCount > 0) {
      toast({ title: `${okCount} pushed, ${failCount} failed`, description: "Check results below.", variant: "destructive" });
    } else {
      toast({ title: "All events failed", description: "Check your Google token.", variant: "destructive" });
    }
  };

  const categoryCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <header className="border-b border-border/50 pb-4">
        <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Calendar Sync</h2>
        <p className="text-muted-foreground text-sm mt-1">Push all pending events to Ray's iOS Calendar via Google Calendar.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <CalendarPlus size={16} className="text-primary" /> Bulk Push Settings
          </CardTitle>
          <CardDescription className="text-xs">
            Select which categories to push. Events appear in Google Calendar within ~1 minute, then sync to iOS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: "medications", label: "💊 Medications", desc: "Next Haldol injection date" },
              { key: "shopping", label: "🛒 Shopping", desc: "Weekly grocery run (all-day reminder)" },
              { key: "schedule", label: "📋 Appointments", desc: "Pending schedule tasks by quarter" },
              { key: "rotation", label: "🔄 Rotation Tasks", desc: "Today's pending caregiver tasks" },
            ] as const).map(({ key, label, desc }) => (
              <button
                key={key}
                onClick={() => setSelected((s) => ({ ...s, [key]: !s[key] }))}
                className={`flex items-start gap-3 p-4 rounded-sm border text-left transition-colors ${
                  selected[key]
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "bg-secondary/20 border-border/30 text-muted-foreground hover:border-border"
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${selected[key] ? "bg-primary border-primary" : "border-border"}`}>
                  {selected[key] && <Check size={10} className="text-background" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-border/30 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {categoryCount === 0 ? "No categories selected" : `${categoryCount} categor${categoryCount === 1 ? "y" : "ies"} selected`}
              {" · "}
              <span className="text-primary/70">Token stored in browser • re-enter if expired</span>
            </p>
            <Button
              onClick={handlePushAll}
              disabled={pushing || categoryCount === 0}
              className="gap-2"
            >
              {pushing ? <RefreshCw size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
              {pushing ? "Pushing…" : "Push All to Calendar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-display uppercase tracking-widest text-muted-foreground">Push Results</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {results.map((r, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs p-2 rounded-sm ${r.ok ? "bg-success/10 border border-success/20 text-success" : "bg-destructive/10 border border-destructive/20 text-destructive"}`}>
                <span className="shrink-0">{r.ok ? "✓" : "✗"}</span>
                <span className="font-semibold">{r.label}</span>
                {!r.ok && r.detail && <span className="text-destructive/70 ml-1">— {r.detail}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/30 bg-secondary/10">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-display uppercase tracking-widest text-muted-foreground">How to get a Google Token</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 text-xs text-muted-foreground space-y-2">
          <p>1. Go to <span className="font-mono text-primary">developers.google.com/oauthplayground</span></p>
          <p>2. In Step 1, add scopes: <span className="font-mono text-primary/80">calendar.events</span> and <span className="font-mono text-primary/80">drive.file</span></p>
          <p>3. Authorize APIs with your Google account</p>
          <p>4. In Step 2, click "Exchange authorization code for tokens"</p>
          <p>5. Copy the <span className="font-mono text-primary/80">access_token</span> value</p>
          <p>6. Click "Push All to Calendar" and paste it when prompted</p>
          <p className="text-muted-foreground/50 pt-1">Tokens expire after ~1 hour. You'll be prompted again automatically.</p>
        </CardContent>
      </Card>
    </div>
  );
}

const CAL_KEYWORDS = /\b(appointment|injection|scheduled|reminder|due|clinic|cardiology|doctor|visit|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|tomorrow|today at|at \d+(:\d+)?\s*(am|pm)|low (stock|inventory)|out of|urgent|reorder)\b/i;

function SystemAIPanel({ tasks, logs }: { tasks: RotationTask[]; logs: HistoricalCareLog[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string; calSuggestion?: string }>>([]);
  const [input, setInput] = useState("");
  const [calPushingIdx, setCalPushingIdx] = useState<number | null>(null);
  const [quickCalForm, setQuickCalForm] = useState<{ idx: number; summary: string; date: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatAssistant = useChatWithAssistant();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const buildContext = () => {
    const doneCount = tasks.filter((t) => t.status === "done").length;
    const total = tasks.length;
    const meds = tasks.filter((t) => t.category === "Medication" && t.status === "done").length;
    const rotations = tasks.filter((t) => t.isHourly && t.status === "done").length;
    const totalRotations = tasks.filter((t) => t.isHourly).length;
    const recentLogs = logs.slice(0, 3).map((l) => `${l.dateLabel}: ${l.efficacyScore}/10`).join(", ");
    return `Shift: ${doneCount}/${total} tasks done, ${meds} meds completed, ${rotations}/${totalRotations} repositions done. Recent efficacy: ${recentLogs || "none"}.`;
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg = { role: "user" as const, content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");

    chatAssistant.mutate({ data: { messages: nextMessages, context: buildContext() } }, {
      onSuccess: (res: any) => {
        const reply: string = (res as any).reply ?? "…";
        const isCalWorthy = CAL_KEYWORDS.test(reply) || CAL_KEYWORDS.test(text);
        const msgIdx = nextMessages.length;
        setMessages((prev) => [
          ...prev,
          { role: "assistant" as const, content: reply, calSuggestion: isCalWorthy ? reply : undefined },
        ]);
        if (isCalWorthy) {
          const extractedTitle = extractCalendarTitle(`${text} ${reply}`);
          setQuickCalForm({
            idx: msgIdx,
            summary: extractedTitle,
            date: new Date().toISOString().split("T")[0],
          });
        }
      },
      onError: () => {
        toast({ title: "AI response failed", variant: "destructive" });
        setMessages((prev) => [...prev, { role: "assistant" as const, content: "I couldn't connect. Please try again." }]);
      },
    });
  };

  const handleCalPush = async (idx: number) => {
    if (!quickCalForm || quickCalForm.idx !== idx) return;
    let token = getGoogleToken();
    if (!token) token = promptGoogleToken(toast);
    if (!token) return;
    setCalPushingIdx(idx);
    const result = await pushToCalendar(
      token,
      {
        summary: quickCalForm.summary || "Reminder from br(AI)n",
        description: `Created by System AI from conversation.\n\n${messages[idx]?.content ?? ""}`,
        startTime: `${quickCalForm.date}T09:00:00`,
        allDay: false,
      },
      "appointment"
    );
    setCalPushingIdx(null);
    setQuickCalForm(null);
    if (result.success) {
      toast({ title: "Event pushed to Calendar!", description: "Check Google Calendar — it'll sync to iOS within 1 minute." });
    } else {
      handleCalendarError(result.error ?? "Unknown error", toast);
    }
  };

  return (
    <div className="rounded-sm border border-border/50 bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors text-left">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <span className="text-sm font-display uppercase tracking-widest">System AI</span>
          <span className="text-xs text-muted-foreground/60">— br(AI)n care assistant · calendar-aware</span>
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/30">
          <div ref={scrollRef} className="h-72 overflow-y-auto p-4 space-y-3 bg-secondary/10">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground/60 text-center py-4">
                Ask about care patterns, appointments, or say "Pops has a cardiology visit Friday" — Jessica will offer to push it to Calendar.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-sm text-xs leading-relaxed ${m.role === "user" ? "bg-primary/15 text-foreground border border-primary/20" : "bg-secondary/40 text-foreground border border-border/30"}`}>
                  {m.role === "assistant" && <span className="font-display text-primary/70 text-xs uppercase tracking-widest block mb-1">System AI</span>}
                  {m.content}
                </div>
                {m.role === "assistant" && m.calSuggestion && quickCalForm?.idx === i && (
                  <div className="max-w-[85%] mt-1.5">
                    <div className="flex flex-col gap-1.5 p-2.5 bg-primary/5 border border-primary/25 rounded-sm">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <CalendarPlus size={11} className="text-primary/70" />
                        <p className="text-[10px] font-display uppercase tracking-widest text-primary/70">Push to Calendar</p>
                        <span className="text-[10px] text-muted-foreground/60 ml-auto">auto-detected · 30-min alert</span>
                      </div>
                      <input
                        type="text"
                        value={quickCalForm.summary}
                        onChange={(e) => setQuickCalForm({ ...quickCalForm, summary: e.target.value })}
                        placeholder="Event title..."
                        className="bg-background border border-border rounded-sm px-2 py-1 text-xs text-foreground w-full"
                      />
                      <input
                        type="date"
                        value={quickCalForm.date}
                        onChange={(e) => setQuickCalForm({ ...quickCalForm, date: e.target.value })}
                        className="bg-background border border-border rounded-sm px-2 py-1 text-xs text-foreground w-full"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleCalPush(i)}
                          disabled={calPushingIdx === i}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-primary/20 border border-primary/40 text-primary text-xs rounded-sm hover:bg-primary/30 transition-colors disabled:opacity-50"
                        >
                          {calPushingIdx === i ? <RefreshCw size={9} className="animate-spin" /> : <CalendarPlus size={9} />}
                          {calPushingIdx === i ? "Pushing…" : "Push"}
                        </button>
                        <button
                          onClick={() => setQuickCalForm(null)}
                          className="px-2 py-1 text-muted-foreground text-xs border border-border rounded-sm hover:bg-secondary"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {chatAssistant.isPending && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-sm bg-secondary/40 border border-border/30 text-xs text-muted-foreground">
                  <RefreshCw size={10} className="inline animate-spin mr-1" /> Thinking…
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 p-3 border-t border-border/30">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask the br(AI)n assistant..."
              className="text-xs flex-1"
              disabled={chatAssistant.isPending}
            />
            <Button size="sm" onClick={handleSend} disabled={chatAssistant.isPending || !input.trim()} className="shrink-0">
              <Send size={13} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MedicationReconciliationLog() {
  const { toast } = useToast();
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    adjustmentDate: new Date().toISOString().split("T")[0],
    medication: "Haldol Decanoate",
    previousDose: "",
    newDose: "",
    reason: "",
    loggedBy: "Ray",
    cycleResetDate: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/haldol/adjustments`);
      if (res.ok) setAdjustments(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/haldol/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: "Adjustment logged", description: form.cycleResetDate ? "Cycle reset to new injection date." : "Recorded without cycle reset." });
      setForm({ adjustmentDate: new Date().toISOString().split("T")[0], medication: "Haldol Decanoate", previousDose: "", newDose: "", reason: "", loggedBy: "Ray", cycleResetDate: "" });
      setShowForm(false);
      load();
    } catch {
      toast({ title: "Failed to log adjustment", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
              <Syringe size={14} /> Medication Reconciliation Log
            </CardTitle>
            <CardDescription>Track dose changes and their clinical rationale.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="gap-1.5">
            <Plus size={14} /> Log Adjustment
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleSave} className="space-y-3 p-4 bg-secondary/20 rounded-sm border border-border/40">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Date</label>
                <Input type="date" value={form.adjustmentDate} onChange={(e) => setForm({ ...form, adjustmentDate: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Medication</label>
                <Input value={form.medication} onChange={(e) => setForm({ ...form, medication: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Previous Dose</label>
                <Input value={form.previousDose} onChange={(e) => setForm({ ...form, previousDose: e.target.value })} placeholder="e.g. 100mg" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">New Dose *</label>
                <Input value={form.newDose} onChange={(e) => setForm({ ...form, newDose: e.target.value })} placeholder="e.g. 150mg" required />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-muted-foreground">Reason / Clinical Notes</label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Increased hallucinations, psychiatrist ordered increase" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Logged By</label>
                <Input value={form.loggedBy} onChange={(e) => setForm({ ...form, loggedBy: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Cycle Reset Date (optional)</label>
                <Input type="date" value={form.cycleResetDate} onChange={(e) => setForm({ ...form, cycleResetDate: e.target.value })} />
                <p className="text-[10px] text-muted-foreground">If filled, resets the Haldol cycle counter to this injection date.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Log Adjustment"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
        ) : adjustments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4 italic">No medication adjustments recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-2 font-bold uppercase tracking-widest text-muted-foreground pr-4">Date</th>
                  <th className="text-left py-2 font-bold uppercase tracking-widest text-muted-foreground pr-4">Medication</th>
                  <th className="text-left py-2 font-bold uppercase tracking-widest text-muted-foreground pr-4">Dose Change</th>
                  <th className="text-left py-2 font-bold uppercase tracking-widest text-muted-foreground pr-4">Reason</th>
                  <th className="text-left py-2 font-bold uppercase tracking-widest text-muted-foreground">By</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a: any) => (
                  <tr key={a.id} className="border-b border-border/20 hover:bg-secondary/20">
                    <td className="py-2 pr-4 text-foreground/80">{a.adjustmentDate}</td>
                    <td className="py-2 pr-4 font-semibold">{a.medication}</td>
                    <td className="py-2 pr-4">
                      <span className="text-muted-foreground">{a.previousDose ?? "?"}</span>
                      <span className="mx-1.5 text-muted-foreground/40">→</span>
                      <span className="text-primary font-bold">{a.newDose}</span>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground max-w-[200px] truncate">{a.reason ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">{a.loggedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AppointmentsTab() {
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const emptyForm = { appointmentDate: "", appointmentTime: "09:00", provider: "", location: "", type: "primary_care", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/appointments`);
      if (res.ok) setAppointments(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `${WORKSPACE_BASE}/api/appointments/${editingId}` : `${WORKSPACE_BASE}/api/appointments`;
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: editingId ? "Appointment updated" : "Appointment added" });
      setForm(emptyForm);
      setShowForm(false);
      setEditingId(null);
      load();
    } catch {
      toast({ title: "Failed to save appointment", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${WORKSPACE_BASE}/api/appointments/${id}`, { method: "DELETE" });
      toast({ title: "Appointment removed" });
      load();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleEdit = (appt: any) => {
    setForm({ appointmentDate: appt.appointmentDate, appointmentTime: appt.appointmentTime, provider: appt.provider, location: appt.location ?? "", type: appt.type, notes: appt.notes ?? "" });
    setEditingId(appt.id);
    setShowForm(true);
  };

  const handleExportReport = async () => {
    setReportLoading(true);
    setReport(null);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/reports/clinical`);
      const data = await res.json();
      setReport(data.report);
    } catch {
      toast({ title: "Failed to generate report", variant: "destructive" });
    } finally { setReportLoading(false); }
  };

  const handleDownloadReport = () => {
    if (!report) return;
    const blob = new Blob([report], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clinical-report-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
  };

  const TYPE_LABELS: Record<string, string> = {
    primary_care: "Primary Care",
    psychiatry: "Psychiatry",
    cardiology: "Cardiology",
    neurology: "Neurology",
    va_appointment: "VA Appointment",
    lab_work: "Lab Work",
    other: "Other",
  };

  return (
    <div className="space-y-6">
      <header className="mb-8 border-b border-border/50 pb-4 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Appointments</h2>
          <p className="text-muted-foreground">Manage doctor and clinic visits for Pops.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleExportReport} disabled={reportLoading} className="gap-2">
            <FileText size={14} /> {reportLoading ? "Generating…" : "Export Doctor Report"}
          </Button>
          <Button size="sm" onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(!showForm); }} className="gap-2">
            <Plus size={14} /> Add Appointment
          </Button>
        </div>
      </header>

      {showForm && (
        <Card className="border-primary/30 bg-primary/3">
          <CardHeader>
            <CardTitle className="text-sm font-display uppercase tracking-widest">{editingId ? "Edit Appointment" : "New Appointment"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Date *</label>
                  <Input type="date" value={form.appointmentDate} onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Time</label>
                  <Input type="time" value={form.appointmentTime} onChange={(e) => setForm({ ...form, appointmentTime: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Provider *</label>
                  <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="Dr. Smith / VA Clinic" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="flex h-9 w-full rounded-sm border border-border bg-input px-3 py-1 text-sm"
                  >
                    {Object.entries(TYPE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Location</label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Address or clinic name" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="flex min-h-[80px] w-full rounded-sm border border-border bg-input px-3 py-2 text-sm"
                  placeholder="Pre-visit prep, follow-up needed, questions to ask…"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Update" : "Save Appointment"}</Button>
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Doctor Report */}
      {report && (
        <Card className="border-success/30 bg-success/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
                <FileText size={14} className="text-success" /> Clinical Digest — Ready
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleDownloadReport} className="gap-1.5 text-xs">
                  <Download size={12} /> Download .txt
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReport(null)} className="h-7 w-7 p-0">
                  <X size={12} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono bg-secondary/20 p-4 rounded-sm border border-border/30 max-h-96 overflow-y-auto">{report}</pre>
          </CardContent>
        </Card>
      )}

      {/* Appointments List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Stethoscope size={14} /> Upcoming & Recent Visits
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 italic">No appointments on record. Add one above.</p>
          ) : (
            <div className="space-y-3">
              {appointments.map((a: any) => {
                const isPast = a.appointmentDate < new Date().toISOString().split("T")[0];
                return (
                  <div key={a.id} className={`flex items-start justify-between gap-4 p-4 rounded-sm border transition-colors ${isPast ? "border-border/20 bg-secondary/10 opacity-70" : "border-primary/20 bg-primary/3"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{a.appointmentDate}</span>
                        <span className="text-muted-foreground text-xs">{a.appointmentTime}</span>
                        <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase bg-primary/10 border border-primary/20 text-primary">{TYPE_LABELS[a.type] ?? a.type}</span>
                        {isPast && <span className="text-[10px] text-muted-foreground/60 uppercase font-bold">Past</span>}
                      </div>
                      <p className="font-semibold mt-1">{a.provider}</p>
                      {a.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin size={10} /> {a.location}
                        </p>
                      )}
                      {a.notes && <p className="text-xs text-muted-foreground/80 mt-1 italic">{a.notes}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => handleEdit(a)}>
                        <Edit2 size={12} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(a.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AppSettingsTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { data: healthSettings } = useGetAssessmentSettings();
  const updateHealthSettings = useUpdateAssessmentSettings();
  const [quietForm, setQuietForm] = useState({ quietWindowStart: "22:00", quietWindowEnd: "07:00", engagementIntervalHours: 4 });

  useEffect(() => {
    if (healthSettings) {
      setQuietForm({
        quietWindowStart: (healthSettings as any).quietWindowStart ?? "22:00",
        quietWindowEnd: (healthSettings as any).quietWindowEnd ?? "07:00",
        engagementIntervalHours: (healthSettings as any).engagementIntervalHours ?? 4,
      });
    }
  }, [healthSettings]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/settings`);
      if (res.ok) setSettings(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (patch: Record<string, string>) => {
    setSaving(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed");
      setSettings((prev) => ({ ...prev, ...patch }));
      toast({ title: "Settings saved" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleQuietSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateHealthSettings.mutate({ data: quietForm }, { onSuccess: () => toast({ title: "Quiet window saved" }) });
  };

  return (
    <div className="space-y-6">
      <header className="mb-8 border-b border-border/50 pb-4">
        <h2 className="text-4xl font-display text-primary tracking-widest uppercase">App Settings</h2>
        <p className="text-muted-foreground">Shopper preferences, store configuration, and quiet hours.</p>
      </header>

      {/* Store Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Store size={14} /> Store Preferences
          </CardTitle>
          <CardDescription>Configure the grocery stores used for Pops' weekly shopping.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
              <MapPin size={12} /> Delivery Zip Code
            </label>
            <div className="flex gap-2">
              <Input
                defaultValue={settings.zip_code ?? ""}
                placeholder="e.g. 92109"
                className="max-w-[180px]"
                id="zip-input"
                maxLength={10}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  const val = (document.getElementById("zip-input") as HTMLInputElement)?.value;
                  if (val) save({ zip_code: val });
                }}
              >
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Used by the Shopper agent to filter nearby store locations.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Preferred Store</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { key: "walmart", label: "Walmart" },
                { key: "stater_bros", label: "Stater Bros" },
                { key: "both", label: "Both (Price Compare)" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => save({ preferred_store: key })}
                  disabled={saving}
                  className={`px-4 py-2 rounded-sm border text-sm font-bold uppercase tracking-wide transition-all ${
                    (settings.preferred_store ?? "both") === key
                      ? "bg-primary/15 border-primary text-primary"
                      : "border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Tells Jessica which stores to prioritize when building the cart.</p>
          </div>
        </CardContent>
      </Card>

      {/* Quiet Window */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Clock size={14} /> Quiet Window
          </CardTitle>
          <CardDescription>Jessica will not initiate check-ins during these hours.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleQuietSave} className="space-y-4 max-w-md">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">Start (e.g. 22:00)</label>
                <Input value={quietForm.quietWindowStart} onChange={(e) => setQuietForm({ ...quietForm, quietWindowStart: e.target.value })} placeholder="22:00" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">End (e.g. 07:00)</label>
                <Input value={quietForm.quietWindowEnd} onChange={(e) => setQuietForm({ ...quietForm, quietWindowEnd: e.target.value })} placeholder="07:00" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground">Engagement Interval (hours)</label>
              <Input type="number" min={1} max={12} value={quietForm.engagementIntervalHours} onChange={(e) => setQuietForm({ ...quietForm, engagementIntervalHours: parseInt(e.target.value) })} className="max-w-[120px]" />
            </div>
            <Button type="submit" disabled={updateHealthSettings.isPending}>Save Quiet Window</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Subscribers Tab ──────────────────────────────────────────────────────────
interface SubscriberRow {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  setup_completed_at: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  family: "Family",
  multi_care: "Multi-Care",
};

const STATUS_VARIANT: Record<string, string> = {
  trialing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  past_due: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  pending_checkout: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SubscribersTab() {
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${WORKSPACE_BASE}/api/billing/subscribers`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) throw new Error(data.error ?? "Failed to load");
        setSubscribers(data);
      })
      .catch((err) => setError(err.message ?? "Failed to load subscribers"))
      .finally(() => setLoading(false));
  }, []);

  const activeCount = subscribers.filter((s) => ["active", "trialing"].includes(s.status)).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold uppercase tracking-widest text-primary">Subscribers</h2>
        <p className="text-muted-foreground text-sm mt-1">Brain Guardian paying tenants — visible to Ray only.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-display">Total</p>
            <p className="text-3xl font-bold text-foreground mt-1">{loading ? "—" : subscribers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-display">Active / Trial</p>
            <p className="text-3xl font-bold text-emerald-500 mt-1">{loading ? "—" : activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-display">MRR (est.)</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {loading ? "—" : `$${subscribers.filter((s) => s.status === "active").reduce((sum, s) => sum + (s.plan === "multi_care" ? 39 : 19), 0)}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm animate-pulse font-display uppercase tracking-widest">Loading subscribers…</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive text-sm font-display">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && subscribers.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-muted-foreground font-display uppercase tracking-widest text-sm">No subscribers yet</p>
            <p className="text-xs text-muted-foreground">Share the Brain Guardian landing page to get your first subscribers.</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && subscribers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-display uppercase tracking-widest">All Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground font-display">Name / Email</th>
                    <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground font-display">Plan</th>
                    <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground font-display">Status</th>
                    <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground font-display">Trial / Renewal</th>
                    <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground font-display">Joined</th>
                    <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground font-display">Last Active</th>
                    <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground font-display">Setup</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((sub) => (
                    <tr key={sub.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-3">
                        <p className="font-medium text-foreground">{sub.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{sub.email}</p>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-xs font-display font-bold uppercase tracking-wider text-foreground">
                          {PLAN_LABELS[sub.plan] ?? sub.plan}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider ${STATUS_VARIANT[sub.status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>
                          {sub.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-muted-foreground">
                        {sub.status === "trialing" && sub.trial_ends_at
                          ? `Trial ends ${fmt(sub.trial_ends_at)}`
                          : sub.current_period_end
                            ? `Renews ${fmt(sub.current_period_end)}`
                            : "—"}
                      </td>
                      <td className="py-3 px-3 text-xs text-muted-foreground">{fmt(sub.created_at)}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground">{sub.last_active_at ? fmt(sub.last_active_at) : "—"}</td>
                      <td className="py-3 px-3">
                        {sub.setup_completed_at
                          ? <span className="text-xs text-emerald-500 font-bold">✓ Done</span>
                          : <span className="text-xs text-muted-foreground">Pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DocumentsTab() {
  const { toast } = useToast();
  const [docs, setDocs] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [extracted, setExtracted] = useState<any | null>(null);
  const [docId, setDocId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [applied, setApplied] = useState<any | null>(null);
  const [include, setInclude] = useState<{
    appointments: boolean[];
    medications: boolean[];
    dietary_restrictions: boolean[];
    activity_restrictions: boolean[];
    clinical_notes: boolean;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = async () => {
    setDocsLoading(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/documents`);
      if (res.ok) setDocs(await res.json());
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => { loadDocs(); }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setExtracted(null);
    setApplied(null);
    setDocId(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      setScanning(true);
      try {
        const res = await fetch(`${WORKSPACE_BASE}/api/documents/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType }),
        });
        if (!res.ok) throw new Error("Scan failed");
        const data = await res.json();
        setExtracted(data.extracted);
        setDocId(data.docId);
        setInclude({
          appointments: (data.extracted.appointments ?? []).map(() => true),
          medications: (data.extracted.medications ?? []).map(() => true),
          dietary_restrictions: (data.extracted.dietary_restrictions ?? []).map(() => true),
          activity_restrictions: (data.extracted.activity_restrictions ?? []).map(() => true),
          clinical_notes: true,
        });
        toast({ title: "Document scanned", description: data.extracted.source_label });
      } catch {
        toast({ title: "Scan failed", description: "Could not read the document. Try a clearer photo.", variant: "destructive" });
        setPreviewUrl(null);
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApply = async () => {
    if (!extracted || !docId || !include) return;
    setApplying(true);
    try {
      const payload = {
        docId,
        source_label: extracted.source_label,
        appointments: (extracted.appointments ?? []).filter((_: any, i: number) => include.appointments[i]),
        medications: (extracted.medications ?? []).filter((_: any, i: number) => include.medications[i]),
        dietary_restrictions: (extracted.dietary_restrictions ?? []).filter((_: any, i: number) => include.dietary_restrictions[i]),
        activity_restrictions: (extracted.activity_restrictions ?? []).filter((_: any, i: number) => include.activity_restrictions[i]),
        clinical_notes: include.clinical_notes ? (extracted.clinical_notes ?? "") : "",
      };
      const res = await fetch(`${WORKSPACE_BASE}/api/documents/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Apply failed");
      const result = await res.json();
      setApplied(result);
      toast({ title: "Applied to care plan" });
      loadDocs();
    } catch {
      toast({ title: "Apply failed", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const reset = () => {
    setExtracted(null);
    setDocId(null);
    setPreviewUrl(null);
    setInclude(null);
    setApplied(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <header className="mb-6 border-b border-border/50 pb-4 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Scan Documents</h2>
          <p className="text-muted-foreground">Photo a VA form, discharge slip, or appointment card. AI reads it and updates Pops' care plan.</p>
        </div>
        <Button onClick={() => fileRef.current?.click()} disabled={scanning} className="gap-2">
          <Scan size={16} /> Scan Document
        </Button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
      </header>

      {scanning && (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw size={32} className="mx-auto mb-4 text-primary animate-spin" />
            <p className="text-muted-foreground font-display uppercase tracking-widest text-sm">Reading document…</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Gemini AI is extracting care data</p>
          </CardContent>
        </Card>
      )}

      {extracted && !applied && include && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-display text-muted-foreground uppercase tracking-widest">{extracted.source_label}</h3>
              {extracted.patient_name && <p className="text-xs text-muted-foreground">Patient: {extracted.patient_name}{extracted.date ? ` · ${extracted.date}` : ""}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={reset}><X size={14} /></Button>
          </div>

          {previewUrl && (
            <div className="rounded-md overflow-hidden border border-border/40 max-w-xs">
              <img src={previewUrl} alt="Scanned document" className="w-full object-contain max-h-48" />
            </div>
          )}

          {(extracted.appointments ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={14} /> Appointments → Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {extracted.appointments.map((appt: any, i: number) => (
                  <label key={i} className={`flex items-start gap-3 p-3 rounded-sm border cursor-pointer transition-colors ${include.appointments[i] ? "border-primary/40 bg-primary/5" : "border-border/40 opacity-60"}`}>
                    <input type="checkbox" checked={include.appointments[i]} onChange={() => setInclude({ ...include, appointments: include.appointments.map((v, j) => j === i ? !v : v) })} className="mt-0.5" />
                    <div className="flex-1 text-sm">
                      <span className="font-bold">{appt.date}</span>
                      {appt.time && <span className="text-muted-foreground ml-2">at {appt.time}</span>}
                      <span className="text-muted-foreground ml-2">— {appt.provider}</span>
                      {appt.location && <span className="text-muted-foreground/60 ml-1">@ {appt.location}</span>}
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          {(extracted.medications ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-display uppercase tracking-widest">💊 Medications → Medications List</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {extracted.medications.map((med: any, i: number) => (
                  <label key={i} className={`flex items-start gap-3 p-3 rounded-sm border cursor-pointer transition-colors ${include.medications[i] ? "border-primary/40 bg-primary/5" : "border-border/40 opacity-60"}`}>
                    <input type="checkbox" checked={include.medications[i]} onChange={() => setInclude({ ...include, medications: include.medications.map((v, j) => j === i ? !v : v) })} className="mt-0.5" />
                    <div className="flex-1 text-sm">
                      <span className="font-bold">{med.name}</span>
                      {med.dose && <span className="text-muted-foreground ml-2">{med.dose}</span>}
                      {med.instructions && <p className="text-xs text-muted-foreground/70 mt-0.5">{med.instructions}</p>}
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          {(extracted.dietary_restrictions ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-display uppercase tracking-widest">🥗 Dietary Restrictions → Shopper + Jessica</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {extracted.dietary_restrictions.map((r: string, i: number) => (
                  <label key={i} className={`flex items-center gap-3 p-3 rounded-sm border cursor-pointer transition-colors ${include.dietary_restrictions[i] ? "border-primary/40 bg-primary/5" : "border-border/40 opacity-60"}`}>
                    <input type="checkbox" checked={include.dietary_restrictions[i]} onChange={() => setInclude({ ...include, dietary_restrictions: include.dietary_restrictions.map((v, j) => j === i ? !v : v) })} />
                    <span className="text-sm">{r}</span>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground/50 mt-1">Jessica will casually mention this during her next call.</p>
              </CardContent>
            </Card>
          )}

          {(extracted.activity_restrictions ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-display uppercase tracking-widest">⚠️ Activity Restrictions → Jessica Briefing</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {extracted.activity_restrictions.map((r: string, i: number) => (
                  <label key={i} className={`flex items-center gap-3 p-3 rounded-sm border cursor-pointer transition-colors ${include.activity_restrictions[i] ? "border-primary/40 bg-primary/5" : "border-border/40 opacity-60"}`}>
                    <input type="checkbox" checked={include.activity_restrictions[i]} onChange={() => setInclude({ ...include, activity_restrictions: include.activity_restrictions.map((v, j) => j === i ? !v : v) })} />
                    <span className="text-sm">{r}</span>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground/50 mt-1">Jessica will gently remind Pops if relevant during her call.</p>
              </CardContent>
            </Card>
          )}

          {extracted.clinical_notes && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2"><FileText size={14} /> Clinical Notes → Care Record</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <label className={`flex items-start gap-3 p-3 rounded-sm border cursor-pointer transition-colors ${include.clinical_notes ? "border-primary/40 bg-primary/5" : "border-border/40 opacity-60"}`}>
                  <input type="checkbox" checked={include.clinical_notes} onChange={() => setInclude({ ...include, clinical_notes: !include.clinical_notes })} className="mt-0.5" />
                  <p className="text-sm text-muted-foreground">{extracted.clinical_notes}</p>
                </label>
                {extracted.physician && <p className="text-xs text-muted-foreground/50 mt-2">Signed: {extracted.physician}{extracted.facility ? ` · ${extracted.facility}` : ""}</p>}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={handleApply} disabled={applying} className="gap-2">
              {applying ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {applying ? "Applying…" : "Apply to Care Plan"}
            </Button>
            <Button variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}

      {applied && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="py-6 px-6">
            <div className="flex items-start gap-4">
              <CheckCircle size={28} className="text-success shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-display uppercase tracking-widest text-success text-sm mb-1">Applied to Care Plan</h3>
                <p className="text-muted-foreground text-sm">{applied.summary}</p>
                {applied.details?.length > 0 && (
                  <ul className="text-xs text-muted-foreground/70 mt-2 space-y-0.5 list-disc list-inside">
                    {applied.details.map((d: string, i: number) => <li key={i}>{d}</li>)}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground/50 mt-3">Jessica is now briefed and will mention active restrictions naturally during her next call.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={reset}>
              <Scan size={14} /> Scan Another Document
            </Button>
          </CardContent>
        </Card>
      )}

      {!extracted && !scanning && (
        <div className="space-y-4">
          <h3 className="text-lg font-display text-muted-foreground uppercase tracking-widest">Recent Scans</h3>
          {docsLoading ? (
            <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
          ) : docs.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border/40 rounded-md">
              <Scan size={36} className="mx-auto mb-3 text-muted-foreground/20" />
              <p className="text-muted-foreground text-sm">No documents scanned yet.</p>
              <p className="text-xs text-muted-foreground/50 mt-1">Tap "Scan Document" to photograph a VA form, appointment slip, or discharge instructions.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {docs.map((doc: any) => {
                const structured = (() => { try { return JSON.parse(doc.structured_json); } catch { return {}; } })();
                return (
                  <Card key={doc.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm">{doc.source_label}</span>
                            {doc.applied_at
                              ? <Badge variant="outline" className="text-xs border-success/40 text-success">✓ Applied</Badge>
                              : <Badge variant="outline" className="text-xs text-muted-foreground">Not applied</Badge>
                            }
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(doc.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
                          </p>
                          {structured.dietary_restrictions?.length > 0 && (
                            <p className="text-xs text-muted-foreground/70 mt-1">🥗 {structured.dietary_restrictions.join(", ")}</p>
                          )}
                          {structured.activity_restrictions?.length > 0 && (
                            <p className="text-xs text-muted-foreground/70">⚠️ {structured.activity_restrictions.join(" · ")}</p>
                          )}
                          {structured.appointments?.length > 0 && (
                            <p className="text-xs text-muted-foreground/70">📅 {structured.appointments.map((a: any) => `${a.date} w/ ${a.provider}`).join(", ")}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
