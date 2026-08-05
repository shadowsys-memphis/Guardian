import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { deriveKey, generateSalt, bufToBase64, base64ToBuf } from "./crypto";

interface VaultContextValue {
  isUnlocked: boolean;
  cryptoKey: CryptoKey | null;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  error: string | null;
}

const VaultContext = createContext<VaultContextValue | null>(null);

const SALT_STORAGE_KEY = "brain_vault_salt";

export function VaultProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(async (passphrase: string) => {
    try {
      setError(null);
      let saltB64 = localStorage.getItem(SALT_STORAGE_KEY);
      let salt: Uint8Array;
      if (saltB64) {
        salt = base64ToBuf(saltB64);
      } else {
        salt = generateSalt();
        saltB64 = bufToBase64(salt);
        localStorage.setItem(SALT_STORAGE_KEY, saltB64);
      }
      const key = await deriveKey(passphrase, salt);
      setCryptoKey(key);
      setIsUnlocked(true);
    } catch (err) {
      setError("Failed to derive key. Try again.");
      console.error(err);
    }
  }, []);

  const lock = useCallback(() => {
    setCryptoKey(null);
    setIsUnlocked(false);
  }, []);

  return (
    <VaultContext.Provider value={{ isUnlocked, cryptoKey, unlock, lock, error }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be inside VaultProvider");
  return ctx;
}
