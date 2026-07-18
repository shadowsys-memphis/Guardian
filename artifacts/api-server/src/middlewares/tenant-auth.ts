import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";

export interface TenantSession {
  sub: string;
  type: "local" | "tenant";
  plan: string;
  status: string;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      tenantSession?: TenantSession;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET environment variable is required but not set.");
  return secret;
}

function extractSession(req: Request): TenantSession | null {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    return jwt.verify(token, getJwtSecret()) as TenantSession;
  } catch {
    return null;
  }
}

/**
 * Accepts any valid session — both local (Ray) and tenant (paying subscriber).
 * Routes using this middleware must derive tenant_id from req.tenantSession.sub
 * and scope all DB queries accordingly. For local sessions sub === "local".
 */
export function requireAnySession(req: Request, res: Response, next: NextFunction): void {
  const session = extractSession(req);
  if (!session) {
    res.status(401).json({ error: "Missing or invalid session token. Please sign in." });
    return;
  }
  (req as any).tenantSession = session;
  next();
}

/**
 * Requires a local (Ray's) session only.
 * Used for personal-care specialty routes not yet tenant-scoped:
 * scripts, haldol, smarthome, health-assessment, shopper, rotation.
 */
export function requireLocalSession(req: Request, res: Response, next: NextFunction): void {
  const session = extractSession(req);
  if (!session) {
    res.status(401).json({ error: "Missing or invalid session token. Please sign in." });
    return;
  }
  if (session.type !== "local") {
    res.status(403).json({ error: "Access denied. This feature is not yet available on subscriber plans." });
    return;
  }
  (req as any).tenantSession = session;
  next();
}

/**
 * Accepts any valid session (local or tenant). Used on billing status/portal
 * endpoints where both Ray and paying subscribers need access.
 */
export function requireTenantSession(req: Request, res: Response, next: NextFunction): void {
  return requireAnySession(req, res, next);
}

/**
 * Feature gating — must run AFTER requireAnySession (which sets req.tenantSession).
 * Local (Ray) always passes. For tenant sessions, authoritative status is fetched
 * from the DB on every request so Stripe webhook changes (cancellation, past_due)
 * take effect immediately without waiting for JWT expiry.
 */
export function requireActiveSubscription(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).tenantSession as TenantSession | undefined;
  if (!session) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  if (session.type === "local") { next(); return; }

  pool.query<{ status: string }>(
    "SELECT status FROM tenants WHERE id = $1",
    [session.sub]
  )
    .then((result) => {
      if (result.rows.length === 0) {
        res.status(401).json({ error: "Subscriber account not found." });
        return;
      }
      const liveStatus = result.rows[0].status;
      if (["active", "trialing"].includes(liveStatus)) {
        next();
      } else {
        res.status(402).json({
          error: "Subscription required. Your plan is not active.",
          status: liveStatus,
        });
      }
    })
    .catch((err) => next(err));
}
