import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, Lock } from "lucide-react";
import { format } from "date-fns";
import { useVault } from "@/lib/vault-context";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

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

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptMessage(plaintext: string, passphrase: string): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuf))),
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
  };
}

async function decryptMessage(ciphertext: string, iv: string, salt: string, passphrase: string): Promise<string> {
  const ciphertextBuf = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const ivBuf = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const saltBuf = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
  const key = await deriveKey(passphrase, saltBuf);
  const plaintextBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf }, key, ciphertextBuf);
  return new TextDecoder().decode(plaintextBuf);
}

export function IntercomView() {
  const { passphrase } = useVault();
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [input, setInput] = useState("");
  const [sender, setSender] = useState("Raymo");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    if (!passphrase) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/intercom/messages?limit=50`);
      const raw: EncryptedMessage[] = await res.json();
      const decrypted = await Promise.all(
        raw.map(async (m) => {
          try {
            const plaintext = await decryptMessage(m.ciphertext, m.iv, m.salt, passphrase);
            return { id: m.id, sender: m.sender, plaintext, createdAt: m.createdAt };
          } catch {
            return { id: m.id, sender: m.sender, plaintext: "[Unable to decrypt]", createdAt: m.createdAt, failed: true };
          }
        })
      );
      setMessages(decrypted.reverse());
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [passphrase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !passphrase || sending) return;
    setSending(true);
    try {
      const encrypted = await encryptMessage(input.trim(), passphrase);
      await fetch(`${BASE_URL}/api/intercom/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, ...encrypted }),
      });
      setInput("");
      await fetchMessages();
    } catch {
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-6 w-6 text-primary" />
          <div>
            <p className="text-xl font-display font-bold text-primary tracking-widest uppercase">INTERCOM</p>
            <p className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Lock size={10} /> E2EE Family Channel
            </p>
          </div>
        </div>
        <select
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          className="bg-secondary border border-border rounded-sm px-3 py-1.5 text-sm font-display text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="Raymo">Raymo</option>
          <option value="Pops">Pops</option>
          <option value="Jessica">Jessica</option>
        </select>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3">
        {loading && messages.length === 0 && (
          <p className="text-center text-muted-foreground/50 text-sm font-display uppercase tracking-widest animate-pulse">
            Decrypting messages...
          </p>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <MessageSquare className="h-12 w-12 text-muted-foreground/20 mx-auto" />
            <p className="text-muted-foreground text-sm">No messages yet. Start the conversation.</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender === sender;
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-sm px-4 py-3 space-y-1 ${isMe ? "bg-primary/10 border border-primary/20" : "bg-card border border-border"} ${msg.failed ? "opacity-50" : ""}`}>
                <p className={`text-xs font-display uppercase tracking-widest ${isMe ? "text-primary/60" : "text-muted-foreground"}`}>
                  {msg.sender} · {format(new Date(msg.createdAt), "HH:mm")}
                </p>
                <p className={`text-sm font-display leading-relaxed ${isMe ? "text-primary" : "text-foreground"} ${msg.failed ? "italic text-muted-foreground" : ""}`}>
                  {msg.plaintext}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="bg-card border-t border-border px-6 py-4 shrink-0">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Type an encrypted message..."
            disabled={sending}
            className="flex-1 bg-secondary border border-border rounded-sm px-4 py-3 font-display text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-4 py-3 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground/40 mt-2 font-display uppercase tracking-widest flex items-center gap-1">
          <Lock size={10} /> Messages are end-to-end encrypted with your vault passphrase
        </p>
      </div>
    </div>
  );
}
