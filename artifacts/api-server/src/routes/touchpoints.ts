import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { listTouchpoints, updateTouchpoint } from "../lib/call-scheduler";
import { isCallTestMode } from "./jessica";
import { getSettings } from "./health-assessment";

const router: IRouter = Router();

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

async function readConfig() {
  const settings = await getSettings();
  return {
    callTestMode: await isCallTestMode(),
    adminPhoneSet: Boolean(process.env["ADMIN_PHONE_NUMBER"]),
    dailyCallEnabled: settings.dailyCallEnabled,
  };
}

// Literal paths registered before the :id route (Express matches in order —
// same trap as /scripts/active vs /scripts/:id).
router.get("/touchpoints/config", async (req, res) => {
  try {
    res.json(await readConfig());
  } catch (err) {
    req.log.error({ err }, "Failed to read touchpoints config");
    res.status(500).json({ error: "Failed to read call config" });
  }
});

router.put("/touchpoints/config", async (req, res) => {
  try {
    const body = z.object({ callTestMode: z.boolean() }).parse(req.body);
    await db.execute(sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('call_test_mode', ${body.callTestMode ? "true" : "false"}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `);
    req.log.warn({ callTestMode: body.callTestMode }, body.callTestMode
      ? "Call TEST MODE enabled — all outbound calls now dial the admin line"
      : "Call TEST MODE DISABLED — outbound calls now dial Pops' real number");
    res.json(await readConfig());
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "callTestMode (boolean) is required", details: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update call test mode");
    res.status(500).json({ error: "Failed to update call config" });
  }
});

router.get("/touchpoints", async (req, res) => {
  try {
    res.json(await listTouchpoints());
  } catch (err) {
    req.log.error({ err }, "Failed to list touchpoints");
    res.status(500).json({ error: "Failed to list touchpoints" });
  }
});

router.patch("/touchpoints/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid touchpoint id" });
      return;
    }
    const body = z.object({
      timeOfDay: z.string().regex(HHMM, "Time must be 24-hour HH:MM").optional(),
      title: z.string().min(1).optional(),
      purposePrompt: z.string().min(1).optional(),
      active: z.boolean().optional(),
    }).parse(req.body);
    const updated = await updateTouchpoint(id, body);
    if (!updated) {
      res.status(404).json({ error: "Touchpoint not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid touchpoint patch", details: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to update touchpoint");
    res.status(500).json({ error: "Failed to update touchpoint" });
  }
});

export default router;
