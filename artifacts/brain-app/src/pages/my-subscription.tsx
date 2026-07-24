import { useVault } from "@/lib/vault-context";

export function MySubscriptionPage() {
  const { lock } = useVault();

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-black text-primary tracking-widest uppercase font-display">
          Workspace
        </h1>
        <p className="text-muted-foreground text-sm mt-1 font-display uppercase tracking-wider">
          br(AI)n · Local Workspace
        </p>
      </div>

      <div className="bg-card border border-border rounded-sm p-6 space-y-3">
        <p className="text-sm font-bold text-foreground font-display uppercase tracking-widest">
          Local Workspace
        </p>
        <p className="text-sm text-muted-foreground">
          This is a private, locally-hosted care workspace. All data stays on
          your server — no subscription or external billing required.
        </p>
      </div>

      <div className="border-t border-border pt-6">
        <button
          onClick={lock}
          className="text-sm text-muted-foreground hover:text-foreground font-display uppercase tracking-widest transition-colors"
        >
          Lock Workspace
        </button>
      </div>
    </div>
  );
}
