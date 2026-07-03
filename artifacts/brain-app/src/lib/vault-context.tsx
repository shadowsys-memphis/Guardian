import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

// ─── Module-level fetch interceptor ──────────────────────────────────────────
// Runs once when this module is imported (before any React rendering).
// Injects Authorization: Bearer <token> on all /api/ requests when a session
// is active. This covers every fetch in the app — auto-generated hooks,
// streaming Jessica calls, everything — without touching individual call sites.

let _sessionToken: string | null = null;

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
    if (url.includes("/api/") && !url.includes("/api/tenants/auth")) {
      const headers = new Headers(init?.headers);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${_sessionToken}`);
      }
      return _originalFetch(input, { ...init, headers });
    }
  }
  return _originalFetch(input, init);
};

// ─── Context ──────────────────────────────────────────────────────────────────

interface VaultContextType {
  isUnlocked: boolean;
  unlock: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  passphrase: string | null;
  sessionToken: string | null;
}

const VaultContext = createContext<VaultContextType | null>(null);

const VAULT_SESSION_KEY = "brain_vault_unlocked";
const VAULT_TOKEN_KEY = "brain_vault_token";

export function VaultProvider({ children }: { children: ReactNode }) {
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

      _sessionToken = data.token; // update interceptor immediately
      setPassphrase(input);
      setSessionToken(data.token);
      setIsUnlocked(true);
      try {
        sessionStorage.setItem(VAULT_SESSION_KEY, "1");
        sessionStorage.setItem(VAULT_TOKEN_KEY, data.token);
      } catch {}
      return true;
    } catch {
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    _sessionToken = null; // clear interceptor
    setIsUnlocked(false);
    setPassphrase(null);
    setSessionToken(null);
    try {
      sessionStorage.removeItem(VAULT_SESSION_KEY);
      sessionStorage.removeItem(VAULT_TOKEN_KEY);
    } catch {}
  }, []);

  return (
    <VaultContext.Provider value={{ isUnlocked, unlock, lock, passphrase, sessionToken }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextType {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
