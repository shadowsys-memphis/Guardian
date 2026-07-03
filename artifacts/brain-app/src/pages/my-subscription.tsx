import { useState, useEffect } from "react";
import { useVault } from "@/lib/vault-context";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

const PLAN_LABELS: Record<string, string> = {
  family: "Family Plan — $19/mo",
  multi_care: "Multi-Care Plan — $39/mo",
  local: "Local Workspace",
};

const STATUS_COLORS: Record<string, string> = {
  trialing: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  past_due: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  suspended: "bg-red-500/20 text-red-300 border-red-500/30",
  cancelled: "bg-zinc-700/50 text-zinc-400 border-zinc-600/30",
  local: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  trialing: "Free Trial Active",
  active: "Active",
  past_due: "Payment Past Due",
  suspended: "Suspended",
  cancelled: "Cancelled",
  local: "Local Workspace",
};

interface BillingStatus {
  plan: string;
  status: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  type?: string;
}

export function MySubscriptionPage() {
  const { sessionToken, lock } = useVault();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) return;
    fetch(`${API}/billing/status`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setStatus(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionToken]);

  const openBillingPortal = async () => {
    if (!sessionToken) return;
    setPortalLoading(true);
    try {
      const res = await fetch(`${API}/billing/customer-portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to open portal");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-black text-primary tracking-widest uppercase font-display">
          My Subscription
        </h1>
        <p className="text-muted-foreground text-sm mt-1 font-display uppercase tracking-wider">
          Brain Guardian · Workspace Management
        </p>
      </div>

      {loading && (
        <div className="bg-card border border-border rounded-sm p-8 text-center">
          <p className="text-muted-foreground font-display uppercase tracking-wider text-sm animate-pulse">
            Loading subscription details…
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-sm p-6">
          <p className="text-destructive text-sm font-display">{error}</p>
        </div>
      )}

      {status && !loading && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-display uppercase tracking-widest">
                  Current Plan
                </p>
                <p className="text-xl font-bold text-foreground mt-1">
                  {PLAN_LABELS[status.plan] || status.plan}
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${
                  STATUS_COLORS[status.status] || STATUS_COLORS.local
                }`}
              >
                {STATUS_LABELS[status.status] || status.status}
              </span>
            </div>

            {status.status === "trialing" && status.trialEndsAt && (
              <div className="bg-blue-950/30 border border-blue-800/30 rounded-sm px-4 py-3">
                <p className="text-sm text-blue-300 font-display">
                  🎯 Free trial ends{" "}
                  <strong>{formatDate(status.trialEndsAt)}</strong>. No charge
                  until then.
                </p>
              </div>
            )}

            {status.status === "past_due" && (
              <div className="bg-yellow-950/30 border border-yellow-800/30 rounded-sm px-4 py-3">
                <p className="text-sm text-yellow-300 font-display">
                  ⚠️ Payment failed. Please update your payment method to keep
                  your workspace active.
                </p>
              </div>
            )}

            {status.currentPeriodEnd && status.status !== "trialing" && (
              <div>
                <p className="text-xs text-muted-foreground font-display uppercase tracking-widest">
                  Next Renewal
                </p>
                <p className="text-foreground font-display mt-1">
                  {formatDate(status.currentPeriodEnd)}
                </p>
              </div>
            )}
          </div>

          {status.type !== "local" && status.plan !== "local" && (
            <div className="bg-card border border-border rounded-sm p-6 space-y-4">
              <div>
                <p className="text-sm font-bold text-foreground font-display">
                  Billing Management
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Update payment method, download invoices, or cancel your
                  subscription through the Stripe billing portal.
                </p>
              </div>
              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-display uppercase tracking-widest text-sm rounded-sm transition-colors disabled:opacity-50"
              >
                {portalLoading ? "Opening…" : "Manage Billing →"}
              </button>
            </div>
          )}

          {status.plan === "local" && (
            <div className="bg-card border border-border rounded-sm p-6">
              <p className="text-sm text-muted-foreground font-display">
                This is a local workspace. Subscription management is not
                available for local instances.
              </p>
            </div>
          )}
        </div>
      )}

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
