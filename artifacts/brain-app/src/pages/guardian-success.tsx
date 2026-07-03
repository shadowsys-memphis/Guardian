import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

type SetupStage = "loading" | "form" | "done" | "error";

export function GuardianSuccessPage() {
  const [, navigate] = useLocation();
  const [stage, setStage] = useState<SetupStage>("loading");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) {
      setStage("error");
      return;
    }
    fetch(`${API}/billing/checkout-session?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error || !data.setupToken) {
          setStage("error");
          return;
        }
        setTenantId(data.tenantId);
        setSetupToken(data.setupToken);
        setTenantName(data.tenantName || "");
        setStage("form");
      })
      .catch(() => setStage("error"));
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters.");
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/tenants/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, setupToken, passphrase }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Setup failed.");
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (stage === "loading") {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl animate-pulse">🧠</div>
          <p className="text-zinc-400">Setting up your care workspace…</p>
        </div>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-2xl font-bold text-white">Setup link expired or invalid</h1>
          <p className="text-zinc-400">
            This setup link may have already been used or has expired. If you
            already completed setup, just sign in to your workspace. If you need
            help, contact support.
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-all"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-6">
          <div className="text-6xl">✅</div>
          <h1 className="text-3xl font-black text-emerald-400">
            Your workspace is ready!
          </h1>
          <p className="text-zinc-400">
            Your Brain Guardian care workspace has been set up. Use your
            passphrase to access it anytime — we don't store it, so keep it
            somewhere safe.
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg text-lg transition-all"
          >
            Open My Care Workspace →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="text-5xl">🛡️</div>
          <h1 className="text-3xl font-black text-white">
            Welcome{tenantName ? `, ${tenantName}` : ""}!
          </h1>
          <p className="text-zinc-400">
            Your subscription is active. Create a passphrase to secure your
            private care workspace. This passphrase is never stored — only a
            secure hash is kept.
          </p>
        </div>

        <form onSubmit={handleSetup} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-400">
              Choose a passphrase (min 8 characters)
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="e.g. sunrise-family-care-2024"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 pr-12 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors text-sm"
              >
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-400">
              Confirm passphrase
            </label>
            <input
              type={showPass ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/30 border border-red-800/30 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !passphrase || !confirm}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg text-lg transition-all disabled:opacity-50"
          >
            {loading ? "Securing workspace…" : "Create My Workspace →"}
          </button>
        </form>

        <p className="text-xs text-center text-zinc-600">
          Your passphrase is hashed and never stored in plaintext. Write it down
          somewhere safe — it cannot be recovered.
        </p>
      </div>
    </div>
  );
}
