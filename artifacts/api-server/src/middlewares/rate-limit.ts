import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  windowStart: number;
}

/**
 * Minimal in-memory sliding-window rate limiter — no external dependency needed.
 * Single-process only; fine for this deployment (one API server instance).
 */
export function rateLimit(opts: { windowMs: number; max: number; message: string }) {
  const buckets = new Map<string, Bucket>();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || now - existing.windowStart > opts.windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > opts.max) {
      const retryAfterSec = Math.ceil((opts.windowMs - (now - existing.windowStart)) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: opts.message });
      return;
    }

    next();
  };
}

// 10 attempts per 15 minutes per IP — generous for legitimate typos, tight against brute force.
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

// There's no secret to brute-force here (no passphrase), so this exists purely
// to cap automated abuse/DoS of the public demo-session endpoint — generous
// enough that a visitor re-clicking "View Demo" a few times never gets blocked.
export const demoSessionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many demo requests. Please wait a few minutes and try again.",
});
