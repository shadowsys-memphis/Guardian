import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Lock, Unlock, Eye, EyeOff, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useVault } from "@/lib/vault-context";
import { encrypt, decrypt, generateSalt, bufToBase64 } from "@/lib/crypto";

interface EncryptedMessage {
  id: number;
  sender: string;
  ciphertext: string;
  iv: string;
  salt: string;
  createdAt: string;
}

interface DecryptedMessage {
  id: number;
  sender: string;
  plaintext: string;
  createdAt: string;
  failed?: boolean;
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
const SENDER_NAME = "Raymo";

const SIMULATED_RESPONSES: Record<string, string[]> = {
  Pops: [
    "Got it, thanks.",
    "Okay.",
    "I'll try.",
    "What time?",
    "Not feeling great today.",
    "Alright.",
    "Can we do it later?",
  ],
  Ray: [
    "On my way.",
    "Check. Done.",
    "I saw that.",
    "Will handle it.",
    "Noted.",
    "Thanks for the update.",
  ],
};

const SIMULATED_SENDERS = ["Pops", "Ray"];

function randomSimulatedResponse(sender: string): string {
  const responses = SIMULATED_RESPONSES[sender] ?? ["..."];
  return responses[Math.floor(Math.random() * responses.length)];
}

export function IntercomView() {
  const { cryptoKey, isUnlocked } = useVault();
  const [rawMessages, setRawMessages] = useState<EncryptedMessage[]>([]);
  const [decrypted, setDecrypted] = useState<DecryptedMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/intercom/messages`);
      const data: EncryptedMessage[] = await res.json();
      setRawMessages(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (!cryptoKey || rawMessages.length === 0) {
      setDecrypted([]);
      return;
    }
    const decryptAll = async () => {
      const results: DecryptedMessage[] = [];
      for (const msg of rawMessages) {
        try {
          const plain = await decrypt(msg.ciphertext, msg.iv, cryptoKey);
          results.push({ id: msg.id, sender: msg.sender, plaintext: plain, createdAt: msg.createdAt });
        } catch {
          results.push({ id: msg.id, sender: msg.sender, plaintext: "[decryption failed]", createdAt: msg.createdAt, failed: true });
        }
      }
      setDecrypted(results);
    };
    decryptAll();
  }, [cryptoKey, rawMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [decrypted]);

  const sendMessage = async () => {
    if (!input.trim() || !cryptoKey || sending) return;
    const plaintext = input.trim();
    setInput("");
    setSending(true);

    try {
      const salt = generateSalt();
      const { ciphertext, iv } = await encrypt(plaintext, cryptoKey);

      await fetch(`${BASE_URL}/api/intercom/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: SENDER_NAME,
          ciphertext,
          iv,
          salt: bufToBase64(salt),
        }),
      });

      await fetchMessages();

      if (Math.random() > 0.4) {
        setTimeout(async () => {
          if (!cryptoKey) return;
          const simSender = SIMULATED_SENDERS[Math.floor(Math.random() * SIMULATED_SENDERS.length)];
          const simText = randomSimulatedResponse(simSender);
          const simSalt = generateSalt();
          const { ciphertext: simCt, iv: simIv } = await encrypt(simText, cryptoKey);
          await fetch(`${BASE_URL}/api/intercom/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: simSender,
              ciphertext: simCt,
              iv: simIv,
              salt: bufToBase64(simSalt),
            }),
          });
          await fetchMessages();
        }, 1500 + Math.random() * 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const SENDER_COLORS: Record<string, string> = {
    Raymo: "text-primary border-primary/20 bg-primary/5",
    Pops: "text-blue-400 border-blue-400/20 bg-blue-400/5",
    Ray: "text-green-400 border-green-400/20 bg-green-400/5",
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-sm border ${isUnlocked ? "border-primary/30 text-primary" : "border-muted-foreground/30 text-muted-foreground"}`}>
            {isUnlocked ? <Unlock size={20} /> : <Lock size={20} />}
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-primary tracking-widest uppercase">Intercom</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              {isUnlocked ? "E2EE Active — AES-256-GCM" : "Locked — Unlock to decrypt"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={`p-2 border rounded-sm text-xs font-display uppercase tracking-widest transition-colors flex items-center gap-1 ${showRaw ? "border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            title="Toggle raw ciphertext view"
          >
            {showRaw ? <Eye size={14} /> : <EyeOff size={14} />}
            {showRaw ? "Plain" : "Cipher"}
          </button>
          <button
            onClick={fetchMessages}
            className="p-2 border border-border rounded-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          </div>
        ) : rawMessages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground font-display uppercase tracking-widest">No messages yet.</p>
          </div>
        ) : showRaw ? (
          rawMessages.map((msg) => (
            <div key={msg.id} className="bg-secondary/30 border border-border/50 rounded-sm p-3 font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-primary font-bold">{msg.sender}</span>
                <span className="text-muted-foreground">{format(new Date(msg.createdAt), "HH:mm:ss")}</span>
              </div>
              <p className="text-muted-foreground/70 break-all">ct: {msg.ciphertext.slice(0, 48)}...</p>
              <p className="text-muted-foreground/50 break-all">iv: {msg.iv}</p>
            </div>
          ))
        ) : (
          decrypted.map((msg) => {
            const isMe = msg.sender === SENDER_NAME;
            const colorClass = SENDER_COLORS[msg.sender] ?? "text-foreground border-border/20 bg-secondary/20";
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-sm px-4 py-3 border ${colorClass} ${msg.failed ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <span className="text-xs font-display font-bold uppercase tracking-widest">{msg.sender}</span>
                    <span className="text-xs text-muted-foreground/50">{format(new Date(msg.createdAt), "HH:mm")}</span>
                  </div>
                  <p className="font-display text-base leading-relaxed">{msg.plaintext}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Lock size={10} className="text-muted-foreground/30" />
                    <span className="text-xs text-muted-foreground/30">encrypted</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-card border-t border-border px-6 py-4 shrink-0">
        {!isUnlocked ? (
          <p className="text-center text-muted-foreground font-display uppercase tracking-widest text-sm">
            Vault locked — unlock to send messages
          </p>
        ) : (
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Message the household..."
              disabled={sending}
              className="flex-1 bg-secondary border border-border rounded-sm px-4 py-3 font-display text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="px-4 py-3 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
