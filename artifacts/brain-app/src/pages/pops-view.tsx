import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  useGetAppState,
  useGetSchedule,
  useGetHaldolCycle,
} from "@workspace/api-client-react";

const QUARTER_LABELS: Record<string, string> = {
  Q1: "MORNING",
  Q2: "AFTERNOON",
  Q3: "EVENING",
  Q4: "NIGHT",
};

function getQuarterGreeting(quarter: string): string {
  switch (quarter) {
    case "Q1": return "GOOD MORNING.";
    case "Q2": return "GOOD AFTERNOON.";
    case "Q3": return "GOOD EVENING.";
    case "Q4": return "GOOD NIGHT.";
    default: return "YOU ARE SAFE.";
  }
}

export function PopsView() {
  const [currentTime, setCurrentTime] = useState(new Date());

  const { data: state } = useGetAppState({
    query: { refetchInterval: 30000 },
  });
  const { data: schedule } = useGetSchedule({
    query: { refetchInterval: 30000 },
  });
  const { data: haldol } = useGetHaldolCycle({
    query: { refetchInterval: 60000 },
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isZombieMode = state?.zombieMode || haldol?.isZombiePhase;
  const currentQuarter = state?.currentQuarter ?? "Q1";

  const currentQTasks = (schedule ?? [])
    .filter((t) => t.quarter === currentQuarter && t.isActive)
    .sort((a, b) => a.order - b.order);

  const currentTask = currentQTasks.find((t) => !t.isCompleted) ?? currentQTasks[0] ?? null;

  if (isZombieMode) {
    return <ZombieScreen currentTime={currentTime} haldol={haldol} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col crt-flicker">
      <header className="bg-secondary/40 border-b-2 border-primary px-8 py-5 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-5">
          <div className="h-4 w-4 rounded-full bg-primary animate-pulse shadow-[0_0_15px_rgba(251,191,36,0.8)]" />
          <span className="text-3xl md:text-4xl font-display font-bold tracking-widest text-primary">
            br(AI)n_OS // ONLINE
          </span>
        </div>
        <div className="text-right">
          <div className="text-5xl md:text-7xl font-display text-primary tracking-wider tabular-nums">
            {format(currentTime, "HH:mm:ss")}
          </div>
          <div className="text-lg md:text-xl text-muted-foreground uppercase tracking-widest">
            {format(currentTime, "EEEE, MMM dd, yyyy")}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
        {state?.activeMessage ? (
          <ActiveMessage message={state.activeMessage} />
        ) : (
          <AmbientStateDisplay
            quarter={currentQuarter}
            task={currentTask}
          />
        )}
      </main>

      {haldol && <HaldolBar haldol={haldol} />}
    </div>
  );
}

function ZombieScreen({
  currentTime,
  haldol,
}: {
  currentTime: Date;
  haldol: any;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col crt-flicker">
      <header className="bg-secondary/40 border-b-2 border-destructive/60 px-8 py-5 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-5">
          <div className="h-4 w-4 rounded-full bg-destructive/60 animate-pulse" />
          <span className="text-3xl md:text-4xl font-display font-bold tracking-widest text-destructive/80">
            br(AI)n_OS // REST MODE
          </span>
        </div>
        <div className="text-5xl md:text-7xl font-display text-primary tracking-wider tabular-nums">
          {format(currentTime, "HH:mm:ss")}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center">
        <p className="text-[10vw] md:text-[8rem] font-display font-bold text-primary leading-none tracking-widest uppercase mb-8">
          REST
        </p>
        <p className="text-[5vw] md:text-5xl font-display text-muted-foreground tracking-widest uppercase">
          TODAY.
        </p>
        <div className="mt-16 border border-primary/20 rounded-lg px-10 py-6 bg-primary/5">
          <p className="text-2xl md:text-3xl font-display text-primary/80 tracking-wider">
            You are taken care of.
          </p>
        </div>
      </main>

      {haldol && <HaldolBar haldol={haldol} />}
    </div>
  );
}

function AmbientStateDisplay({
  quarter,
  task,
}: {
  quarter: string;
  task: any;
}) {
  const timeOfDay = QUARTER_LABELS[quarter] ?? "NOW";

  if (!task) {
    return (
      <>
        <p className="text-[6vw] md:text-7xl font-display font-bold text-primary leading-none tracking-widest uppercase mb-6">
          IT'S {timeOfDay}.
        </p>
        <p className="text-[4vw] md:text-5xl font-display text-muted-foreground tracking-widest uppercase">
          {getQuarterGreeting(quarter)}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-[4vw] md:text-5xl font-display text-muted-foreground tracking-widest uppercase mb-4">
        IT'S {timeOfDay}.
      </p>
      <p className="text-[7vw] md:text-[5.5rem] font-display font-bold text-primary leading-tight tracking-widest uppercase">
        {task.title.toUpperCase()}
      </p>
      {task.timeLabel && (
        <p className="text-[4vw] md:text-5xl font-display text-primary/60 tracking-widest mt-4">
          AT {task.timeLabel}
        </p>
      )}
    </>
  );
}

function ActiveMessage({ message }: { message: string }) {
  return (
    <div className="max-w-4xl">
      <p className="text-[3vw] md:text-4xl font-display text-muted-foreground tracking-widest uppercase mb-6">
        MESSAGE FROM RAYMO:
      </p>
      <p className="text-[6vw] md:text-6xl font-display font-bold text-primary leading-tight tracking-wider uppercase">
        "{message.toUpperCase()}"
      </p>
    </div>
  );
}

function HaldolBar({ haldol }: { haldol: any }) {
  return (
    <footer className="bg-card border-t border-border px-8 py-5 shrink-0">
      <div className="flex justify-between items-center mb-2">
        <p className="text-lg font-display text-muted-foreground uppercase tracking-widest">
          Medication Cycle — Day{" "}
          <span className="text-primary font-bold">{haldol.cycleDay}</span> of 14
        </p>
        <p className="text-sm text-muted-foreground">
          Next:{" "}
          <span className="text-primary font-bold">
            {haldol.nextInjectionDate}
          </span>
        </p>
      </div>

      <div className="h-3 w-full bg-secondary rounded-full overflow-hidden flex">
        {Array.from({ length: 14 }).map((_, i) => {
          const day = i + 1;
          const isPast = day < haldol.cycleDay;
          const isCurrent = day === haldol.cycleDay;
          const isZombieZone = day <= 5;
          return (
            <div
              key={day}
              className={`h-full flex-1 border-r border-background/50 last:border-0 relative ${
                isCurrent
                  ? "bg-primary"
                  : isPast
                  ? isZombieZone
                    ? "bg-destructive/40"
                    : "bg-primary/40"
                  : "bg-transparent"
              }`}
            >
              {isCurrent && (
                <div className="absolute inset-0 bg-white/30 animate-pulse" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-xs text-muted-foreground uppercase font-bold tracking-wider">
        <span>Injection</span>
        <span className="text-destructive/70">Rest Phase Ends Day 5</span>
        <span>Next Injection</span>
      </div>
    </footer>
  );
}
