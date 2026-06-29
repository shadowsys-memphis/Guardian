import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { intercomeMessagesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

router.get("/intercom/messages", async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? "50", 10);
    const messages = await db
      .select()
      .from(intercomeMessagesTable)
      .orderBy(desc(intercomeMessagesTable.createdAt))
      .limit(limit);
    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Failed to list intercom messages");
    res.status(500).json({ error: "Failed to list intercom messages" });
  }
});

router.post("/intercom/messages", async (req, res) => {
  try {
    const body = z.object({
      sender: z.string(),
      ciphertext: z.string(),
      iv: z.string(),
      salt: z.string(),
    }).parse(req.body);
    const [created] = await db.insert(intercomeMessagesTable).values(body).returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to post intercom message");
    res.status(400).json({ error: "Failed to post intercom message" });
  }
});

export default router;
