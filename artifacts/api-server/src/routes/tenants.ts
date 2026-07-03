import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { createHash } from "crypto";
import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

function getJwtSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET environment variable is required but not set.");
  return secret;
}

function makeLocalToken() {
  return jwt.sign(
    { sub: "local", type: "local", plan: "local", status: "active" },
    getJwtSecret(),
    { expiresIn: "24h" }
  );
}

router.post("/tenants/auth", async (req: Request, res: Response) => {
  try {
    const body = z.object({
      passphrase: z.string().min(1),
    }).parse(req.body);

    const vaultPassphrase = process.env["VAULT_PASSPHRASE"];

    // 1. VAULT_PASSPHRASE configured — require exact match for Ray's local workspace
    if (vaultPassphrase) {
      if (body.passphrase === vaultPassphrase) {
        res.json({ token: makeLocalToken(), type: "local", plan: "local", status: "active" });
        return;
      }
      // Fall through to check paying tenants even if local passphrase doesn't match
    }

    // 2. Check bcrypt hashes of paying tenants
    const tenantResult = await pool.query(
      `SELECT id, plan, status, passphrase_hash
       FROM tenants
       WHERE status IN ('trialing', 'active', 'past_due')
         AND passphrase_hash IS NOT NULL
         AND setup_completed_at IS NOT NULL`
    );

    for (const tenant of tenantResult.rows) {
      const match = await bcrypt.compare(body.passphrase, tenant.passphrase_hash as string);
      if (match) {
        const token = jwt.sign(
          { sub: tenant.id, type: "tenant", plan: tenant.plan, status: tenant.status },
          getJwtSecret(),
          { expiresIn: "24h" }
        );
        res.json({ token, type: "tenant", plan: tenant.plan, status: tenant.status });
        return;
      }
    }

    // 3. Legacy / unconfigured mode:
    //    If VAULT_PASSPHRASE is NOT set AND no paying tenants exist yet,
    //    accept any passphrase ≥ 4 chars. Matches the pre-task behaviour so Ray
    //    can still access his workspace before setting the secret.
    //    This fallback automatically disables once VAULT_PASSPHRASE is configured.
    if (!vaultPassphrase && tenantResult.rows.length === 0 && body.passphrase.length >= 4) {
      res.json({ token: makeLocalToken(), type: "local", plan: "local", status: "active" });
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

router.post("/tenants/setup", async (req: Request, res: Response) => {
  try {
    const body = z.object({
      tenantId: z.string().min(1),
      setupToken: z.string().min(1),
      passphrase: z.string().min(8),
    }).parse(req.body);

    const result = await pool.query(
      `SELECT id, setup_token_hash, setup_completed_at
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
    if (!tenant.setup_token_hash) {
      res.status(401).json({ error: "Invalid or expired setup token" });
      return;
    }

    // Verify by hashing the submitted token with SHA-256 and comparing
    const submittedHash = createHash("sha256").update(body.setupToken).digest("hex");
    if (submittedHash !== tenant.setup_token_hash) {
      res.status(401).json({ error: "Invalid setup token" });
      return;
    }

    const passphraseHash = await bcrypt.hash(body.passphrase, 12);

    await pool.query(
      `UPDATE tenants
       SET passphrase_hash = $1,
           setup_completed_at = NOW(),
           setup_token_hash = NULL,
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

export default router;
