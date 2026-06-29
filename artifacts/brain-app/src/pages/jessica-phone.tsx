import { useState, useRef, useEffect, useCallback } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, ChevronLeft, Send, Trash2 } from "lucide-react";
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

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

function parseDeviceCommand(text: string): DeviceCommandResult | null {
  const match = text.match(/<device_command>([\s\S]*?)<\/device_command>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function stripDeviceCommand(text: string): string {
  return text.replace(/<device_command>[\s\S]*?<\/device_command>/g, "").trim();
}

export function JessicaPhone() {
  const [callState, setCallState] = useState<"idle" | "calling" | "connected" | "ended">("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [deviceCommandResult, setDeviceCommandResult] = useState<DeviceCommandResult | null>(null);
  const [healthDataCount, setHealthDataCount] = useState(0);
  const [quietWindowMessage, setQuietWindowMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const synth = useRef<SpeechSynthesis | null>(null);
  const { data: aiModelStatus } = useGetAiModel({ query: { refetchInterval: 10000 } });
  const activeModelLabel = (aiModelStatus as any)?.models?.find((m: any) => m.id === (aiModelStatus as any)?.activeModel)?.label ?? "Gemini 2.5 Flash";
  const activeModelId = (aiModelStatus as any)?.activeModel ?? "gemini";

  useEffect(() => {
    synth.current = window.speechSynthesis;
    return () => synth.current?.cancel();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const speak = useCallback((text: string) => {
    if (!ttsEnabled || isMuted || !synth.current) return;
    synth.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.1;
    utterance.volume = 0.9;
    const voices = synth.current.getVoices();
    const preferred = voices.find((v) => v.name.includes("Samantha") || v.name.includes("Karen") || v.name.includes("Google US English Female"));
    if (preferred) utterance.voice = preferred;
    synth.current.speak(utterance);
  }, [ttsEnabled, isMuted]);

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
        if (res.status === 423 && body.error === "quiet_window") {
          setQuietWindowMessage(body.message ?? "Jessica is in quiet mode right now.");
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
      }, 1500);
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
      setHealthDataCount(0);
    }, 2000);
  };

  const sendMessage = async () => {
    if (!input.trim() || isStreaming || !conversationId) return;
    const userContent = input.trim();
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
        body: JSON.stringify({ content: userContent }),
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
            if (data.done) {
              const cmd = data.deviceCommand ?? parseDeviceCommand(fullContent);
              if (cmd) {
                setDeviceCommandResult(cmd);
                executeDeviceCommand(cmd);
              }
              if (data.healthDataCount) {
                setHealthDataCount((prev) => prev + (data.healthDataCount as number));
              }
              const cleanContent = stripDeviceCommand(fullContent);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: cleanContent, deviceCommand: cmd ?? undefined }
                    : m
                )
              );
              speak(cleanContent);
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

  if (callState === "idle" || callState === "ended") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-center space-y-8">
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
            <button
              onClick={startCall}
              className="group relative h-40 w-40 mx-auto rounded-full bg-primary/10 border-2 border-primary/40 flex items-center justify-center hover:bg-primary/20 hover:border-primary transition-all shadow-[0_0_60px_rgba(251,191,36,0.15)] hover:shadow-[0_0_80px_rgba(251,191,36,0.3)]"
            >
              <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping opacity-30" />
              <Phone className="h-16 w-16 text-primary group-hover:scale-110 transition-transform" />
            </button>
          )}

          {callState === "idle" && !quietWindowMessage && (
            <div className="space-y-2">
              <p className="text-muted-foreground/50 text-sm uppercase tracking-widest font-display">
                Tap to Call Jessica
              </p>
              <div className="flex justify-center">
                <span className={`px-3 py-1 rounded-sm border text-xs font-display uppercase tracking-widest ${activeModelId === "gemini" ? "border-primary/30 text-primary/60 bg-primary/5" : "border-amber-500/30 text-amber-400/70 bg-amber-500/5"}`}>
                  {activeModelLabel}
                </span>
              </div>
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
          <h1 className="text-5xl font-display font-bold text-primary tracking-widest uppercase animate-pulse">
            CALLING...
          </h1>
          <div className="h-32 w-32 mx-auto rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center shadow-[0_0_60px_rgba(251,191,36,0.2)]">
            <Phone className="h-14 w-14 text-primary animate-bounce" />
          </div>
          <p className="text-muted-foreground font-display uppercase tracking-widest">Jessica AI — Connecting</p>
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
          {healthDataCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-success/10 border border-success/30 rounded-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-display text-success uppercase tracking-widest">{healthDataCount} health data point{healthDataCount !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-2 rounded-sm border transition-colors ${isMuted ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`p-2 rounded-sm border transition-colors ${ttsEnabled ? "border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            title="Toggle voice responses"
          >
            {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
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
            Device Command Dispatched — {deviceCommandResult.device.replace(/_/g, " ")} → {deviceCommandResult.action}{deviceCommandResult.value !== undefined ? ` (${deviceCommandResult.value})` : ""}
          </p>
          <button onClick={() => setDeviceCommandResult(null)} className="ml-auto text-muted-foreground hover:text-foreground">
            <Trash2 size={14} />
          </button>
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

      <div className="bg-card border-t border-border px-6 py-4 shrink-0">
        <div className="flex gap-3">
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
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-3 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground/40 mt-2 font-display uppercase tracking-widest">
          {ttsEnabled ? "Speaker ON — Jessica will speak responses" : "Speaker OFF — tap 🔊 to enable voice"}
        </p>
      </div>
    </div>
  );
}
