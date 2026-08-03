import { useState } from "react";
import { formatDuration, intervalToDuration } from "date-fns";
import { formatPacificDate, formatPacificTime } from "@/lib/time";
import {
  PhoneCall,
  PhoneIncoming,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Calendar,
  Radio,
  Activity,
} from "lucide-react";
import {
  useListCallSessions,
  useGetSessionDataPoints,
  getGetSessionDataPointsQueryKey,
} from "@workspace/api-client-react";

const CATEGORY_LABELS: Record<string, string> = {
  mood: "Mood",
  medication: "Medication",
  sleep: "Sleep",
  appetite: "Appetite",
  cognition: "Cognition",
  voices: "Voices",
  energy: "Energy",
  task: "Tasks",
};

const CATEGORY_ICONS: Record<string, string> = {
  mood: "😐",
  medication: "💊",
  sleep: "🌙",
  appetite: "🍽️",
  cognition: "🧠",
  voices: "👂",
  energy: "⚡",
  task: "✅",
};

function formatCallDuration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : null;
  if (!end) return "In progress";
  const dur = intervalToDuration({ start, end });
  if (dur.hours && dur.hours > 0) {
    return formatDuration({ hours: dur.hours, minutes: dur.minutes }, { format: ["hours", "minutes"] });
  }
  if (dur.minutes && dur.minutes > 0) {
    return `${dur.minutes}m ${dur.seconds ?? 0}s`;
  }
  return `${dur.seconds ?? 0}s`;
}

