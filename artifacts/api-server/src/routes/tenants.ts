import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { loginRateLimit } from "../middlewares/rate-limit";
import { requireLocalSession } from "../middlewares/tenant-auth";

const router: IRouter = Router();

function getJwtSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET environment variable is required but not set.");
  return secret;
}

async function getLocalSessionVersion(): Promise<number> {
  const result = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'local_session_version' LIMIT 1`
  );
  return result.rows.length > 0 ? parseInt(result.rows[0].value, 10) : 1;
}

async function makeLocalToken() {
  const sessionVersion = await getLocalSessionVersion();
  return jwt.sign(
    { sub: "local", type: "local", plan: "local", status: "active", sessionVersion },
    getJwtSecret(),
    { expiresIn: "24h" }
  );
}

router.post("/tenants/auth", loginRateLimit, async (req: Request, res: Response) => {
  try {
    const body = z.object({
      passphrase: z.string().min(1),
    }).parse(req.body);

    // 0. Check local_passphrase_hash in DB (set via change-passphrase endpoint)
    // If a stored hash exists it is authoritative — no fallback to legacy mode.
    try {
      const localHashResult = await pool.query(
        `SELECT value FROM app_settings WHERE key = 'local_passphrase_hash' LIMIT 1`
      );
      if (localHashResult.rows.length > 0) {
        const match = await bcrypt.compare(body.passphrase, localHashResult.rows[0].value as string);
        if (match) {
          res.json({ token: await makeLocalToken(), type: "local", plan: "local", status: "active" });
        } else {
          res.status(401).json({ error: "Incorrect passphrase." });
        }
        return;
      }
    } catch {}

    const vaultPassphrase = process.env["VAULT_PASSPHRASE"];

    // 1. VAULT_PASSPHRASE configured — require exact match for Ray's local workspace
    if (vaultPassphrase) {
      if (body.passphrase === vaultPassphrase) {
        res.json({ token: await makeLocalToken(), type: "local", plan: "local", status: "active" });
        return;
      }
      // Fall through to check tenants even if local passphrase doesn't match
    }

    // 2. Check bcrypt hashes of provisioned tenants (any that have completed setup)
    const tenantResult = await pool.query(
      `SELECT id, plan, status, passphrase_hash, session_version
       FROM tenants
       WHERE passphrase_hash IS NOT NULL
         AND setup_completed_at IS NOT NULL`
    );

    for (const tenant of tenantResult.rows) {
      const match = await bcrypt.compare(body.passphrase, tenant.passphrase_hash as string);
      if (match) {
        const token = jwt.sign(
          {
            sub: tenant.id,
            type: "tenant",
            plan: tenant.plan,
            status: "active",
            sessionVersion: tenant.session_version,
          },
          getJwtSecret(),
          { expiresIn: "24h" }
        );
        res.json({ token, type: "tenant", plan: tenant.plan, status: "active" });
        return;
      }
    }

    // 3. Legacy / unconfigured mode:
    //    If VAULT_PASSPHRASE is NOT set AND no tenants exist yet,
    //    accept any passphrase ≥ 4 chars. This fallback automatically
    //    disables once VAULT_PASSPHRASE is configured.
    if (!vaultPassphrase && tenantResult.rows.length === 0 && body.passphrase.length >= 4) {
      res.json({ token: await makeLocalToken(), type: "local", plan: "local", status: "active" });
      return;
    }

    res.status(401).json({ error: "Incorrect passphrase." });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    req.log.error({ err }, "Tenant auth failed");
    res.status(500).json({ error: "Authentication failed" });
  }
});

/**
 * POST /tenants/setup — provision a new tenant workspace passphrase.
 * Used by any future onboarding flow. No setup token required —
 * a tenant row must already exist with no passphrase set yet.
 */
router.post("/tenants/setup", async (req: Request, res: Response) => {
  try {
    const body = z.object({
      tenantId: z.string().min(1),
      passphrase: z.string().min(8),
    }).parse(req.body);

    const result = await pool.query(
      `SELECT id, passphrase_hash, setup_completed_at
       FROM tenants WHERE id = $1`,
      [body.tenantId]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    if (tenant.setup_completed_at) {
      res.status(400).json({ error: "Setup already completed. Please sign in." });
      return;
    }

    const passphraseHash = await bcrypt.hash(body.passphrase, 12);

    await pool.query(
      `UPDATE tenants
       SET passphrase_hash = $1,
           setup_completed_at = NOW(),
           status = 'active',
           updated_at = NOW()
       WHERE id = $2`,
      [passphraseHash, body.tenantId]
    );

    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: err.errors });
      return;
    }
    req.log.error({ err }, "Tenant setup failed");
    res.status(500).json({ error: "Setup failed" });
  }
});

/**
 * POST /tenants/:id/revoke-sessions — invalidate every outstanding JWT for a
 * tenant immediately (compromised session, offboarding) by bumping
 * session_version. Requires a local session — this is Ray's admin action,
 * not something a tenant can call on themselves via a tenant-scoped token.
 */
router.post("/tenants/:id/revoke-sessions", requireLocalSession, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE tenants SET session_version = session_version + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [req.params["id"]]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to revoke tenant sessions");
    res.status(500).json({ error: "Failed to revoke sessions" });
  }
});

export default router;
