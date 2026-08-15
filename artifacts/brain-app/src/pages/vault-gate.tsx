import { useState, type ReactNode } from "react";
import { Lock, Eye, EyeOff, Sparkles } from "lucide-react";
import { useVault } from "@/lib/vault-context";

interface VaultGateProps {
  children: ReactNode;
}

export function VaultGate({ children: _children }: VaultGateProps) {
  const { unlock, viewDemo } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const ok = await unlock(passphrase);
      if (!ok) setError("Incorrect passphrase. Try again.");
    } catch {
      setError("Unlock failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleViewDemo = async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      const ok = await viewDemo();
      if (!ok) setDemoError("Demo is unavailable right now. Please try again shortly.");
    } catch {
      setDemoError("Demo is unavailable right now. Please try again shortly.");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="text-center mb-10 space-y-3">
          <div className="h-20 w-20 mx-auto rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center shadow-[0_0_40px_rgba(70,159,104,0.12)]">
            <Lock className="h-9 w-9 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold text-primary tracking-widest uppercase">Brain Guardian</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-display">Vault Locked · Enter Passphrase</p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="relative">
            <input
              type={showPassphrase ? "text" : "password"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter vault passphrase"
              autoFocus
              className="w-full bg-secondary border border-border rounded-sm px-4 py-3 pr-12 font-display text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassphrase ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="text-sm text-destructive font-display text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !passphrase.trim()}
            className="w-full py-3 bg-primary text-primary-foreground font-display uppercase tracking-widest rounded-sm hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {loading ? "Unlocking..." : "Unlock Vault"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-display">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={handleViewDemo}
          disabled={demoLoading}
          className="w-full py-3 border border-primary/40 text-primary font-display uppercase tracking-widest rounded-sm hover:bg-primary/10 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          <Sparkles size={16} />
          {demoLoading ? "Loading Demo..." : "View Live Demo"}
        </button>
        <p className="text-[11px] text-center text-muted-foreground/60 mt-2 font-display">
          No passphrase needed — explore with sample data.
        </p>
        {demoError && (
          <p className="text-sm text-destructive font-display text-center mt-2">{demoError}</p>
        )}

        <p className="text-xs text-center text-muted-foreground/40 mt-8 font-display uppercase tracking-widest">
          Brain Guardian · Unconditional Software
        </p>
      </div>
    </div>
  );
}
