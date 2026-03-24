import { useState } from "react";
import { format } from "date-fns";
import { Activity, Calendar, FileText, Settings, ShieldAlert, Check, Plus, Edit2, Trash2, HeartPulse, BrainCircuit, Mic } from "lucide-react";
import { 
  useGetAppState, useUpdateAppState,
  useGetSchedule, useCreateScheduleTask, useUpdateScheduleTask, useDeleteScheduleTask, useCompleteScheduleTask,
  useGetSymptomLogs, useCreateSymptomLog,
  useGetVoiceScripts, useUpdateVoiceScript,
  useGetHaldolCycle, useUpdateHaldolCycle
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";

type Tab = 'dashboard' | 'schedule' | 'symptoms' | 'scripts' | 'haldol';

export function AdminView() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar Nav */}
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
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Activity size={18}/>} label="Dashboard" />
          <NavButton active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} icon={<Calendar size={18}/>} label="Schedule Editor" />
          <NavButton active={activeTab === 'symptoms'} onClick={() => setActiveTab('symptoms')} icon={<HeartPulse size={18}/>} label="Symptom Log" />
          <NavButton active={activeTab === 'scripts'} onClick={() => setActiveTab('scripts')} icon={<Mic size={18}/>} label="Voice Scripts" />
          <NavButton active={activeTab === 'haldol'} onClick={() => setActiveTab('haldol')} icon={<BrainCircuit size={18}/>} label="Haldol Tracker" />
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'schedule' && <ScheduleTab />}
          {activeTab === 'symptoms' && <SymptomsTab />}
          {activeTab === 'scripts' && <ScriptsTab />}
          {activeTab === 'haldol' && <HaldolTab />}
        </div>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm font-bold uppercase tracking-wider font-display transition-all ${
        active 
          ? 'bg-primary/10 text-primary border-l-4 border-primary' 
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground border-l-4 border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// --- TABS ---

function DashboardTab() {
  const { data: state } = useGetAppState();
  const { data: haldol } = useGetHaldolCycle();
  const { data: schedule } = useGetSchedule();
  const updateState = useUpdateAppState();
  const { toast } = useToast();

  const handleStateChange = (updates: any) => {
    updateState.mutate({ data: updates }, {
      onSuccess: () => toast({ title: "State updated successfully" }),
      onError: (e) => toast({ title: "Failed to update state", variant: "destructive" })
    });
  };

  const completedCount = schedule?.filter(t => t.isCompleted).length || 0;
  const totalCount = schedule?.length || 0;
  const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <div className="space-y-6">
      <header className="mb-8 border-b border-border/50 pb-4">
        <h2 className="text-4xl font-display text-primary tracking-widest uppercase">System Overview</h2>
        <p className="text-muted-foreground">Live status of the br(AI)n App ecosystem.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold">Current Quarter</CardDescription>
            <CardTitle className="text-5xl">{state?.currentQuarter || '--'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mt-2">
              {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                <button
                  key={q}
                  onClick={() => handleStateChange({ currentQuarter: q })}
                  className={`px-3 py-1 text-xs font-bold rounded ${state?.currentQuarter === q ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className={state?.zombieMode ? 'border-destructive shadow-[0_0_15px_rgba(220,38,38,0.2)]' : ''}>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold">Mode Status</CardDescription>
            <CardTitle className={`text-4xl ${state?.zombieMode ? 'text-destructive' : 'text-success'}`}>
              {state?.zombieMode ? 'REST (ZOMBIE)' : 'NORMAL'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button 
              variant={state?.zombieMode ? "outline" : "destructive"} 
              size="sm" 
              className="w-full mt-2"
              onClick={() => handleStateChange({ zombieMode: !state?.zombieMode })}
            >
              {state?.zombieMode ? 'Deactivate Rest Mode' : 'Trigger Rest Mode'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold">Task Completion</CardDescription>
            <CardTitle className="text-5xl">{completionRate}%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-secondary h-2 mt-4 rounded-full overflow-hidden">
              <div className="bg-primary h-full" style={{ width: `${completionRate}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-right">{completedCount} of {totalCount} tasks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-widest font-bold">Haldol Cycle</CardDescription>
            <CardTitle className="text-5xl">Day {haldol?.cycleDay || '-'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mt-2">Next: {haldol ? format(new Date(haldol.nextInjectionDate), 'MMM dd') : '--'}</p>
            {haldol?.isZombiePhase && <Badge variant="destructive" className="mt-2">High Symptom Phase</Badge>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Active Broadcast Message</CardTitle>
          <CardDescription>Displayed prominently on Pops' screen.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input 
              defaultValue={state?.activeMessage || ''}
              id="activeMsgInput"
              className="font-display text-xl"
              placeholder="Enter motivational quote or instruction..."
            />
            <Button onClick={() => {
              const val = (document.getElementById('activeMsgInput') as HTMLInputElement).value;
              handleStateChange({ activeMessage: val });
            }}>
              Broadcast
            </Button>
          </div>
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
  const [editingTask, setEditingTask] = useState<any>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      quarter: formData.get('quarter') as 'Q1'|'Q2'|'Q3'|'Q4',
      timeLabel: formData.get('timeLabel') as string,
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      voiceScript: formData.get('voiceScript') as string,
      order: parseInt(formData.get('order') as string, 10),
    };

    if (editingTask) {
      updateTask.mutate({ id: editingTask.id, data }, {
        onSuccess: () => { setIsModalOpen(false); toast({ title: "Task updated" }); }
      });
    } else {
      createTask.mutate({ data }, {
        onSuccess: () => { setIsModalOpen(false); toast({ title: "Task created" }); }
      });
    }
  };

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

  return (
    <div>
      <header className="mb-8 border-b border-border/50 pb-4 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Schedule Editor</h2>
          <p className="text-muted-foreground">Manage daily tasks and routine blocks.</p>
        </div>
        <Button onClick={() => { setEditingTask(null); setIsModalOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Task
        </Button>
      </header>

      <div className="space-y-8">
        {quarters.map(q => {
          const qTasks = schedule?.filter(t => t.quarter === q).sort((a, b) => a.order - b.order) || [];
          return (
            <Card key={q}>
              <CardHeader className="bg-secondary/50 py-3">
                <CardTitle className="text-2xl">{q} Tasks</CardTitle>
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
                      {qTasks.map(task => (
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
                          <td className="px-6 py-4 text-right space-x-2 flex justify-end">
                            {!task.isCompleted && (
                              <Button size="icon" variant="outline" className="h-8 w-8 text-success hover:bg-success/20 hover:text-success border-success/30" onClick={() => completeTask.mutate({ id: task.id })}>
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { setEditingTask(task); setIsModalOpen(true); }}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => { if(confirm('Delete task?')) deleteTask.mutate({ id: task.id }); }}>
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
              <select name="quarter" defaultValue={editingTask?.quarter || 'Q1'} className="flex h-10 w-full rounded-sm border border-border bg-input px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
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
            <Input name="order" type="number" defaultValue={editingTask?.order || 0} required />
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

  const handleLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      ptsdTrigger: formData.get('ptsdTrigger') === 'on',
      hallucinationIntensity: parseInt(formData.get('hallucinationIntensity') as string, 10),
      motivationLevel: parseInt(formData.get('motivationLevel') as string, 10),
      behaviorNotes: formData.get('behaviorNotes') as string,
      loggedBy: 'Raymo'
    };

    createLog.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Symptom logged successfully" });
        (e.target as HTMLFormElement).reset();
      }
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
                  <span className="text-primary font-display text-xl px-2 bg-secondary rounded" id="hi-val">0</span>
                </label>
                <input 
                  type="range" name="hallucinationIntensity" min="0" max="5" defaultValue="0" 
                  className="w-full accent-primary" 
                  onChange={(e) => document.getElementById('hi-val')!.innerText = e.target.value}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold uppercase text-muted-foreground flex items-center justify-between">
                  Motivation Level (1-5)
                  <span className="text-primary font-display text-xl px-2 bg-secondary rounded" id="ml-val">3</span>
                </label>
                <input 
                  type="range" name="motivationLevel" min="1" max="5" defaultValue="3" 
                  className="w-full accent-primary"
                  onChange={(e) => document.getElementById('ml-val')!.innerText = e.target.value}
                />
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
            logs?.map(log => (
              <Card key={log.id} className={log.ptsdTrigger ? 'border-destructive/50 border-l-4 border-l-destructive' : ''}>
                <CardContent className="p-4 flex gap-4">
                  <div className="shrink-0 text-center w-20 p-2 bg-secondary rounded border border-border/50">
                    <div className="text-xs text-muted-foreground uppercase font-bold">Time</div>
                    <div className="text-lg font-display text-primary">{format(new Date(log.loggedAt), 'HH:mm')}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(log.loggedAt), 'MM/dd')}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex gap-2 mb-2">
                      <Badge variant={log.hallucinationIntensity > 2 ? 'destructive' : 'secondary'}>
                        Intensity: {log.hallucinationIntensity}/5
                      </Badge>
                      <Badge variant={log.motivationLevel < 3 ? 'destructive' : 'default'}>
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

  const handlePatch = (id: number, currentTone: string) => {
    const textInput = document.getElementById(`script-text-${id}`) as HTMLInputElement;
    const toneInput = document.getElementById(`script-tone-${id}`) as HTMLSelectElement;
    
    updateScript.mutate({ 
      id, 
      data: { 
        scriptText: textInput.value,
        tone: toneInput.value as any,
        patchNote: "Live admin override"
      }
    }, {
      onSuccess: () => {
        setEditingId(null);
        toast({ title: "Script patched successfully. Jessica updated." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <header className="mb-8 border-b border-border/50 pb-4">
        <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Live Voice Scripts</h2>
        <p className="text-muted-foreground">Patch Jessica's AI prompts in real-time based on Pops' condition.</p>
      </header>

      <div className="grid gap-4">
        {scripts?.map(script => (
          <Card key={script.id} className={`transition-all ${editingId === script.id ? 'border-primary shadow-[0_0_20px_rgba(251,191,36,0.1)]' : ''}`}>
            <CardHeader className="py-3 flex flex-row items-center justify-between bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${script.isActive ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
                <CardTitle className="text-xl">{script.label} <span className="text-xs text-muted-foreground ml-2 font-sans tracking-normal">[{script.taskKey}]</span></CardTitle>
              </div>
              <Badge variant="outline">{script.tone}</Badge>
            </CardHeader>
            <CardContent className="p-4">
              {editingId === script.id ? (
                <div className="space-y-4">
                  <Input 
                    id={`script-text-${script.id}`}
                    defaultValue={script.scriptText} 
                    className="font-sans font-bold text-primary"
                  />
                  <div className="flex gap-4">
                    <select id={`script-tone-${script.id}`} defaultValue={script.tone} className="h-10 rounded-sm border border-border bg-input px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      {['gentle', 'grounding', 'urgent', 'encouraging', 'calm'].map(t => (
                        <option key={t} value={t}>{t.toUpperCase()}</option>
                      ))}
                    </select>
                    <Button onClick={() => handlePatch(script.id, script.tone)} disabled={updateScript.isPending}>
                      Deploy Patch
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center gap-4">
                  <p className="font-sans text-lg text-foreground/90 border-l-2 border-primary/50 pl-4 py-1 italic">"{script.scriptText}"</p>
                  <Button variant="outline" size="sm" onClick={() => setEditingId(script.id)}>Edit / Patch</Button>
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
        lastInjectionDate: formData.get('lastInjectionDate') as string,
        notes: formData.get('notes') as string,
      }
    }, {
      onSuccess: () => toast({ title: "Cycle tracking updated" })
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
                <div className="text-8xl font-display text-primary tracking-wider">{haldol.cycleDay}<span className="text-4xl text-muted-foreground">/14</span></div>
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
                <p className="text-3xl font-display text-foreground">{format(new Date(haldol.nextInjectionDate), 'EEEE, MMMM do')}</p>
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
                  <Input 
                    type="date" 
                    name="lastInjectionDate" 
                    defaultValue={haldol.lastInjectionDate}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase text-muted-foreground">Clinical Notes</label>
                  <textarea 
                    name="notes" 
                    defaultValue={haldol.notes || ''}
                    className="flex min-h-[120px] w-full rounded-sm border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    placeholder="Observations around injection time..."
                  />
                </div>
                <Button type="submit" className="w-full" disabled={updateHaldol.isPending}>
                  Reset & Save Cycle
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
