import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface VaultContextType {
  isUnlocked: boolean;
  unlock: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  passphrase: string | null;
}

const VaultContext = createContext<VaultContextType | null>(null);

const VAULT_SESSION_KEY = "brain_vault_unlocked";

export function VaultProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(VAULT_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [passphrase, setPassphrase] = useState<string | null>(null);

  const unlock = useCallback(async (input: string): Promise<boolean> => {
    if (!input || input.length < 4) return false;
    setPassphrase(input);
    setIsUnlocked(true);
    try { sessionStorage.setItem(VAULT_SESSION_KEY, "1"); } catch {}
    return true;
  }, []);

  const lock = useCallback(() => {
    setIsUnlocked(false);
    setPassphrase(null);
    try { sessionStorage.removeItem(VAULT_SESSION_KEY); } catch {}
  }, []);

  return (
    <VaultContext.Provider value={{ isUnlocked, unlock, lock, passphrase }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextType {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
