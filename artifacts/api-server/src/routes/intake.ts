import { Router, type IRouter } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import { z } from "zod";

const router: IRouter = Router();

const INTAKE_PROMPT = `You are analyzing a photo that is either a fridge interior, pantry shelves, or a grocery receipt.
Extract all identifiable food and household items with their quantities and estimated prices.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "items_detected": [
    {
      "name": "item name",
      "quantity": "estimated quantity (e.g. 1, 2, half-full)",
      "price_per_unit": 0.00,
      "category": "food|paper|toiletry|cleaning|medical",
      "replenishment_cycle": "weekly|monthly|quarterly|yearly",
      "needs_restock": true
    }
  ],
  "source_type": "fridge|pantry|receipt|unknown",
  "summary": "one sentence describing what you found"
}

For prices, estimate based on typical US grocery store prices if not visible.
Mark needs_restock: true if the item appears low/empty or if it is on a receipt (freshly purchased).
Focus on items relevant to an older veteran's household with a caregiver.`;

router.post("/intake/image", async (req, res) => {
  try {
    const { imageBase64, mimeType } = z.object({
      imageBase64: z.string().min(10),
      mimeType: z.string().default("image/jpeg"),
    }).parse(req.body);

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user" as const,
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: INTAKE_PROMPT },
        ],
      }],
    });

    const raw = (result as any).text ?? "";
    const jsonStr = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(jsonStr);
    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "Failed to process intake image");
    res.status(500).json({ error: "Image intake failed — ensure Gemini API is available and the image is a valid base64 JPEG/PNG." });
  }
});

export default router;