function CallTranscript({ sessionId, summary, transcript }: { sessionId: number; summary: string | null; transcript: string | null }) {
  const { data: dataPoints, isLoading } = useGetSessionDataPoints(sessionId, {
    query: { queryKey: getGetSessionDataPointsQueryKey(sessionId) },
  });

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-sm bg-secondary/40 border border-border/20" />
        ))}
      </div>
    );
  }

  const pts = (dataPoints as any[]) ?? [];

  return (
    <div className="space-y-4">
      {summary && (
        <div>
          <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-2 flex items-center gap-1.5">
            <Activity size={11} />
            Session Summary
          </p>
          <div className="p-3 rounded-sm bg-secondary/40 border border-border/30 text-xs text-foreground/90 leading-relaxed">
            {summary}
          </div>
        </div>
      )}

      {transcript && (
        <div>
          <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-2 flex items-center gap-1.5">
            <FileText size={11} />
            Full Transcript
          </p>
          <div className="p-3 rounded-sm bg-secondary/40 border border-border/30 text-xs leading-relaxed max-h-72 overflow-y-auto space-y-1.5">
            {transcript.split("\n").filter(Boolean).map((line, i) => {
              const isJessica = line.startsWith("Jessica:");
              return (
                <p key={i} className={isJessica ? "text-foreground/90" : "text-muted-foreground"}>
                  <span className={`font-bold ${isJessica ? "text-primary" : "text-accent"}`}>
                    {isJessica ? "Jessica: " : line.slice(0, line.indexOf(":") + 1) + " "}
                  </span>
                  {isJessica ? line.slice("Jessica:".length) : line.slice(line.indexOf(":") + 1)}
                </p>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-2 flex items-center gap-1.5">
          <FileText size={11} />
          Health Data Captured ({pts.length} point{pts.length !== 1 ? "s" : ""})
        </p>

        {pts.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No structured health data was captured in this session.
          </p>
        ) : (
          <div className="space-y-2">
            {pts.map((dp: any) => (
              <div
                key={dp.id}
                className={`flex items-start gap-3 p-2.5 rounded-sm text-xs ${
                  dp.flagged
                    ? "bg-destructive/10 border border-destructive/20"
                    : "bg-secondary/30 border border-border/20"
                }`}
              >
                <span className="shrink-0 text-sm leading-none mt-0.5">
                  {CATEGORY_ICONS[dp.category] ?? "📊"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-muted-foreground uppercase font-bold tracking-widest text-[10px]">
                      {CATEGORY_LABELS[dp.category] ?? dp.category}
                    </span>
                    {dp.parsedValue && (
                      <span className="text-primary font-semibold">→ {dp.parsedValue}</span>
                    )}
                    {dp.parsedIntensity && dp.parsedIntensity !== "none" && (
                      <span className="text-accent">({dp.parsedIntensity})</span>
                    )}
                  </div>
                  {dp.rawResponse && (
                    <p className="text-muted-foreground/70 italic">"{dp.rawResponse}"</p>
                  )}
                </div>
                {dp.flagged && (
                  <AlertTriangle size={12} className="text-destructive shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CallRow({ session }: { session: any }) {
  const [expanded, setExpanded] = useState(false);

  const isOutbound = Boolean(session.elevenlabsConversationId);
  const startedAt: string | null = session.startedAt ?? null;
  const endedAt: string | null = session.endedAt ?? null;
  const duration = formatCallDuration(startedAt, endedAt);
  const sessionDate = session.sessionDate as string;
  const dateDisplay = sessionDate ? formatPacificDate(sessionDate + "T12:00:00Z") : "—";
  const timeDisplay = startedAt ? formatPacificTime(startedAt) : "—";
  const dataPointCount: number = session.dataPointCount ?? 0;

  return (
    <div
      className={`rounded-sm border transition-colors ${
        session.flagged
          ? "border-destructive/50 bg-destructive/5"
          : "border-border/60 bg-card"
      }`}
    >
      <button
        className="w-full text-left p-4 flex items-start gap-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div
          className={`mt-0.5 shrink-0 rounded-full p-1.5 ${
            isOutbound
              ? "bg-primary/10 text-primary"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          {isOutbound ? <PhoneCall size={14} /> : <PhoneIncoming size={14} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground">{dateDisplay}</span>
            <span className="text-xs text-muted-foreground">{timeDisplay}</span>
            {session.cycleDay && (
              <span className="text-xs px-1.5 py-0.5 border border-border/60 rounded-sm text-muted-foreground">
                Day {session.cycleDay}
              </span>
            )}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-sm font-medium uppercase tracking-wide ${
                isOutbound
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-secondary text-muted-foreground border border-border/40"
              }`}
            >
              {isOutbound ? "Outbound" : "In-App"}
            </span>
            {session.flagged && (
              <span className="text-xs px-1.5 py-0.5 rounded-sm bg-destructive/20 text-destructive border border-destructive/30 font-bold animate-pulse">
                ⚠ Flagged
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {duration}
            </span>
            <span className="flex items-center gap-1">
              <FileText size={11} />
              {dataPointCount} data point{dataPointCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-muted-foreground mt-0.5">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/30 pt-4">
          <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-3">
            📋 Call Transcript
          </p>
          <CallTranscript sessionId={session.id} summary={session.summary ?? null} transcript={session.transcript ?? null} />
        </div>
      )}
    </div>
  );
}

export function CallsView() {
  const { data: sessions, isLoading } = useListCallSessions({ limit: 50 });

  const sessionList = (sessions as any[]) ?? [];
  const flaggedCount = sessionList.filter((s: any) => s.flagged).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-secondary/40 border-b-2 border-primary px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Radio size={20} className="text-primary" />
          <div>
            <h1 className="text-xl font-display font-bold tracking-widest text-primary uppercase">
              Call History
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Pops' check-in log
            </p>
          </div>
        </div>
        {flaggedCount > 0 && (
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-sm bg-destructive/10 border border-destructive/30">
            <AlertTriangle size={14} className="text-destructive" />
            <span className="text-xs font-bold text-destructive">
              {flaggedCount} flagged session{flaggedCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <PhoneCall size={14} className="text-primary" />
              <span className="font-medium text-primary">{sessionList.length}</span> sessions
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              Last 50 calls
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <PhoneCall size={11} className="text-primary" />
              Outbound
            </span>
            <span className="flex items-center gap-1.5">
              <PhoneIncoming size={11} />
              In-App
            </span>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-sm bg-secondary/40 animate-pulse border border-border/40"
              />
            ))}
          </div>
        )}

        {!isLoading && sessionList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-4">
            <PhoneCall size={40} className="opacity-20" />
            <div>
              <p className="font-display uppercase tracking-widest text-sm">No calls yet</p>
              <p className="text-xs mt-1">
                Sessions will appear here once calls are made.
              </p>
            </div>
          </div>
        )}

        {!isLoading && sessionList.length > 0 && (
          <div className="space-y-3">
            {sessionList.map((session: any) => (
              <CallRow key={session.id} session={session} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
