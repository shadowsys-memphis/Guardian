import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

async function verifyLocalPassphrase(passphrase: string): Promise<boolean> {
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

router.post("/auth/change-passphrase", async (req, res) => {
  try {
    const body = z.object({
      currentPassphrase: z.string().min(1),
      newPassphrase: z.string().min(4, "New passphrase must be at least 4 characters"),
      confirmPassphrase: z.string().min(1),
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

export default router;
