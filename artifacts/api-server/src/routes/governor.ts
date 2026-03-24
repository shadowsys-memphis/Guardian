import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { governorPillarsTable, governorNotesTable } from "@workspace/db/schema";
import { CreateGovernorNoteBody } from "@workspace/api-zod";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

function serializePillar(pillar: typeof governorPillarsTable.$inferSelect) {
  let metrics: string[] = [];
  try {
    if (pillar.metrics) {
      metrics = JSON.parse(pillar.metrics);
    }
  } catch {
    metrics = [];
  }
  return {
    id: pillar.id,
    pillarKey: pillar.pillarKey,
    name: pillar.name,
    description: pillar.description,
    focusDurationMins: pillar.focusDurationMins,
    metrics,
  };
}

function serializeNote(note: typeof governorNotesTable.$inferSelect) {
  return {
    id: note.id,
    pillarKey: note.pillarKey ?? null,
    noteText: note.noteText,
    createdAt: note.createdAt.toISOString(),
  };
}

router.get("/governor/pillars", async (req, res) => {
  try {
    const pillars = await db.select().from(governorPillarsTable);
    res.json(pillars.map(serializePillar));
  } catch (err) {
    req.log.error({ err }, "Failed to get governor pillars");
    res.status(500).json({ error: "Failed to get governor pillars" });
  }
});

router.get("/governor/notes", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const notes = await db
      .select()
      .from(governorNotesTable)
      .orderBy(desc(governorNotesTable.createdAt))
      .limit(limit);
    res.json(notes.map(serializeNote));
  } catch (err) {
    req.log.error({ err }, "Failed to get governor notes");
    res.status(500).json({ error: "Failed to get governor notes" });
  }
});

router.post("/governor/notes", async (req, res) => {
  try {
    const body = CreateGovernorNoteBody.parse(req.body);
    const [created] = await db
      .insert(governorNotesTable)
      .values({ noteText: body.noteText, pillarKey: body.pillarKey })
      .returning();
    res.status(201).json(serializeNote(created));
  } catch (err) {
    req.log.error({ err }, "Failed to create governor note");
    res.status(400).json({ error: "Failed to create governor note" });
  }
});

export default router;
