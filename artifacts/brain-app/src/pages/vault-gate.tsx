import { useState, type ReactNode } from "react";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { useVault } from "@/lib/vault-context";
import { PresenceField } from "@/components/presence-field/PresenceField";

interface VaultGateProps {
  children: ReactNode;
}

export function VaultGate({ children: _children }: VaultGateProps) {
  const { unlock, viewDemo, sessionExpired } = useVault();
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
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm mx-auto">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex justify-center">
            <PresenceField size={120} resting />
          </div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-accent font-medium mb-2">
            Presence Field OS
          </p>
          <h1 className="text-4xl font-display font-medium text-foreground">
            Brain Guardian
          </h1>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Care command for real life.
            <br />
            Quiet, adaptive, always present.
          </p>
        </div>

        <div className="glass-card p-6">
          {sessionExpired ? (
            <p className="text-xs text-center mb-4 text-amber-500">
              Your session timed out — nothing was lost, please sign in again
            </p>
          ) : (
            <p className="text-xs text-muted-foreground text-center mb-4">
              Vault locked · enter your passphrase
            </p>
          )}

          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="relative">
              <input
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter vault passphrase"
                autoFocus
                className="w-full bg-card/80 border border-border rounded-lg px-4 py-3 pr-12 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
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
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !passphrase.trim()}
              className="w-full py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {loading ? "Unlocking..." : "Unlock Vault"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={handleViewDemo}
            disabled={demoLoading}
            className="w-full py-3 border border-border bg-card/60 text-foreground font-medium rounded-lg hover:bg-secondary/60 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles size={16} className="text-accent" />
            {demoLoading ? "Loading Demo..." : "View Live Demo"}
          </button>
          <p className="text-[11px] text-center text-muted-foreground/70 mt-2">
            No passphrase needed — explore with sample data.
          </p>
          {demoError && (
            <p className="text-sm text-destructive text-center mt-2">{demoError}</p>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground/50 mt-8">
          Brain Guardian · Unconditional Software
        </p>
      </div>
    </div>
  );
}
