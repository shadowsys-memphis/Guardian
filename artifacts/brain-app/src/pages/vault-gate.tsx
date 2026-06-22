import { useState } from "react";
import { useVault } from "@/lib/vault-context";
import { Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";

export function VaultGate({ children }: { children: React.ReactNode }) {
  const { isUnlocked, unlock, error } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  if (isUnlocked) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) return;
    setLoading(true);
    await unlock(passphrase);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center shadow-[0_0_40px_rgba(251,191,36,0.2)]">
                <Lock className="h-9 w-9 text-primary" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background border border-border flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              </div>
            </div>
          </div>
          <h1 className="text-4xl font-display font-bold text-primary tracking-widest uppercase">
            br(AI)n_OS
          </h1>
          <p className="text-sm text-muted-foreground uppercase tracking-widest font-display">
            E2E Encrypted — Enter Passphrase
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Family passphrase..."
              autoFocus
              className="w-full bg-secondary border border-border rounded-sm px-4 py-4 text-lg font-display text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary tracking-widest pr-12"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="text-destructive text-sm font-bold uppercase tracking-widest text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !passphrase.trim()}
            className="w-full bg-primary text-primary-foreground font-display font-bold uppercase tracking-widest py-4 rounded-sm hover:bg-primary/90 disabled:opacity-40 transition-all flex items-center justify-center gap-3 text-lg"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                Deriving Key...
              </>
            ) : (
              <>
                <ShieldCheck size={20} />
                Unlock System
              </>
            )}
          </button>
        </form>

        <div className="border-t border-border/30 pt-6 space-y-2 text-center">
          <p className="text-xs text-muted-foreground/50 uppercase tracking-widest font-display">
            AES-256-GCM · PBKDF2 · Zero-Knowledge
          </p>
          <p className="text-xs text-muted-foreground/30 font-display tracking-wider">
            Keys derived in-browser. Nothing leaves your device.
          </p>
        </div>
      </div>
    </div>
  );
}
