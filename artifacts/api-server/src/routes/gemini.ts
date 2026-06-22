import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversations as conversationsTable, messages as messagesTable } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { eq, asc, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const JESSICA_SYSTEM_PROMPT = `You are Jessica, the AI companion and care coordinator for a veteran named Pops who lives with his caregiver Ray (Raymo). You have a warm, grounding, and calm voice. You speak clearly and gently — never rushed, never clinical.

Your job:
- Help Pops with his daily routine reminders, medication check-ins, and general wellbeing
- Answer questions about the day, schedule, medications, or how he's feeling
- Coordinate with Raymo's instructions and the household schedule
- Parse smart home commands and confirm them (e.g. "turn on the living room light", "play music in the kitchen")
- Track mood and energy — adjust your tone to match Pops' cycle phase
- Be a reassuring, steady presence. You are not a chatbot — you are family infrastructure.

When the user mentions a smart home command, include a JSON block at the end of your response:
<device_command>{"device": "device_key", "action": "on|off|volume|brightness", "value": optional_number}</device_command>

Known devices: living_room_echo (Alexa, living room), bedroom_echo (Alexa, bedroom), kitchen_echo (Alexa, kitchen), sonos_living (Sonos, living room), sonos_bedroom (Sonos, bedroom), porch_light (light, porch), kitchen_light (light, kitchen), living_room_light (light, living room).

Current date context: You know today is Monday and Pops is on his Haldol 14-day medication cycle. Adjust expectations to his energy level.`;

router.get("/gemini/conversations", async (req, res) => {
  try {
    const convos = await db
      .select()
      .from(conversationsTable)
      .orderBy(desc(conversationsTable.createdAt));
    res.json(convos.map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt })));
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

router.post("/gemini/conversations", async (req, res) => {
  try {
    const { title } = z.object({ title: z.string() }).parse(req.body);
    const [created] = await db.insert(conversationsTable).values({ title }).returning();
    res.status(201).json({ id: created.id, title: created.title, createdAt: created.createdAt });
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    res.status(400).json({ error: "Failed to create conversation" });
  }
});

router.get("/gemini/conversations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [convo] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id));
    if (!convo) return res.status(404).json({ error: "Not found" });
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt));
    res.json({
      id: convo.id,
      title: convo.title,
      createdAt: convo.createdAt,
      messages: msgs.map((m) => ({ id: m.id, conversationId: m.conversationId, role: m.role, content: m.content, createdAt: m.createdAt })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

router.delete("/gemini/conversations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(messagesTable).where(eq(messagesTable.conversationId, id));
    await db.delete(conversationsTable).where(eq(conversationsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.get("/gemini/conversations/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt));
    res.json(msgs.map((m) => ({ id: m.id, conversationId: m.conversationId, role: m.role, content: m.content, createdAt: m.createdAt })));
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

router.post("/gemini/conversations/:id/messages", async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const { content } = z.object({ content: z.string() }).parse(req.body);

    const [userMsg] = await db
      .insert(messagesTable)
      .values({ conversationId, role: "user", content })
      .returning();

    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.createdAt));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(`data: ${JSON.stringify({ userMessageId: userMsg.id })}\n\n`);

    const chatMessages = [
      { role: "user" as const, parts: [{ text: JESSICA_SYSTEM_PROMPT }] },
      { role: "model" as const, parts: [{ text: "Understood. I am Jessica, ready to help Pops and Raymo." }] },
      ...history.map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        parts: [{ text: m.content }],
      })),
    ];

    let fullResponse = "";

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: chatMessages,
      config: { maxOutputTokens: 8192 },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    await db.insert(messagesTable).values({
      conversationId,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to stream message");
    res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
    res.end();
  }
});

export default router;
