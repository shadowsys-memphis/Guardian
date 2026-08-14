import { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  PhoneOff,
  RefreshCw,
  ShieldAlert,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatPacificDateTime } from "@/lib/time";

const WORKSPACE_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type CronJobStatus = {
  name: string;
  title: string;
  schedule: string;
  lastRanAt: string | null;
  lastOutcome: "ok" | "skipped" | "warn" | "error" | null;
  lastDetail: string | null;
};
type CronStatus = {
  jobs: CronJobStatus[];
  alerts: {
    medRefusal: any | null;
    wellbeing: any | null;
    missedCall: any | null;
    haldol: any | null;
    missedCallStreak: number;
    missedCallStreakAlert: any | null;
    elevenlabsConfig: any | null;
  };
};

function outcomeGlyph(outcome: CronJobStatus["lastOutcome"]) {
  if (outcome === "ok") return <CheckCircle size={13} className="text-success shrink-0" />;
  if (outcome === "warn") return <AlertTriangle size={13} className="text-amber-500 shrink-0" />;
  if (outcome === "error") return <ShieldAlert size={13} className="text-destructive shrink-0" />;
  return <Clock size={13} className="text-muted-foreground/40 shrink-0" />;
}

/** Live health + alert surface for the scheduled-jobs runner (lib/call-scheduler.ts). */
export function SystemJobsPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/cron/status`);
      if (res.ok) setStatus(await res.json());
    } catch { /* transient — next poll retries */ }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  const acknowledge = async (kind: "med_refusal" | "wellbeing" | "missed_call" | "elevenlabs_config") => {
    setBusy(kind);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/cron/alerts/${kind}/ack`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast({ title: "Alert acknowledged" });
      await load();
    } catch {
      toast({ title: "Could not acknowledge alert", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const runNow = async (name: string, label: string) => {
    setBusy(name);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/cron/jobs/${name}/run`, { method: "POST" });
      if (!res.ok) throw new Error();
      const result = await res.json();
      toast({
        title: `${label}: ${result.outcome}`,
        description: result.detail ?? undefined,
        variant: result.outcome === "error" ? "destructive" : undefined,
      });
      await load();
    } catch {
      toast({ title: `Failed to run ${label}`, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const alerts = status?.alerts;
  const haldolStatus = alerts?.haldol?.status as string | undefined;

  return (
    <div className="space-y-3">
      {/* Wellbeing — stays until Ray acknowledges; deliberately has no dismiss-without-ack path */}
      {alerts?.wellbeing && (
        <Card className="border-destructive/70 bg-destructive/10">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert size={18} className="text-destructive shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-destructive uppercase tracking-widest">Wellbeing Alert</p>
              <p className="text-xs text-muted-foreground mt-1">
                {alerts.wellbeing.count > 1 ? `${alerts.wellbeing.count} flagged sessions. ` : ""}
                Pops said something concerning on call session #{alerts.wellbeing.sessionId}.
                {alerts.wellbeing.summary ? ` — ${alerts.wellbeing.summary}` : ""}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">{formatPacificDateTime(alerts.wellbeing.at)}</p>
            </div>
            <Button size="sm" variant="destructive" disabled={busy === "wellbeing"} onClick={() => acknowledge("wellbeing")}>
              I know
            </Button>
          </CardContent>
        </Card>
      )}

      {alerts?.medRefusal && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-destructive uppercase tracking-widest">Medication Refused</p>
              <p className="text-xs text-muted-foreground mt-1">
                {alerts.medRefusal.count > 1 ? `${alerts.medRefusal.count} refusals. ` : ""}
                {alerts.medRefusal.detail ?? "Pops declined a medication."}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">{formatPacificDateTime(alerts.medRefusal.at)}</p>
            </div>
            <Button size="sm" variant="outline" disabled={busy === "med_refusal"} onClick={() => acknowledge("med_refusal")}>
              I know
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Multi-day streak alert — more prominent than the per-day banner; persists
          until a successful call actually breaks the streak (non-dismissible by design).
          Clears automatically when missedCallJob confirms Pops was reached. */}
      {alerts?.missedCallStreakAlert && (
        <Card className="border-destructive/70 bg-destructive/10">
          <CardContent className="p-4 flex items-start gap-3">
            <PhoneOff size={18} className="text-destructive shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-destructive uppercase tracking-widest">
                Pops Missed {alerts.missedCallStreakAlert.streak} Days in a Row
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                No Jessica call has successfully reached Pops since{" "}
                <span className="font-semibold">{alerts.missedCallStreakAlert.since}</span>.{" "}
                Check Jessica settings and ElevenLabs config. Ray has been notified by phone.
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Clears automatically when a call succeeds · last checked {formatPacificDateTime(alerts.missedCallStreakAlert.at)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {alerts?.missedCall && !alerts?.missedCallStreakAlert && (
        <Card className="border-amber-500/60 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <PhoneOff size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">No Call Reached Pops Today</p>
              <p className="text-xs text-muted-foreground mt-1">
                {alerts.missedCall.reason === "no_session_today"
                  ? "The daily call window passed with no completed call session."
                  : `The scheduled call failed to start (${alerts.missedCall.reason}).`}
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={busy === "missed_call"} onClick={() => acknowledge("missed_call")}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ElevenLabs config alert — surfaced when ELEVENLABS_AGENT_ID or
          ELEVENLABS_PHONE_NUMBER_ID fail live API validation. Clears automatically
          the next day if the issue is fixed, or Ray can dismiss it manually. */}
      {alerts?.elevenlabsConfig && !(alerts.elevenlabsConfig.agentOk && alerts.elevenlabsConfig.phoneOk) && (
        <Card className="border-amber-500/60 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Settings size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">ElevenLabs Config Issue</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(alerts.elevenlabsConfig.issues as string[]).join(" · ")}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Verified {formatPacificDateTime(alerts.elevenlabsConfig.at)} · Daily calls will fail until this is fixed
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={busy === "elevenlabs_config"} onClick={() => acknowledge("elevenlabs_config")}>
              Seen
            </Button>
          </CardContent>
        </Card>
      )}

      {haldolStatus && haldolStatus !== "ok" && (
        <Card className={haldolStatus === "overdue" ? "border-destructive/60 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"}>
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert size={18} className={`shrink-0 mt-0.5 ${haldolStatus === "overdue" ? "text-destructive" : "text-amber-500"}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold uppercase tracking-widest ${haldolStatus === "overdue" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                {haldolStatus === "overdue" ? "Haldol Injection Overdue" : "Haldol Injection Due Tomorrow"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Cycle day {alerts?.haldol?.cycleDay} · last injection {alerts?.haldol?.lastInjectionDate}.
                {haldolStatus === "overdue" ? " Clears automatically once a new injection date is logged." : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <button className="w-full flex items-center justify-between text-left" onClick={() => setExpanded((e) => !e)}>
            <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
              <Clock size={14} /> System Jobs
              {status && (
                <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                  {status.jobs.filter((j) => j.lastOutcome === "error").length > 0
                    ? `${status.jobs.filter((j) => j.lastOutcome === "error").length} erroring`
                    : "all healthy"}
                </span>
              )}
            </CardTitle>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {!expanded && <CardDescription className="text-xs">Scheduled background jobs — last run status and manual overrides.</CardDescription>}
        </CardHeader>
        {expanded && (
          <CardContent className="space-y-2">
            {!status ? (
              <p className="text-xs text-muted-foreground">Loading job status…</p>
            ) : (
              <>
                {status.jobs.map((job) => (
                  <div key={job.name} className="flex items-start gap-2.5 p-2.5 rounded-sm border border-border/30 bg-secondary/20">
                    {outcomeGlyph(job.lastOutcome)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold">{job.title}</p>
                      <p className="text-[10px] text-muted-foreground/70">{job.schedule}</p>
                      {job.lastDetail && <p className="text-[10px] text-muted-foreground mt-0.5">{job.lastDetail}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground/60">
                        {job.lastRanAt ? formatPacificDateTime(job.lastRanAt) : "never run"}
                      </p>
                      {(job.name === "daily_call" || job.name === "rotation_reset") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1 h-6 text-[10px] gap-1"
                          disabled={busy === job.name}
                          onClick={() => runNow(job.name, job.title)}
                        >
                          <RefreshCw size={9} className={busy === job.name ? "animate-spin" : ""} />
                          Run Now
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground/50 pt-1">
                  Jobs run in-process on a 60s tick. "Skipped" ticks (wrong time / nothing to do) aren't logged.
                </p>
              </>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
