import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "@workspace/db";
import { loginRateLimit } from "../middlewares/rate-limit";
import { requireLocalSession } from "../middlewares/tenant-auth";

const router: IRouter = Router();

async function bumpLocalSessionVersion(): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('local_session_version', '2', NOW())
     ON CONFLICT (key) DO UPDATE SET value = (COALESCE(app_settings.value, '1')::int + 1)::text, updated_at = NOW()`
  );
}

async function verifyLocalPassphrase(passphrase: string): Promise<boolean> {
  // Trim incidental whitespace so this matches however the stored hash (or
  // VAULT_PASSPHRASE) was compared/set — see /tenants/auth for the same rule.
  passphrase = passphrase.trim();
  try {
    const result = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'local_passphrase_hash' LIMIT 1`
    );
    if (result.rows.length > 0) {
      return await bcrypt.compare(passphrase, result.rows[0].value as string);
    }
  } catch {}

  const vaultPassphrase = process.env["VAULT_PASSPHRASE"];
  if (vaultPassphrase) {
    return passphrase === vaultPassphrase;
  }

  return passphrase.length >= 4;
}

router.post("/auth/change-passphrase", loginRateLimit, async (req, res) => {
  try {
    const body = z.object({
      currentPassphrase: z.string().trim().min(1),
      newPassphrase: z.string().trim().min(4, "New passphrase must be at least 4 characters"),
      confirmPassphrase: z.string().trim().min(1),
    }).parse(req.body);

    if (body.newPassphrase !== body.confirmPassphrase) {
      res.status(400).json({ error: "New passphrase and confirmation do not match" });
      return;
    }

    const valid = await verifyLocalPassphrase(body.currentPassphrase);
    if (!valid) {
      res.status(401).json({ error: "Current passphrase is incorrect" });
      return;
    }

    const hash = await bcrypt.hash(body.newPassphrase, 12);

    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('local_passphrase_hash', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [hash]
    );

    // Changing the passphrase revokes every outstanding local session token —
    // anyone who had the old passphrase (and a still-valid JWT) is signed out.
    await bumpLocalSessionVersion();

    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" });
      return;
    }
    req.log.error({ err }, "Change passphrase failed");
    res.status(500).json({ error: "Failed to change passphrase" });
  }
});

/**
 * POST /auth/revoke-sessions — sign out every local-session device/token
 * immediately, without changing the passphrase. Requires an already-valid
 * local session (this endpoint invalidates itself along with the rest —
 * the caller has to log back in afterward).
 */
router.post("/auth/revoke-sessions", requireLocalSession, async (req, res) => {
  try {
    await bumpLocalSessionVersion();
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to revoke local sessions");
    res.status(500).json({ error: "Failed to revoke sessions" });
  }
});

export default router;
