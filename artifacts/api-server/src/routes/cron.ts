import { Router, type IRouter } from "express";
import { z } from "zod";
import { acknowledgeAlert, getCronStatus, runJobByName } from "../lib/call-scheduler";

const router: IRouter = Router();

router.get("/cron/status", async (req, res) => {
  try {
    res.json(await getCronStatus());
  } catch (err) {
    req.log.error({ err }, "Failed to get cron status");
    res.status(500).json({ error: "Failed to get cron status" });
  }
});

router.post("/cron/alerts/:kind/ack", async (req, res) => {
  try {
    const { kind } = z
      .object({ kind: z.enum(["med_refusal", "wellbeing", "missed_call", "elevenlabs_config"]) })
      .parse(req.params);
    await acknowledgeAlert(kind);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Unknown alert kind" });
      return;
    }
    req.log.error({ err }, "Failed to acknowledge alert");
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

router.post("/cron/jobs/:name/run", async (req, res) => {
  try {
    const result = await runJobByName(req.params["name"]);
    if (!result) {
      res.status(404).json({ error: "Unknown job" });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to run cron job on demand");
    res.status(500).json({ error: "Failed to run job" });
  }
});

export default router;
