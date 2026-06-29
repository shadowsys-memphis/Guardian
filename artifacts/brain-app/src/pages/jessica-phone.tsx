import { useState, useRef, useEffect, useCallback } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Send, Trash2, Zap, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useGetAiModel } from "@workspace/api-client-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  deviceCommand?: { device: string; action: string; value?: number };
}

interface DeviceCommandResult {
  device: string;
  action: string;
  value?: number;
}

interface ParsedAction {
  type: string;
  payload: Record<string, unknown>;
  raw: string;
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

const SPEECH_PRESETS = [
  "How is Pops feeling right now?",
  "Did he take his medication?",
  "Any hallucinations today?",
  "Schedule update for this afternoon",
  "Add a reminder to give water",
  "How's his appetite been?",
];

function parseDeviceCommand(text: string): DeviceCommandResult | null {
  const match = text.match(/<device_command>([\s\S]*?)<\/device_command>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function parseActionBlocks(text: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  const regex = /---ACTION---\s*([\s\S]*?)\s*---END_ACTION---/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      actions.push({ type: parsed.type ?? "UNKNOWN", payload: parsed, raw: match[1] });
    } catch {
      const typeMatch = match[1].match(/type[:\s"]+([A-Z_]+)/);
      actions.push({ type: typeMatch?.[1] ?? "COMMAND", payload: {}, raw: match[1] });
    }
  }
  return actions;
}

function stripSystemTags(text: string): string {
  return text
    .replace(/<device_command>[\s\S]*?<\/device_command>/g, "")
    .replace(/---ACTION---[\s\S]*?---END_ACTION---/g, "")
    .trim();
}

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-1 h-8">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-full bg-primary transition-all ${active ? "animate-waveform" : "h-1 opacity-30"}`}
          style={active ? {
            height: `${20 + Math.sin(i * 0.8) * 12}px`,
            animationDelay: `${i * 0.1}s`,
            animationDuration: `${0.6 + (i % 3) * 0.2}s`,
          } : {}}
        />
      ))}
    </div>
  );
}

