import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Mic, Activity, Radio, Cpu } from "lucide-react";
import { useGetActiveScripts } from "@workspace/api-client-react";

export function JessicaView() {
  const [time, setTime] = useState(new Date());
  const { data: scripts, isLoading } = useGetActiveScripts({ query: { refetchInterval: 10000 } });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background text-primary font-sans overflow-hidden scanline flex flex-col selection:bg-primary/20">
      {/* Terminal Header */}
      <header className="border-b border-primary/30 p-4 flex justify-between items-center bg-primary/5">
        <div className="flex items-center gap-4">
          <div className="relative flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-primary"></span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-widest uppercase flex items-center gap-2">
              <Cpu size={24} /> JESSICA_VOICE_GATEWAY // SYS.ONLINE
            </h1>
            <p className="text-xs opacity-70">AWAITING TRIGGER EVENTS...</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl tracking-wider">{format(time, 'HH:mm:ss.SSS')}</div>
          <div className="text-xs opacity-70 uppercase">{format(time, 'yyyy-MM-dd')}</div>
        </div>
      </header>

      {/* Main Terminal View */}
      <main className="flex-1 p-6 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center gap-3 opacity-70">
            <Activity className="animate-spin" /> FETCHING SCRIPT MANIFEST...
          </div>
        ) : (
          <div className="space-y-6 max-w-5xl">
            <div className="border border-primary/30 bg-primary/5 p-4 mb-8">
              <h2 className="uppercase tracking-widest mb-2 font-bold border-b border-primary/30 pb-2 flex items-center gap-2">
                <Radio size={18} /> Active Script Manifest ({scripts?.length || 0})
              </h2>
              <div className="grid grid-cols-[1fr_3fr_1fr] gap-4 text-xs font-bold uppercase tracking-widest mt-4 opacity-50 px-2">
                <div>Trigger Key / Tone</div>
                <div>Loaded Output String</div>
                <div className="text-right">Last Patch</div>
              </div>
            </div>

            {scripts?.map((script, i) => (
              <div key={script.id} className="grid grid-cols-[1fr_3fr_1fr] gap-4 items-start border-l-2 border-primary/50 pl-4 py-2 hover:bg-primary/10 transition-colors group">
                <div>
                  <div className="font-bold text-lg">{script.taskKey}</div>
                  <div className="text-xs mt-1 border border-primary/40 inline-block px-1 rounded uppercase">T:{script.tone}</div>
                </div>
                <div className="text-lg relative">
                  <span className="text-primary/50 mr-2">{'>'}</span>
                  "{script.scriptText}"
                  {script.patchNote && (
                    <div className="text-xs mt-2 opacity-70 block italic">
                      // PATCH_NOTE: {script.patchNote}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs opacity-70 pt-1">
                  {script.lastPatched ? format(new Date(script.lastPatched), 'MM/dd HH:mm:ss') : 'SYSTEM_DEFAULT'}
                </div>
              </div>
            ))}

            {scripts?.length === 0 && (
              <div className="opacity-50 text-center py-10 border border-dashed border-primary/30">
                [ EMPTY_MANIFEST - NO ACTIVE SCRIPTS ]
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="p-2 border-t border-primary/30 text-xs opacity-50 flex justify-between items-center bg-primary/5">
        <div>SYS_MEM: OK</div>
        <div className="flex items-center gap-2"><Mic size={14}/> CONNECTION: STABLE</div>
        <div>UPLINK: 42ms</div>
      </footer>
    </div>
  );
}
