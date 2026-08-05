const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256;

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );
  return {
    ciphertext: bufToBase64(new Uint8Array(encrypted)),
    iv: bufToBase64(iv),
  };
}

export async function decrypt(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
  const decoder = new TextDecoder();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(iv) },
    key,
    base64ToBuf(ciphertext)
  );
  return decoder.decode(decrypted);
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function bufToBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf));
}

export function base64ToBuf(b64: string): Uint8Array {
  return new Uint8Array(atob(b64).split("").map((c) => c.charCodeAt(0)));
}
