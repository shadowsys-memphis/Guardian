import { createHmac, timingSafeEqual } from "crypto";

declare global {
  namespace Express {
    interface Request {
      // Populated by app.ts's express.json() `verify` callback. Needed here
      // because HMAC verification must run over the exact raw bytes ElevenLabs
      // signed — re-serializing the parsed JSON body can reorder keys or
      // change whitespace and silently produce a different signature.
      rawBody?: Buffer;
    }
  }
}

const SIGNATURE_HEADER = "elevenlabs-signature";
// Matches ElevenLabs' own documented tolerance. Wide enough to absorb normal
// network delay, narrow enough that a captured request can't be replayed
// long after the fact.
const MAX_TIMESTAMP_AGE_SECONDS = 30 * 60;

export type WebhookVerificationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "missing_header" | "malformed_header" | "timestamp_too_old" | "invalid_signature";
    };

/**
 * Verifies an ElevenLabs webhook request per their documented HMAC scheme:
 * header `ElevenLabs-Signature: t=<unix_ts>,v0=<hex_hmac>`, where the HMAC is
 * SHA-256 over `${timestamp}.${rawBody}` using the shared webhook secret
 * (configured to match on both ends — here via ELEVENLABS_WEBHOOK_SECRET, and
 * on the ElevenLabs webhook settings page).
 * Reference: https://elevenlabs.io/docs/eleven-api/resources/webhooks
 */
export function verifyElevenLabsSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | string[] | undefined,
  secret: string | undefined
): WebhookVerificationResult {
  if (!secret) return { ok: false, reason: "not_configured" };

  const headerValue = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!headerValue) return { ok: false, reason: "missing_header" };

  const elements = headerValue.split(",");
  const timestamp = elements.find((e) => e.startsWith("t="))?.slice(2);
  const signatures = elements.filter((e) => e.startsWith("v0=")).map((e) => e.slice(3));

  if (!timestamp || signatures.length === 0) {
    return { ok: false, reason: "malformed_header" };
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const parsedTimestamp = parseInt(timestamp, 10);
  const timestampAge = Math.abs(currentTime - parsedTimestamp);
  if (!Number.isFinite(parsedTimestamp) || timestampAge > MAX_TIMESTAMP_AGE_SECONDS) {
    return { ok: false, reason: "timestamp_too_old" };
  }

  const signedPayload = `${timestamp}.${(rawBody ?? Buffer.alloc(0)).toString("utf8")}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  const isValid = signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    // timingSafeEqual throws on mismatched lengths rather than returning
    // false, so length must be checked first — this comparison itself
    // doesn't need to be constant-time since signature length isn't secret.
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  });

  return isValid ? { ok: true } : { ok: false, reason: "invalid_signature" };
}

export function getElevenLabsWebhookSecret(): string | undefined {
  return process.env["ELEVENLABS_WEBHOOK_SECRET"];
}

export function getElevenLabsSignatureHeader(req: { headers: Record<string, string | string[] | undefined> }): string | string[] | undefined {
  return req.headers[SIGNATURE_HEADER];
}
