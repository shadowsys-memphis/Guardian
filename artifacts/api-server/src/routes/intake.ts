import { Router, type IRouter } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import { z } from "zod/v4";

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

const VISION_INTAKE_PROMPT = `You are analyzing a photo of a doctor's care plan, clinical notes, discharge instructions, or medical document for a veteran patient.

Extract all actionable clinical information and return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "instructions": ["new care instruction or directive for the caregiver"],
  "medicationChanges": [
    {
      "medication": "medication name",
      "change": "description of change (e.g. dose increased, new medication, discontinued)",
      "dose": "new dose if stated, else null"
    }
  ],
  "tasks": ["follow-up task or action item for the caregiver"],
  "appointment": {
    "date": "YYYY-MM-DD or null if not clearly stated",
    "time": "HH:MM or null",
    "provider": "provider or clinic name or null",
    "apptType": "primary_care|psychiatry|neurology|cardiology|other",
    "notes": "any additional context"
  },
  "summary": "one sentence describing the overall purpose of this document"
}

If a section has no items, use an empty array [] or null for appointment fields.
Prioritize concrete caregiver actions. If the document is not a medical document, return empty arrays and null appointment.`;

router.post("/intake/vision", async (req, res) => {
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
          { text: VISION_INTAKE_PROMPT },
        ],
      }],
    });

    const raw = (result as any).text ?? "";
    const jsonStr = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(jsonStr);

    const normalized = {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      instructions: Array.isArray(parsed.instructions) ? parsed.instructions.filter((x: unknown) => typeof x === "string") : [],
      medicationChanges: Array.isArray(parsed.medicationChanges)
        ? parsed.medicationChanges.map((mc: any) => ({
            medication: typeof mc?.medication === "string" ? mc.medication : "",
            change: typeof mc?.change === "string" ? mc.change : "",
            dose: typeof mc?.dose === "string" ? mc.dose : null,
          }))
        : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter((x: unknown) => typeof x === "string") : [],
      appointment: parsed.appointment && typeof parsed.appointment === "object"
        ? {
            date: typeof parsed.appointment.date === "string" ? parsed.appointment.date : null,
            time: typeof parsed.appointment.time === "string" ? parsed.appointment.time : null,
            provider: typeof parsed.appointment.provider === "string" ? parsed.appointment.provider : null,
            apptType: typeof parsed.appointment.apptType === "string" ? parsed.appointment.apptType : "primary_care",
            notes: typeof parsed.appointment.notes === "string" ? parsed.appointment.notes : "",
          }
        : null,
    };

    res.json(normalized);
  } catch (err) {
    req.log.error({ err }, "Failed to process vision intake");
    res.status(500).json({ error: "Vision intake failed — ensure Gemini API is available and the image is a valid base64 JPEG/PNG." });
  }
});

export default router;
