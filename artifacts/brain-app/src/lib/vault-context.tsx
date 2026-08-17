import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

// ─── Module-level fetch interceptor ──────────────────────────────────────────
// Runs once when this module is imported (before any React rendering).
// Injects Authorization: Bearer <token> on all /api/ requests when a session
// is active. This covers every fetch in the app — auto-generated hooks,
// streaming Jessica calls, everything — without touching individual call sites.

let _sessionToken: string | null = null;

// Set by VaultProvider so this module-level interceptor (which runs outside
// React) can force a re-login when a request comes back 401 with a token
// attached. Without this, an expired/invalidated token left every screen
// silently rendering its own "no data" empty state (each component's fetch
// failed independently with no shared handling) instead of telling the user
// their session lapsed — indistinguishable, from the user's side, from their
// actual data having disappeared.
let _onSessionExpired: (() => void) | null = null;

const _originalFetch = window.fetch.bind(window);

window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (_sessionToken) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    // Only inject on API calls — not on Vite HMR, external URLs, etc.
    if (url.includes("/api/") && !url.includes("/api/tenants/auth") && !url.includes("/api/tenants/demo")) {
      const headers = new Headers(init?.headers);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${_sessionToken}`);
      }
      return _originalFetch(input, { ...init, headers }).then((response) => {
        if (response.status === 401) {
          _onSessionExpired?.();
        }
        return response;
      });
    }
  }
  return _originalFetch(input, init);
};

// ─── Context ──────────────────────────────────────────────────────────────────

type SessionType = "local" | "tenant";

interface VaultContextType {
  isUnlocked: boolean;
  unlock: (passphrase: string) => Promise<boolean>;
  viewDemo: () => Promise<boolean>;
  lock: () => void;
  passphrase: string | null;
  sessionToken: string | null;
  /** "local" = Ray's own workspace, "tenant" = a scoped tenant (incl. the demo). */
  sessionType: SessionType | null;
  plan: string | null;
  /** True for Ray's own local session. False for any tenant session, including the demo. */
  isLocal: boolean;
  /** True specifically for the public demo tenant (a subset of tenant sessions). */
  isDemo: boolean;
  /** True when the vault re-locked itself because a request came back 401
   *  (token expired or revoked), as opposed to the user locking it manually.
   *  Lets the lock screen say "your session expired" instead of implying
   *  the user chose to lock it — cleared on the next successful unlock. */
  sessionExpired: boolean;
}

const VaultContext = createContext<VaultContextType | null>(null);

const VAULT_SESSION_KEY = "brain_vault_unlocked";
const VAULT_TOKEN_KEY = "brain_vault_token";
const VAULT_TYPE_KEY = "brain_vault_type";
const VAULT_PLAN_KEY = "brain_vault_plan";

export function VaultProvider({ children }: { children: ReactNode }) {
  // The query client is a single shared instance across every session type.
  // Query keys don't encode tenant identity, so switching sessions in the
  // same tab (lock -> unlock, or unlock -> viewDemo) without clearing the
  // cache would let the new session briefly render the previous session's
  // cached dashboard/schedule/symptom/inventory data before its own fetch
  // resolves — a real cross-session data leak risk, not just a UI glitch.
  const queryClient = useQueryClient();

  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(VAULT_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      const stored = sessionStorage.getItem(VAULT_TOKEN_KEY) ?? null;
      // Sync the module-level interceptor with any restored session token
      _sessionToken = stored;
      return stored;
    } catch {
      return null;
    }
  });
  const [sessionType, setSessionType] = useState<SessionType | null>(() => {
    try {
      const stored = sessionStorage.getItem(VAULT_TYPE_KEY);
      return stored === "tenant" ? "tenant" : stored === "local" ? "local" : null;
    } catch {
      return null;
    }
  });
  const [plan, setPlan] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(VAULT_PLAN_KEY) ?? null;
    } catch {
      return null;
    }
  });
  const [sessionExpired, setSessionExpired] = useState(false);

  const applySession = (token: string, type: SessionType, planValue: string, input: string | null) => {
    _sessionToken = token; // update interceptor immediately
    // Wipe any cached data from a prior session in this tab (e.g. Ray's real
    // dashboard/schedule/symptom/inventory data) before the new session's
    // queries run — see the note on queryClient above.
    queryClient.clear();
    setPassphrase(input);
    setSessionToken(token);
    setSessionType(type);
    setPlan(planValue);
    setIsUnlocked(true);
    setSessionExpired(false);
    try {
      sessionStorage.setItem(VAULT_SESSION_KEY, "1");
      sessionStorage.setItem(VAULT_TOKEN_KEY, token);
      sessionStorage.setItem(VAULT_TYPE_KEY, type);
      sessionStorage.setItem(VAULT_PLAN_KEY, planValue);
    } catch {}
  };

  const unlock = useCallback(async (input: string): Promise<boolean> => {
    if (!input || input.length < 4) return false;

    try {
      const res = await _originalFetch(`${API}/tenants/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: input }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (!data.token) return false;

      applySession(data.token, data.type === "tenant" ? "tenant" : "local", data.plan ?? "local", input);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Starts a no-passphrase session for the shared public demo workspace. Uses
  // the exact same tenant-session mechanism as unlock() above — the demo is
  // just another (pre-seeded, always-active) tenant — so it is scoped and
  // isolated from Ray's local data exactly like any other tenant login.
  const viewDemo = useCallback(async (): Promise<boolean> => {
    try {
      const res = await _originalFetch(`${API}/tenants/demo`, { method: "POST" });
      if (!res.ok) return false;

      const data = await res.json();
      if (!data.token) return false;

      applySession(data.token, "tenant", data.plan ?? "demo", null);
      return true;
    } catch {
      return false;
    }
  }, []);

  const lock = useCallback((opts?: { expired?: boolean }) => {
    _sessionToken = null; // clear interceptor
    queryClient.clear(); // drop this session's cached data immediately
    setIsUnlocked(false);
    setPassphrase(null);
    setSessionToken(null);
    setSessionType(null);
    setPlan(null);
    setSessionExpired(!!opts?.expired);
    try {
      sessionStorage.removeItem(VAULT_SESSION_KEY);
      sessionStorage.removeItem(VAULT_TOKEN_KEY);
      sessionStorage.removeItem(VAULT_TYPE_KEY);
      sessionStorage.removeItem(VAULT_PLAN_KEY);
    } catch {}
  }, [queryClient]);

  // Registers with the module-level fetch interceptor so a 401 on any
  // authenticated request re-locks the vault with sessionExpired=true,
  // instead of leaving a stale "unlocked" shell up whose screens each fail
  // their own fetch independently and quietly render empty.
  useEffect(() => {
    _onSessionExpired = () => lock({ expired: true });
    return () => {
      _onSessionExpired = null;
    };
  }, [lock]);

  // Sessions created before sessionType existed in storage (or the brief
  // window before hydration) default to local — every session prior to the
  // demo feature was Ray's own, so this is the safe fallback.
  const isLocal = sessionType !== "tenant";
  const isDemo = sessionType === "tenant" && plan === "demo";

  return (
    <VaultContext.Provider
      value={{ isUnlocked, unlock, viewDemo, lock, passphrase, sessionToken, sessionType, plan, isLocal, isDemo, sessionExpired }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextType {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
