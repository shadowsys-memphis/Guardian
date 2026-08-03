import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";

export interface TenantSession {
  sub: string;
  type: "local" | "tenant";
  plan: string;
  status: string;
  sessionVersion: number;
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

function verifyToken(req: Request): TenantSession | null {
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
 * Verifies the JWT signature/expiry, then checks the token's sessionVersion
 * against the live value in the DB. Bumping session_version (tenants table for
 * tenant sessions, app_settings 'local_session_version' for local sessions)
 * revokes every outstanding token of that type immediately, without waiting
 * for the 24h natural expiry.
 */
async function extractSession(req: Request): Promise<TenantSession | null> {
  const session = verifyToken(req);
  if (!session) return null;

  // Tokens issued before this field existed have no sessionVersion — treat as
  // version 1 so already-issued sessions keep working until first revocation.
  const tokenVersion = session.sessionVersion ?? 1;

  try {
    if (session.type === "local") {
      const result = await pool.query(
        `SELECT value FROM app_settings WHERE key = 'local_session_version' LIMIT 1`
      );
      const currentVersion = result.rows.length > 0 ? parseInt(result.rows[0].value, 10) : 1;
      if (tokenVersion !== currentVersion) return null;
    } else {
      const result = await pool.query(
        `SELECT session_version, status FROM tenants WHERE id = $1 LIMIT 1`,
        [session.sub]
      );
      if (result.rows.length === 0) return null;
      if (result.rows[0].status !== "active") return null;
      if (tokenVersion !== result.rows[0].session_version) return null;
    }
  } catch {
    // If the version check itself fails (e.g. DB hiccup), fail closed.
    return null;
  }

  return session;
}

/**
 * Accepts any valid session — both local (Ray) and tenant.
 * Routes using this middleware must derive tenant_id from req.tenantSession.sub
 * and scope all DB queries accordingly. For local sessions sub === "local".
 */
export async function requireAnySession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = await extractSession(req);
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
export async function requireLocalSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = await extractSession(req);
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
export function requireTenantSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  return requireAnySession(req, res, next);
}
