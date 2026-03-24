import { useEffect, useState } from "react";
import { format, differenceInDays, addDays } from "date-fns";
import { CheckCircle2, Circle, AlertTriangle, Clock } from "lucide-react";
import { 
  useGetAppState, 
  useGetSchedule, 
  useGetHaldolCycle 
} from "@workspace/api-client-react";

export function PopsView() {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Poll for updates every 30 seconds
  const { data: state, isLoading: isLoadingState } = useGetAppState({ 
    query: { refetchInterval: 30000 } 
  });
  const { data: schedule, isLoading: isLoadingSchedule } = useGetSchedule({ 
    query: { refetchInterval: 30000 } 
  });
  const { data: haldol, isLoading: isLoadingHaldol } = useGetHaldolCycle({ 
    query: { refetchInterval: 60000 } // Refetch haldol less often
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoadingState || isLoadingSchedule || isLoadingHaldol) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-primary">
        <div className="animate-spin rounded-full h-32 w-32 border-t-4 border-b-4 border-primary mb-8"></div>
        <h1 className="text-6xl font-display uppercase tracking-widest animate-pulse">Initializing System...</h1>
      </div>
    );
  }

  const isZombieMode = state?.zombieMode || haldol?.isZombiePhase;
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'] as const;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden crt-flicker">
      {/* Top Status Bar */}
      <header className="bg-secondary/40 border-b-2 border-primary px-8 py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-6">
          <div className="h-4 w-4 rounded-full bg-primary animate-pulse shadow-[0_0_15px_rgba(251,191,36,0.8)]" />
          <h1 className="text-4xl md:text-6xl font-display font-bold tracking-widest text-primary">
            br(AI)n_OS // ONLINE
          </h1>
        </div>
        <div className="text-right">
          <div className="text-5xl md:text-7xl font-display text-primary tracking-wider">
            {format(currentTime, 'HH:mm:ss')}
          </div>
          <div className="text-xl md:text-2xl text-muted-foreground uppercase tracking-widest">
            {format(currentTime, 'EEEE, MMM dd, yyyy')}
          </div>
        </div>
      </header>

      {/* ZOMBIE MODE BANNER */}
      {isZombieMode && (
        <div className="bg-destructive/20 border-y-2 border-destructive px-8 py-4 flex items-center justify-center gap-4 animate-pulse">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <h2 className="text-4xl md:text-5xl font-display font-bold text-destructive tracking-widest uppercase">
            REST MODE ACTIVE - TAKE IT EASY TODAY
          </h2>
          <AlertTriangle className="h-10 w-10 text-destructive" />
        </div>
      )}

      {/* Active Message Banner */}
      {state?.activeMessage && !isZombieMode && (
        <div className="bg-primary/10 border-b border-primary/30 px-8 py-6 text-center shadow-[inset_0_-10px_20px_rgba(0,0,0,0.5)]">
          <p className="text-4xl md:text-5xl font-display text-primary tracking-wider uppercase">
            "{state.activeMessage}"
          </p>
        </div>
      )}

      {/* Main Content: Schedule Grid */}
      <main className="flex-1 p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 overflow-y-auto">
        {quarters.map((q) => {
          const isCurrentQ = state?.currentQuarter === q;
          const qTasks = schedule?.filter(t => t.quarter === q).sort((a, b) => a.order - b.order) || [];
          
          return (
            <div 
              key={q}
              className={`flex flex-col border-2 rounded-lg overflow-hidden transition-all duration-500 ${
                isCurrentQ 
                  ? 'border-primary shadow-[0_0_30px_rgba(251,191,36,0.15)] bg-card' 
                  : 'border-border/50 bg-background/50 opacity-60 grayscale-[30%]'
              }`}
            >
              <div className={`p-4 border-b-2 flex justify-between items-center ${
                isCurrentQ ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border/50 text-muted-foreground'
              }`}>
                <h3 className="text-5xl font-display font-bold tracking-widest">{q}</h3>
                {isCurrentQ && <Badge className="text-xl bg-background text-primary border-primary animate-pulse">ACTIVE</Badge>}
              </div>
              
              <div className="flex-1 p-6 space-y-6">
                {qTasks.length === 0 ? (
                  <p className="text-2xl text-muted-foreground italic text-center mt-10">No tasks</p>
                ) : (
                  qTasks.map(task => (
                    <div 
                      key={task.id} 
                      className={`flex items-start gap-4 p-4 rounded-md border ${
                        task.isCompleted 
                          ? 'bg-success/10 border-success/30' 
                          : isCurrentQ 
                            ? 'bg-primary/5 border-primary/20' 
                            : 'border-transparent'
                      }`}
                    >
                      <div className="pt-1 shrink-0">
                        {task.isCompleted ? (
                          <CheckCircle2 className="h-10 w-10 text-success shadow-[0_0_15px_rgba(34,197,94,0.5)] rounded-full" />
                        ) : (
                          <Circle className={`h-10 w-10 ${isCurrentQ ? 'text-primary' : 'text-muted-foreground'}`} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className={`text-2xl font-bold font-display px-2 py-0.5 rounded ${
                            task.isCompleted ? 'bg-success/20 text-success' : 'bg-secondary text-muted-foreground'
                          }`}>
                            {task.timeLabel}
                          </span>
                        </div>
                        <h4 className={`text-3xl font-display tracking-wide uppercase leading-tight ${
                          task.isCompleted ? 'text-success/70 line-through decoration-2' : 'text-foreground'
                        }`}>
                          {task.title}
                        </h4>
                        {task.description && !task.isCompleted && (
                          <p className="text-xl text-muted-foreground mt-2">{task.description}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </main>

      {/* Bottom Bar: Haldol Progress */}
      {haldol && (
        <footer className="bg-card border-t border-border p-6 shrink-0">
          <div className="flex justify-between items-end mb-2">
            <div>
              <h3 className="text-2xl font-display text-muted-foreground uppercase tracking-widest">Medication Cycle</h3>
              <p className="text-4xl font-display text-primary uppercase">Day {haldol.cycleDay} of 14</p>
            </div>
            <div className="text-right text-muted-foreground">
              <p className="text-lg">Next Injection: <span className="text-primary font-bold">{format(new Date(haldol.nextInjectionDate), 'MMM dd')}</span></p>
            </div>
          </div>
          
          <div className="h-4 w-full bg-secondary rounded-full overflow-hidden flex">
            {Array.from({ length: 14 }).map((_, i) => {
              const day = i + 1;
              const isPast = day < haldol.cycleDay;
              const isCurrent = day === haldol.cycleDay;
              const isZombieZone = day <= 5;
              
              return (
                <div 
                  key={day} 
                  className={`h-full flex-1 border-r border-background/50 last:border-0 ${
                    isCurrent ? 'bg-primary relative' :
                    isPast ? (isZombieZone ? 'bg-destructive/40' : 'bg-primary/40') :
                    'bg-transparent'
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute inset-0 bg-white/30 animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground uppercase font-bold tracking-wider px-1">
            <span>Injection</span>
            <span className="text-destructive/70">Rest Phase Ends</span>
            <span>Prep Phase</span>
            <span>Next Injection</span>
          </div>
        </footer>
      )}
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-sm font-bold ${className}`}>
      {children}
    </span>
  );
}
