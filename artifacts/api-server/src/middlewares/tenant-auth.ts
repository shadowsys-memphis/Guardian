import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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
 * Accepts any valid session — both local (Ray) and tenant.
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
    res.status(403).json({ error: "Access denied. This feature is not available on your plan." });
    return;
  }
  (req as any).tenantSession = session;
  next();
}

/**
 * Alias for requireAnySession — kept for compatibility with any callers.
 */
export function requireTenantSession(req: Request, res: Response, next: NextFunction): void {
  return requireAnySession(req, res, next);
}
