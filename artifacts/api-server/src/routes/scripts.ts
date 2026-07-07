import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { voiceScriptsTable } from "@workspace/db/schema";
import {
  CreateVoiceScriptBody,
  UpdateVoiceScriptParams,
  UpdateVoiceScriptBody,
  DeleteVoiceScriptParams,
} from "@workspace/api-zod";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

function serializeScript(script: typeof voiceScriptsTable.$inferSelect) {
  return {
    id: script.id,
    taskKey: script.taskKey,
    label: script.label,
    scriptText: script.scriptText,
    tone: script.tone,
    isActive: script.isActive,
    lastPatched: script.lastPatched ? script.lastPatched.toISOString() : null,
    patchNote: script.patchNote ?? undefined,
  };
}

router.get("/scripts/active", async (req, res) => {
  try {
    const scripts = await db
      .select()
      .from(voiceScriptsTable)
      .where(eq(voiceScriptsTable.isActive, true))
      .orderBy(asc(voiceScriptsTable.taskKey));
    res.json(scripts.map(serializeScript));
  } catch (err) {
    req.log.error({ err }, "Failed to get active scripts");
    res.status(500).json({ error: "Failed to get active scripts" });
  }
});

router.get("/scripts", async (req, res) => {
  try {
    const scripts = await db
      .select()
      .from(voiceScriptsTable)
      .orderBy(asc(voiceScriptsTable.taskKey));
    res.json(scripts.map(serializeScript));
  } catch (err) {
    req.log.error({ err }, "Failed to get scripts");
    res.status(500).json({ error: "Failed to get scripts" });
  }
});

router.post("/scripts", async (req, res) => {
  try {
    const body = CreateVoiceScriptBody.parse(req.body);
    const [created] = await db.insert(voiceScriptsTable).values(body).returning();
    res.status(201).json(serializeScript(created));
  } catch (err) {
    req.log.error({ err }, "Failed to create script");
    res.status(400).json({ error: "Failed to create script" });
  }
});

router.put("/scripts/:id", async (req, res) => {
  try {
    const { id } = UpdateVoiceScriptParams.parse(req.params);
    const body = UpdateVoiceScriptBody.parse(req.body);
    const [updated] = await db
      .update(voiceScriptsTable)
      .set({ ...body, lastPatched: new Date() })
      .where(eq(voiceScriptsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Script not found" });
      return;
    }
    res.json(serializeScript(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update script");
    res.status(400).json({ error: "Failed to update script" });
  }
});

router.delete("/scripts/:id", async (req, res) => {
  try {
    const { id } = DeleteVoiceScriptParams.parse(req.params);
    await db.delete(voiceScriptsTable).where(eq(voiceScriptsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete script");
    res.status(400).json({ error: "Failed to delete script" });
  }
});

export default router;
