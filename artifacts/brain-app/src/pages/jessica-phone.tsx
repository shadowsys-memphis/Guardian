import { useState, useRef, useEffect, useCallback } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Send, Trash2, Zap, ChevronRight, Camera, ChevronDown, X, CheckCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useGetAiModel, getGetAiModelQueryKey, useGetAppState, getGetAppStateQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

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
  error?: string;
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

const SPEECH_PRESETS_RAY = [
  "Order groceries",
  "What's in the cart?",
  "Commit cart",
  "Cancel cart",
  "How is Pops doing today?",
  "Schedule update for this afternoon",
];

const SPEECH_PRESETS_POPS = [
  "How are you feeling right now?",
  "Did you take your medication?",
  "Any rough moments today?",
  "What sounds good for dinner?",
  "How's your sleep been?",
  "Anything bothering you?",
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
  const [awaitingCartApproval, setAwaitingCartApproval] = useState(false);
  const [mode, setMode] = useState<"ray" | "pops">(() => (localStorage.getItem("jessica_mode") as "ray" | "pops") ?? "ray");
  const [quietWindowMessage, setQuietWindowMessage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionResult, setVisionResult] = useState<{
    instructions: string[];
    medicationChanges: Array<{ medication: string; change: string; dose: string | null }>;
    tasks: string[];
    appointment: { date: string | null; time: string | null; provider: string | null; apptType: string; notes: string } | null;
    summary: string;
  } | null>(null);
  const [visionCommitted, setVisionCommitted] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const visionInputRef = useRef<HTMLInputElement>(null);
  const synth = useRef<SpeechSynthesis | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const { data: aiModelStatus } = useGetAiModel({ query: { queryKey: getGetAiModelQueryKey(), refetchInterval: 10000 } });
  const { data: appState } = useGetAppState({ query: { queryKey: getGetAppStateQueryKey() } });
  const activeQuarter: string = (appState as any)?.overrideQuarter ?? (appState as any)?.currentQuarter ?? "Q1";
  const activeModelLabel = (aiModelStatus as any)?.models?.find((m: any) => m.id === (aiModelStatus as any)?.activeModel)?.label ?? "Gemini 2.5 Flash";
  const activeModelId = (aiModelStatus as any)?.activeModel ?? "gemini";
  const isLocalModel = activeModelId !== "gemini";
  const [lmStatus, setLmStatus] = useState<"unchecked" | "checking" | "connected" | "unreachable">("unchecked");
  const { toast } = useToast();

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
    localStorage.setItem("jessica_mode", mode);
  }, [mode]);

  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setHasNewMessages(false);
    } else {
      setHasNewMessages(true);
    }
  }, [messages, isAtBottom]);

  const handleScrollMessages = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(atBottom);
    if (atBottom) setHasNewMessages(false);
  }, []);

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
        source.onended = () => setIsSpeaking(false);
        setIsSpeaking(true);
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
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
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
      setAwaitingCartApproval(false);
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
        body: JSON.stringify({ content: userContent, speak: speakerOn && !isMuted, mode }),
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
              // Actions come from the backend done payload (parsed from raw response before stripping)
              const actions: ParsedAction[] = Array.isArray(data.actions)
                ? (data.actions as any[]).map((a: any) => ({ type: a.type ?? "UNKNOWN", payload: a, raw: JSON.stringify(a) }))
                : parseActionBlocks(fullContent);
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
        if (action.type === "ADD_EVENT" || action.type === "ADD_TASK") {
          const p = action.payload as any;
          const now = new Date();
          const timeLabel: string = p.timeLabel ?? format(now, "HHmm");
          const order: number = typeof p.order === "number" ? p.order : now.getHours() * 100 + now.getMinutes();
          const res = await fetch(`${BASE_URL}/api/schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: p.title ?? (action.type === "ADD_EVENT" ? "Event" : "Task"),
              quarter: p.quarter ?? activeQuarter,
              timeLabel,
              order,
            }),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => res.statusText);
            throw new Error(`Schedule API ${res.status}: ${body}`);
          }
        } else if (action.type === "TOGGLE_SMART_DEVICE") {
          const device = (action.payload as any).device;
          const isOn = (action.payload as any).state === "on";
          if (device) {
            const res = await fetch(`${BASE_URL}/api/smarthome/devices/${device}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isOn }),
            });
            if (!res.ok) {
              const body = await res.text().catch(() => res.statusText);
              throw new Error(`SmartHome API ${res.status}: ${body}`);
            }
          }
        } else if (action.type === "GROCERY_ORDER") {
          const cartRes = await fetch(`${BASE_URL}/api/shopper/cart`);
          if (!cartRes.ok) throw new Error("Could not load cart");
          const cart = await cartRes.json() as any;
          const meals: any[] = cart.meals ?? [];
          const items: any[] = cart.items ?? [];
          const total = (cart.totalEstimatedCostCents ?? 0) / 100;
          const budget = (cart.budgetCents ?? 15000) / 100;
          let summary: string;
          if (meals.length === 0) {
            summary = "The cart is empty right now — no meals loaded for this week. Tell me which meals you want and I'll add them, or say 'add the standard meals' to load all five.";
          } else {
            const mealList = meals.map((m: any) => m.name).join(", ");
            summary = `Cart's ready — ${meals.length} meal${meals.length !== 1 ? "s" : ""}: ${mealList}. That's ${items.length} item${items.length !== 1 ? "s" : ""}, estimated $${total.toFixed(2)} of a $${budget.toFixed(2)} budget. Say "commit" to lock it in or "cancel" to dismiss.`;
          }
          const cartMsg: Message = {
            id: `cart-summary-${Date.now()}`,
            role: "assistant",
            content: summary,
            createdAt: new Date(),
          };
          setMessages((prev) => [...prev, cartMsg]);
          speak(summary);
          if (meals.length > 0) setAwaitingCartApproval(true);

        } else if (action.type === "ADD_MEAL_TO_CART") {
          const mealName = (action.payload as any).mealName as string;
          const mealsRes = await fetch(`${BASE_URL}/api/shopper/meals`);
          if (!mealsRes.ok) throw new Error("Could not load meals catalog");
          const allMeals = await mealsRes.json() as any[];
          const match = allMeals.find((m: any) =>
            m.name.toLowerCase().includes(mealName.toLowerCase()) ||
            mealName.toLowerCase().includes(m.name.toLowerCase())
          );
          if (!match) throw new Error(`Meal "${mealName}" not found in catalog`);
          const addRes = await fetch(`${BASE_URL}/api/shopper/cart/meals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mealId: match.id }),
          });
          if (!addRes.ok) {
            const body = await addRes.text().catch(() => addRes.statusText);
            throw new Error(`Could not add ${mealName}: ${body}`);
          }

        } else if (action.type === "APPROVE_CART") {
          const approveRes = await fetch(`${BASE_URL}/api/shopper/cart/approve`, { method: "POST" });
          if (!approveRes.ok) throw new Error("Could not approve cart");
          setAwaitingCartApproval(false);
          const confirmMsg: Message = {
            id: `cart-approved-${Date.now()}`,
            role: "assistant",
            content: "Order approved and locked in. Shopping list is set — let Ray know it's ready to execute.",
            createdAt: new Date(),
          };
          setMessages((prev) => [...prev, confirmMsg]);
          speak("Order approved and locked in.");

        } else if (action.type === "CANCEL_CART") {
          const cancelRes = await fetch(`${BASE_URL}/api/shopper/cart/dismiss`, { method: "POST" });
          if (!cancelRes.ok) throw new Error("Could not cancel cart");
          setAwaitingCartApproval(false);
          const cancelMsg: Message = {
            id: `cart-cancelled-${Date.now()}`,
            role: "assistant",
            content: "Cart dismissed — nothing was ordered. Let me know when you're ready to try again.",
            createdAt: new Date(),
          };
          setMessages((prev) => [...prev, cancelMsg]);
          speak("Cart dismissed — nothing was ordered.");

        } else if (action.type === "SCHEDULE_APPOINTMENT") {
          const p = action.payload as any;
          const res = await fetch(`${BASE_URL}/api/appointments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              appointmentDate: p.date,
              appointmentTime: p.time ?? "09:00",
              provider: p.provider ?? "Doctor",
              type: p.apptType ?? p.type_appt ?? "primary_care",
              notes: p.notes ?? null,
            }),
          });
          if (!res.ok) throw new Error("Could not save appointment");
          const apt = await res.json() as any;
          const confirmMsg: Message = {
            id: `appt-${Date.now()}`,
            role: "assistant",
            content: `Appointment logged — ${apt.provider} on ${apt.appointmentDate} at ${apt.appointmentTime}.`,
            createdAt: new Date(),
          };
          setMessages((prev) => [...prev, confirmMsg]);
          speak(`Got it — appointment with ${apt.provider} on ${apt.appointmentDate} has been logged.`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setActionStream((prev) =>
          prev.map((a, idx) => (idx === prev.length - 1 ? { ...a, error: msg } : a))
        );
        toast({ title: "Action dispatch failed", description: `${action.type}: ${msg}`, variant: "destructive" });
      }
    }
  };

  const ACTION_TYPE_COLORS: Record<string, string> = {
    ADD_EVENT: "text-primary border-primary/30",
    TOGGLE_SMART_DEVICE: "text-primary border-primary/30",
    ADD_TASK: "text-success border-success/30",
    MED_CONFIRMED: "text-success border-success/30",
    MED_REFUSED: "text-destructive border-destructive/30",
    WELLBEING_ALERT: "text-accent border-accent/30",
    GROCERY_ORDER: "text-warning border-warning/30",
    ADD_MEAL_TO_CART: "text-warning border-warning/30",
    APPROVE_CART: "text-success border-success/30",
    CANCEL_CART: "text-destructive border-destructive/30",
    SCHEDULE_APPOINTMENT: "text-primary border-primary/30",
    COMMAND: "text-muted-foreground border-border",
  };

  const handleVisionIntake = (file: File) => {
    setVisionLoading(true);
    setVisionResult(null);
    setVisionCommitted(new Set());
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        const mimeType = file.type || "image/jpeg";
        const res = await fetch(`${BASE_URL}/api/intake/vision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType }),
        });
        if (!res.ok) throw new Error(`Vision intake failed (${res.status})`);
        const data = await res.json();
        setVisionResult(data);
      } catch (err) {
        toast({ title: "Vision intake failed", description: String(err), variant: "destructive" });
      } finally {
        setVisionLoading(false);
      }
    };
    reader.onerror = () => {
      setVisionLoading(false);
      toast({ title: "Could not read file", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  };

  const commitVisionItem = async (key: string, title: string, quarter: string = "Q1") => {
    try {
      const res = await fetch(`${BASE_URL}/api/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, quarter, timeLabel: "0800", order: 99 }),
      });
      if (!res.ok) throw new Error(`Schedule API ${res.status}`);
      setVisionCommitted((prev) => new Set([...prev, key]));
      toast({ title: "Added to schedule", description: title });
    } catch (err) {
      toast({ title: "Could not add to schedule", description: String(err), variant: "destructive" });
    }
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
                className="group relative h-40 w-40 mx-auto rounded-full bg-primary/10 border-2 border-primary/40 flex flex-col items-center justify-center gap-2 hover:bg-primary/20 hover:border-primary transition-all shadow-[0_0_60px_rgba(70,159,104,0.15)] hover:shadow-[0_0_80px_rgba(70,159,104,0.3)]"
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
                className={`flex items-center gap-2 px-3 py-1 rounded-sm border text-xs font-display uppercase tracking-widest ${activeModelId === "gemini" ? "border-primary/30 text-primary/60 bg-primary/5 cursor-default" : "border-border text-muted-foreground/70 bg-secondary/50 hover:bg-secondary transition-colors"}`}
              >
                {isLocalModel && (
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      lmStatus === "checking" ? "bg-muted-foreground animate-pulse" :
                      lmStatus === "connected" ? "bg-success shadow-[0_0_6px_rgba(70,159,104,0.6)]" :
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

          <div className="h-32 w-32 mx-auto rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center shadow-[0_0_60px_rgba(70,159,104,0.2)]">
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
          <div className="h-3 w-3 rounded-full bg-success animate-pulse shadow-[0_0_10px_rgba(70,159,104,0.6)]" />
          <div>
            <p className="text-xl font-display font-bold text-primary tracking-widest uppercase">JESSICA ACTIVE</p>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              {activeModelLabel} · br(AI)n Coordinator
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1 ml-2">
            <WaveformBars active={isSpeaking || isStreaming} />
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
          <div className="flex items-center rounded-sm border border-border overflow-hidden">
            <button
              onClick={() => setMode("ray")}
              className={`px-3 py-1.5 font-display text-xs uppercase tracking-widest transition-colors ${mode === "ray" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Ray
            </button>
            <button
              onClick={() => setMode("pops")}
              className={`px-3 py-1.5 font-display text-xs uppercase tracking-widest transition-colors ${mode === "pops" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Pops
            </button>
          </div>
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

      {deviceCommandResult && mode !== "pops" && (
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

      {awaitingCartApproval && mode !== "pops" && (
        <div className="bg-success/10 border-b border-success/30 px-6 py-3 shrink-0">
          <p className="text-xs font-display text-success uppercase tracking-widest mb-2">Cart Ready — Awaiting Approval</p>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                await fetch(`${BASE_URL}/api/shopper/cart/approve`, { method: "POST" });
                setAwaitingCartApproval(false);
                const m: Message = { id: `cart-approved-${Date.now()}`, role: "assistant", content: "Order approved and locked in.", createdAt: new Date() };
                setMessages((prev) => [...prev, m]);
                speak("Order approved and locked in.");
              }}
              className="px-5 py-2 bg-success text-primary-foreground rounded-sm font-display text-sm uppercase tracking-widest hover:bg-success/90 transition-colors"
            >
              Commit Order
            </button>
            <button
              onClick={async () => {
                await fetch(`${BASE_URL}/api/shopper/cart/dismiss`, { method: "POST" });
                setAwaitingCartApproval(false);
                const m: Message = { id: `cart-cancelled-${Date.now()}`, role: "assistant", content: "Cart dismissed — nothing was ordered.", createdAt: new Date() };
                setMessages((prev) => [...prev, m]);
                speak("Cart dismissed.");
              }}
              className="px-5 py-2 border border-border text-muted-foreground rounded-sm font-display text-sm uppercase tracking-widest hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {actionStream.length > 0 && mode !== "pops" && (
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
                title={action.error ?? action.type}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-sm border text-xs font-display ${action.error ? "text-destructive border-destructive/40 line-through opacity-60" : (ACTION_TYPE_COLORS[action.type] ?? ACTION_TYPE_COLORS.COMMAND)}`}
              >
                <ChevronRight size={10} />
                {action.type}
                {action.error && <span className="ml-1 text-[9px] opacity-70">✕</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        ref={messagesContainerRef}
        onScroll={handleScrollMessages}
        className={`flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4 relative ${mode === "pops" ? "bg-amber-50/[0.03]" : ""}`}
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`rounded-sm px-5 py-4 space-y-1 ${
              mode === "pops" ? "max-w-[95%]" : "max-w-[80%]"
            } ${
              msg.role === "user"
                ? "bg-primary/10 border border-primary/20"
                : "bg-card border border-border"
            }`}>
              {mode !== "pops" && (
                <p className={`text-xs font-display uppercase tracking-widest mb-2 ${msg.role === "user" ? "text-primary/60" : "text-muted-foreground"}`}>
                  {msg.role === "user" ? "YOU" : "JESSICA"}
                </p>
              )}
              <p className={`font-display leading-relaxed ${
                mode === "pops" ? "text-2xl sm:text-3xl" : "text-lg"
              } ${msg.role === "user" ? "text-primary" : "text-foreground"}`}>
                {msg.content || (
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce">·</span>
                    <span className="animate-bounce [animation-delay:0.1s]">·</span>
                    <span className="animate-bounce [animation-delay:0.2s]">·</span>
                  </span>
                )}
              </p>
              {msg.deviceCommand && mode !== "pops" && (
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
        {hasNewMessages && !isAtBottom && (
          <div className="sticky bottom-4 flex justify-center pointer-events-none">
            <button
              onClick={() => {
                setIsAtBottom(true);
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-xs font-display uppercase tracking-widest shadow-lg hover:bg-primary/90 transition-colors"
            >
              <ChevronDown size={12} /> New message
            </button>
          </div>
        )}
      </div>

      {visionResult && mode === "ray" && (
        <div className="border-t border-border bg-card shrink-0 max-h-72 overflow-y-auto">
          <div className="px-6 py-3 flex items-center justify-between border-b border-border/40">
            <div className="flex items-center gap-2">
              <Camera size={14} className="text-primary" />
              <span className="text-xs font-display uppercase tracking-widest text-primary">Care Plan Intake</span>
            </div>
            <button onClick={() => setVisionResult(null)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <div className="px-6 py-3 space-y-3">
            <p className="text-xs text-muted-foreground font-display">{visionResult.summary}</p>

            {visionResult.instructions.length > 0 && (
              <div>
                <p className="text-xs font-display uppercase tracking-widest text-foreground/60 mb-1.5">Instructions</p>
                <div className="space-y-1">
                  {visionResult.instructions.map((ins, i) => {
                    const key = `instruction-${i}`;
                    const done = visionCommitted.has(key);
                    return (
                      <div key={i} className={`flex items-start gap-2 text-sm ${done ? "opacity-40" : ""}`}>
                        <CheckCircle size={12} className={`mt-0.5 shrink-0 ${done ? "text-success" : "text-muted-foreground"}`} />
                        <span className={done ? "line-through" : ""}>{ins}</span>
                        {!done && (
                          <button
                            onClick={() => commitVisionItem(key, ins)}
                            className="ml-auto text-[10px] font-display uppercase tracking-widest text-primary hover:underline shrink-0"
                          >
                            + Schedule
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {visionResult.medicationChanges.length > 0 && (
              <div>
                <p className="text-xs font-display uppercase tracking-widest text-foreground/60 mb-1.5">Medication Changes</p>
                <div className="space-y-1">
                  {visionResult.medicationChanges.map((mc, i) => {
                    const key = `medchange-${i}`;
                    const done = visionCommitted.has(key);
                    const label = `Med review: ${mc.medication} — ${mc.change}${mc.dose ? ` (${mc.dose})` : ""}`;
                    return (
                      <div key={i} className={`flex items-start gap-2 text-sm ${done ? "opacity-40" : ""}`}>
                        <AlertCircle size={12} className={`mt-0.5 shrink-0 ${done ? "text-success" : "text-warning"}`} />
                        <span className={done ? "line-through" : ""}><strong>{mc.medication}</strong> — {mc.change}{mc.dose ? ` (${mc.dose})` : ""}</span>
                        {!done && (
                          <button
                            onClick={() => commitVisionItem(key, label)}
                            className="ml-auto text-[10px] font-display uppercase tracking-widest text-primary hover:underline shrink-0"
                          >
                            + Schedule
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {visionResult.tasks.length > 0 && (
              <div>
                <p className="text-xs font-display uppercase tracking-widest text-foreground/60 mb-1.5">Follow-up Tasks</p>
                <div className="space-y-1">
                  {visionResult.tasks.map((task, i) => {
                    const key = `task-${i}`;
                    const done = visionCommitted.has(key);
                    return (
                      <div key={i} className={`flex items-start gap-2 text-sm ${done ? "opacity-40" : ""}`}>
                        <ChevronRight size={12} className={`mt-0.5 shrink-0 ${done ? "text-success" : "text-muted-foreground"}`} />
                        <span className={done ? "line-through" : ""}>{task}</span>
                        {!done && (
                          <button
                            onClick={() => commitVisionItem(key, task)}
                            className="ml-auto text-[10px] font-display uppercase tracking-widest text-primary hover:underline shrink-0"
                          >
                            + Schedule
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {visionResult.appointment?.provider && !visionCommitted.has("appointment") && (
              <div className="flex items-center gap-2 text-sm bg-primary/5 border border-primary/20 rounded-sm px-3 py-2">
                <CheckCircle size={12} className="text-primary shrink-0" />
                <span>
                  Appointment: <strong>{visionResult.appointment.provider}</strong>
                  {visionResult.appointment.date ? ` on ${visionResult.appointment.date}` : ""}
                  {visionResult.appointment.time ? ` at ${visionResult.appointment.time}` : ""}
                </span>
                <button
                  onClick={async () => {
                    const apt = visionResult.appointment!;
                    if (!apt.date || !apt.provider) return;
                    try {
                      const res = await fetch(`${BASE_URL}/api/appointments`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ appointmentDate: apt.date, appointmentTime: apt.time ?? "09:00", provider: apt.provider, type: apt.apptType ?? "primary_care", notes: apt.notes }),
                      });
                      if (!res.ok) throw new Error(`API ${res.status}`);
                      setVisionCommitted((prev) => new Set([...prev, "appointment"]));
                      toast({ title: "Appointment saved" });
                    } catch (err) {
                      toast({ title: "Could not save appointment", description: String(err), variant: "destructive" });
                    }
                  }}
                  className="ml-auto text-xs font-display uppercase tracking-widest text-primary hover:underline shrink-0"
                >
                  Log it
                </button>
              </div>
            )}
            {visionResult.appointment?.provider && visionCommitted.has("appointment") && (
              <div className="flex items-center gap-2 text-sm opacity-40">
                <CheckCircle size={12} className="text-success shrink-0" />
                <span className="line-through">Appointment logged — {visionResult.appointment.provider}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-card border-t border-border shrink-0">
        {mode !== "pops" && (
          <div className="px-4 sm:px-6 pt-3 pb-1 flex flex-wrap gap-1.5">
            {SPEECH_PRESETS_RAY.map((preset) => (
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
        )}
        <div className="px-4 sm:px-6 py-3 flex gap-2 sm:gap-3">
          {mode === "ray" && (
            <>
              <input
                ref={visionInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleVisionIntake(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => visionInputRef.current?.click()}
                disabled={visionLoading}
                title="Scan care plan or medical document"
                className="p-3 border border-border rounded-sm text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-40 shrink-0"
              >
                {visionLoading ? <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <Camera size={18} />}
              </button>
            </>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder={mode === "pops" ? "Talk to Jessica..." : "Talk to Jessica..."}
            disabled={isStreaming}
            className={`flex-1 bg-secondary border border-border rounded-sm px-4 font-display text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 ${mode === "pops" ? "py-4 text-xl" : "py-3"}`}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-3 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center gap-2 min-w-[48px] min-h-[48px] justify-center"
          >
            <Send size={18} />
          </button>
        </div>
        {mode !== "pops" && (
          <p className="text-xs text-muted-foreground/40 px-6 pb-3 font-display uppercase tracking-widest">
            {speakerOn ? "Speaker ON — Jessica will speak responses" : "Speaker OFF — tap 🔊 to enable voice"}
          </p>
        )}
      </div>
    </div>
  );
}