export function JessicaPhone() {
  const [callState, setCallState] = useState<"idle" | "calling" | "connected" | "ended">("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [deviceCommandResult, setDeviceCommandResult] = useState<DeviceCommandResult | null>(null);
  const [actionStream, setActionStream] = useState<ParsedAction[]>([]);
  const [healthDataCount, setHealthDataCount] = useState(0);
  const [quietWindowMessage, setQuietWindowMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const synth = useRef<SpeechSynthesis | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const { data: aiModelStatus } = useGetAiModel({ query: { refetchInterval: 10000 } });
  const activeModelLabel = (aiModelStatus as any)?.models?.find((m: any) => m.id === (aiModelStatus as any)?.activeModel)?.label ?? "Gemini 2.5 Flash";
  const activeModelId = (aiModelStatus as any)?.activeModel ?? "gemini";
  const isLocalModel = activeModelId !== "gemini";
  const [lmStatus, setLmStatus] = useState<"unchecked" | "checking" | "connected" | "unreachable">("unchecked");

  useEffect(() => {
    if (!isLocalModel) { setLmStatus("unchecked"); return; }
    setLmStatus("checking");
    fetch(`${BASE_URL}/api/ai-model/test-connection`)
      .then((r) => r.json())
      .then((d: any) => setLmStatus(d?.connected ? "connected" : "unreachable"))
      .catch(() => setLmStatus("unreachable"));
  }, [isLocalModel]);

  useEffect(() => {
    synth.current = window.speechSynthesis;
    return () => synth.current?.cancel();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const playBase64Audio = useCallback((base64: string) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      ctx.decodeAudioData(bytes.buffer, (buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      });
    } catch {
      // AudioContext not supported or blocked
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!speakerOn || isMuted) return;
    if (synth.current) {
      synth.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      utterance.volume = 0.9;
      const voices = synth.current.getVoices();
      const preferred = voices.find((v) => v.name.includes("Samantha") || v.name.includes("Karen") || v.name.includes("Google US English Female"));
      if (preferred) utterance.voice = preferred;
      synth.current.speak(utterance);
    }
  }, [speakerOn, isMuted]);

  const startCall = async () => {
    setCallState("calling");
    setQuietWindowMessage(null);
    try {
      const res = await fetch(`${BASE_URL}/api/gemini/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Jessica Call — ${format(new Date(), "MMM dd HH:mm")}` }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 423 && (body as any).error === "quiet_window") {
          setQuietWindowMessage((body as any).message ?? "Jessica is in quiet mode right now.");
        }
        setCallState("idle");
        return;
      }
      const convo = await res.json();
      setConversationId(convo.id);
      setTimeout(() => {
        setCallState("connected");
        const greeting: Message = {
          id: "greeting",
          role: "assistant",
          content: "Hey, this is Jessica. I'm here. What do you need?",
          createdAt: new Date(),
        };
        setMessages([greeting]);
        speak(greeting.content);
      }, 1800);
    } catch {
      setCallState("idle");
    }
  };

  const endCall = async () => {
    synth.current?.cancel();
    if (conversationId) {
      try {
        await fetch(`${BASE_URL}/api/gemini/conversations/${conversationId}/end`, { method: "POST" });
      } catch {}
    }
    setCallState("ended");
    setTimeout(() => {
      setCallState("idle");
      setMessages([]);
      setConversationId(null);
      setDeviceCommandResult(null);
      setActionStream([]);
      setHealthDataCount(0);
    }, 2000);
  };

  const sendMessage = async (overrideContent?: string) => {
    const userContent = (overrideContent ?? input).trim();
    if (!userContent || isStreaming || !conversationId) return;
    setInput("");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userContent,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", createdAt: new Date() },
    ]);

    try {
      const response = await fetch(`${BASE_URL}/api/gemini/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userContent, speak: speakerOn && !isMuted }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              fullContent += data.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullContent } : m
                )
              );
            }
            if (data.audio && speakerOn && !isMuted) {
              playBase64Audio(data.audio);
            }
            if (data.done) {
              const cmd = data.deviceCommand ?? parseDeviceCommand(fullContent);
              const actions = parseActionBlocks(fullContent);
              if (cmd) {
                setDeviceCommandResult(cmd);
                executeDeviceCommand(cmd);
              }
              if (actions.length > 0) {
                setActionStream((prev) => [...prev, ...actions]);
                dispatchActions(actions);
              }
              if (data.healthDataCount) {
                setHealthDataCount((prev) => prev + (data.healthDataCount as number));
              }
              const cleanContent = stripSystemTags(fullContent);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: cleanContent, deviceCommand: cmd ?? undefined }
                    : m
                )
              );
              if (!data.audio) speak(cleanContent);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }
  };

  const executeDeviceCommand = async (cmd: DeviceCommandResult) => {
    try {
      const body: Record<string, unknown> = {};
      if (cmd.action === "on") body.isOn = true;
      else if (cmd.action === "off") body.isOn = false;
      else if (cmd.action === "volume") body.volume = cmd.value;
      else if (cmd.action === "brightness") body.brightness = cmd.value;
      await fetch(`${BASE_URL}/api/smarthome/devices/${cmd.device}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error("Device command failed:", err);
    }
  };

  const dispatchActions = async (actions: ParsedAction[]) => {
    for (const action of actions) {
      try {
        if (action.type === "ADD_EVENT") {
          await fetch(`${BASE_URL}/api/schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: (action.payload as any).title ?? "Event", quarter: "Q1" }),
          });
        } else if (action.type === "TOGGLE_SMART_DEVICE") {
          const device = (action.payload as any).device;
          const isOn = (action.payload as any).state === "on";
          if (device) {
            await fetch(`${BASE_URL}/api/smarthome/devices/${device}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isOn }),
            });
          }
        } else if (action.type === "ADD_TASK") {
          await fetch(`${BASE_URL}/api/schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: (action.payload as any).title ?? "Task", quarter: "Q1" }),
          });
        }
      } catch {
        // best-effort dispatch
      }
    }
  };

  const ACTION_TYPE_COLORS: Record<string, string> = {
    ADD_EVENT: "text-primary border-primary/30",
    TOGGLE_SMART_DEVICE: "text-yellow-400 border-yellow-500/30",
    ADD_TASK: "text-success border-success/30",
    COMMAND: "text-muted-foreground border-border",
  };

  if (callState === "idle" || callState === "ended") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-center space-y-8 max-w-sm w-full px-6">
          <div className="space-y-2">
            <h1 className="text-5xl font-display font-bold text-primary tracking-widest uppercase">
              JESSICA
            </h1>
            <p className="text-muted-foreground uppercase tracking-widest font-display text-sm">
              AI Voice Coordinator
            </p>
          </div>

          {callState === "ended" ? (
            <div className="space-y-4">
              <div className="h-32 w-32 mx-auto rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center">
                <PhoneOff className="h-14 w-14 text-destructive" />
              </div>
              <p className="text-destructive font-display uppercase tracking-widest">Call Ended</p>
            </div>
          ) : (
            <div className="space-y-6">
              <button
                onClick={startCall}
                className="group relative h-40 w-40 mx-auto rounded-full bg-primary/10 border-2 border-primary/40 flex flex-col items-center justify-center gap-2 hover:bg-primary/20 hover:border-primary transition-all shadow-[0_0_60px_rgba(251,191,36,0.15)] hover:shadow-[0_0_80px_rgba(251,191,36,0.3)]"
              >
                <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping opacity-30" />
                <Phone className="h-12 w-12 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-xs font-display uppercase tracking-widest text-primary/70">Connect</span>
              </button>

              <div className="space-y-1">
                <p className="text-muted-foreground/50 text-xs uppercase tracking-widest font-display text-center">
                  Tap to connect Twilio line
                </p>
                <p className="text-muted-foreground/30 text-xs text-center font-display">
                  Secure tunnel · AI-assisted care coordination
                </p>
              </div>
            </div>
          )}

          {callState === "idle" && !quietWindowMessage && (
            <div className="flex justify-center">
              <button
                onClick={() => {
                  if (!isLocalModel) return;
                  setLmStatus("checking");
                  fetch(`${BASE_URL}/api/ai-model/test-connection`)
                    .then((r) => r.json())
                    .then((d: any) => setLmStatus(d?.connected ? "connected" : "unreachable"))
                    .catch(() => setLmStatus("unreachable"));
                }}
                className={`flex items-center gap-2 px-3 py-1 rounded-sm border text-xs font-display uppercase tracking-widest ${activeModelId === "gemini" ? "border-primary/30 text-primary/60 bg-primary/5 cursor-default" : "border-amber-500/30 text-amber-400/70 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"}`}
              >
                {isLocalModel && (
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      lmStatus === "checking" ? "bg-muted-foreground animate-pulse" :
                      lmStatus === "connected" ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" :
                      lmStatus === "unreachable" ? "bg-destructive" :
                      "bg-muted-foreground/40"
                    }`}
                  />
                )}
                {activeModelLabel}
              </button>
            </div>
          )}

          {quietWindowMessage && (
            <div className="max-w-sm mx-auto px-6 py-3 bg-secondary/60 border border-border rounded-sm text-center">
              <p className="text-xs font-display text-muted-foreground uppercase tracking-widest mb-1">Quiet Mode Active</p>
              <p className="text-sm text-foreground/70">{quietWindowMessage}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (callState === "calling") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-display font-bold text-primary tracking-widest uppercase animate-pulse">
              Bridging Secure Twilio Tunnel...
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-display">
              Establishing encrypted connection
            </p>
          </div>

          <div className="h-32 w-32 mx-auto rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center shadow-[0_0_60px_rgba(251,191,36,0.2)]">
            <WaveformBars active={true} />
          </div>

          <div className="flex justify-center">
            <WaveformBars active={true} />
          </div>

          <button
            onClick={endCall}
            className="flex items-center gap-2 px-6 py-3 bg-destructive/10 hover:bg-destructive/20 border border-destructive/40 text-destructive rounded-sm font-display text-sm uppercase tracking-widest transition-colors"
          >
            <PhoneOff size={16} /> Hang Up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="h-3 w-3 rounded-full bg-success animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
          <div>
            <p className="text-xl font-display font-bold text-primary tracking-widest uppercase">JESSICA ACTIVE</p>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              {activeModelLabel} · br(AI)n Coordinator
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1 ml-2">
            <WaveformBars active={isStreaming} />
          </div>
          {healthDataCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-success/10 border border-success/30 rounded-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-display text-success uppercase tracking-widest">
                {healthDataCount} health point{healthDataCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-2 rounded-sm border transition-colors ${isMuted ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground hover:text-foreground"}`}
            title={isMuted ? "Unmute mic" : "Mute mic"}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            onClick={() => setSpeakerOn(!speakerOn)}
            className={`p-2 rounded-sm border transition-colors ${speakerOn ? "border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            title={speakerOn ? "Speaker ON — click to mute TTS" : "Speaker OFF — click to enable voice"}
          >
            {speakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            onClick={endCall}
            className="flex items-center gap-2 px-4 py-2 bg-destructive/10 hover:bg-destructive/20 border border-destructive/40 text-destructive rounded-sm font-display text-sm uppercase tracking-widest transition-colors"
          >
            <PhoneOff size={16} />
            End
          </button>
        </div>
      </header>

      {deviceCommandResult && (
        <div className="bg-primary/10 border-b border-primary/20 px-6 py-2 flex items-center gap-3 shrink-0">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <p className="text-xs font-display text-primary uppercase tracking-widest">
            Device — {deviceCommandResult.device.replace(/_/g, " ")} → {deviceCommandResult.action}
            {deviceCommandResult.value !== undefined ? ` (${deviceCommandResult.value})` : ""}
          </p>
          <button onClick={() => setDeviceCommandResult(null)} className="ml-auto text-muted-foreground hover:text-foreground">
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {actionStream.length > 0 && (
        <div className="border-b border-border/30 bg-secondary/20 px-6 py-2 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={12} className="text-primary" />
            <span className="text-xs font-display uppercase tracking-widest text-muted-foreground">Action Stream</span>
            <button onClick={() => setActionStream([])} className="ml-auto text-muted-foreground hover:text-foreground">
              <Trash2 size={12} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {actionStream.map((action, i) => (
              <div
                key={i}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-sm border text-xs font-display ${ACTION_TYPE_COLORS[action.type] ?? ACTION_TYPE_COLORS.COMMAND}`}
              >
                <ChevronRight size={10} />
                {action.type}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-sm px-5 py-4 space-y-1 ${
              msg.role === "user"
                ? "bg-primary/10 border border-primary/20"
                : "bg-card border border-border"
            }`}>
              <p className={`text-xs font-display uppercase tracking-widest mb-2 ${msg.role === "user" ? "text-primary/60" : "text-muted-foreground"}`}>
                {msg.role === "user" ? "YOU" : "JESSICA"}
              </p>
              <p className={`font-display text-lg leading-relaxed ${msg.role === "user" ? "text-primary" : "text-foreground"}`}>
                {msg.content || (
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce">·</span>
                    <span className="animate-bounce [animation-delay:0.1s]">·</span>
                    <span className="animate-bounce [animation-delay:0.2s]">·</span>
                  </span>
                )}
              </p>
              {msg.deviceCommand && (
                <div className="mt-2 pt-2 border-t border-border/30">
                  <p className="text-xs text-primary/60 font-display uppercase tracking-wider">
                    ⚡ {msg.deviceCommand.device.replace(/_/g, " ")} → {msg.deviceCommand.action}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-card border-t border-border shrink-0">
        <div className="px-6 pt-3 pb-1 flex flex-wrap gap-1.5">
          {SPEECH_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => sendMessage(preset)}
              disabled={isStreaming}
              className="px-2.5 py-1 text-xs font-display uppercase tracking-wide rounded-sm border border-border/40 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-40"
            >
              {preset}
            </button>
          ))}
        </div>
        <div className="px-6 py-3 flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Talk to Jessica..."
            disabled={isStreaming}
            className="flex-1 bg-secondary border border-border rounded-sm px-4 py-3 font-display text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-3 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground/40 px-6 pb-3 font-display uppercase tracking-widest">
          {speakerOn ? "Speaker ON — Jessica will speak responses" : "Speaker OFF — tap 🔊 to enable voice"}
        </p>
      </div>
    </div>
  );
}
