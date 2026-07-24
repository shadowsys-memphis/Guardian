import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  medicalDocumentsTable,
  medicationsTable,
  scheduleTasksTable,
  appSettingsTable,
  careEventsTable,
} from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

async function ensureMedicalDocsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medical_documents (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'local',
      source_label TEXT NOT NULL DEFAULT 'Medical Document',
      raw_text TEXT NOT NULL DEFAULT '',
      structured_json TEXT NOT NULL DEFAULT '{}',
      applied_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

const EXTRACTION_PROMPT = `You are a medical document parser for a veteran caregiver app.
Extract ALL structured information from this medical document image.
Return ONLY valid JSON matching exactly this schema — no markdown, no explanation:

{
  "source_label": "short title e.g. 'VA Loma Linda - Post-Op Instructions'",
  "patient_name": "full name or null",
  "date": "YYYY-MM-DD or null",
  "physician": "name and specialty or null",
  "facility": "facility name or null",
  "appointments": [
    {"date": "YYYY-MM-DD", "time": "12:00 PM format", "provider": "Dr. Name", "location": "place", "type": "follow-up|primary-care|specialist|other"}
  ],
  "medications": [
    {"name": "medication name", "dose": "dose or null", "frequency": "frequency or null", "instructions": "full instructions", "timeOfDay": "morning|afternoon|evening|night|as-needed"}
  ],
  "dietary_restrictions": ["list of dietary restrictions as plain strings"],
  "activity_restrictions": ["list of activity restrictions as plain strings"],
  "wound_care": ["wound care instructions as plain strings"],
  "clinical_notes": "discharge diagnosis, condition at discharge, and other clinical narrative as a single string",
  "discharge_instructions": "any discharge instructions not covered above"
}

Rules:
- dates: convert all dates to YYYY-MM-DD format
- If a field has no data, use null or an empty array []
- dietary_restrictions: extract ONLY diet instructions (e.g. "Diabetic diet")
- activity_restrictions: extract ONLY physical limitations (e.g. "No bending/heavy lifting", "No eye rubbing")
- Include ALL medications mentioned, including eye drops or topical treatments
- appointments: include ALL future appointments mentioned in the document`;

router.get("/documents", async (req, res) => {
  try {
    await ensureMedicalDocsTable();
    const rows = await db
      .select()
      .from(medicalDocumentsTable)
      .orderBy(desc(medicalDocumentsTable.createdAt))
      .limit(20);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list medical documents");
    res.status(500).json({ error: "Failed to list documents" });
  }
});

router.post("/documents/scan", async (req, res) => {
  try {
    await ensureMedicalDocsTable();

    const body = z.object({
      imageBase64: z.string().min(100),
      mimeType: z.string().default("image/jpeg"),
    }).parse(req.body);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: body.mimeType, data: body.imageBase64 } },
          { text: EXTRACTION_PROMPT },
        ],
      }],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    });

    const rawText = response.text ?? "{}";
    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(rawText);
    } catch {
      extracted = { source_label: "Medical Document", raw_text: rawText };
    }

    const [doc] = await db.insert(medicalDocumentsTable).values({
      tenantId: "local",
      sourceLabel: (extracted.source_label as string) ?? "Medical Document",
      rawText,
      structuredJson: JSON.stringify(extracted),
    }).returning();

    res.json({ docId: doc.id, extracted });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Missing imageBase64" });
      return;
    }
    req.log.error({ err }, "Document scan failed");
    res.status(500).json({ error: "Scan failed" });
  }
});

router.post("/documents/apply", async (req, res) => {
  try {
    const body = z.object({
      docId: z.number().int(),
      source_label: z.string().default("Medical Document"),
      appointments: z.array(z.object({
        date: z.string(),
        time: z.string().optional(),
        provider: z.string(),
        location: z.string().optional(),
        type: z.string().optional(),
      })).default([]),
      medications: z.array(z.object({
        name: z.string(),
        dose: z.string().optional().nullable(),
        frequency: z.string().optional().nullable(),
        instructions: z.string().optional().nullable(),
        timeOfDay: z.string().optional(),
      })).default([]),
      dietary_restrictions: z.array(z.string()).default([]),
      activity_restrictions: z.array(z.string()).default([]),
      clinical_notes: z.string().default(""),
    }).parse(req.body);

    const details: string[] = [];

    for (const appt of body.appointments) {
      const title = `Appt: ${appt.provider}${appt.location ? ` @ ${appt.location}` : ""}`;
      const timeLabel = appt.time ?? "TBD";
      await db.insert(scheduleTasksTable).values({
        tenantId: "local",
        quarter: "Q1",
        timeLabel,
        title,
        description: `${appt.date}${appt.location ? ` — ${appt.location}` : ""}. Source: ${body.source_label}`,
        isActive: true,
        isCompleted: false,
        order: 99,
      });
      details.push(`Appointment added: ${title} on ${appt.date}`);
    }

    for (const med of body.medications) {
      await db.insert(medicationsTable).values({
        name: med.name,
        dose: med.dose ?? "as prescribed",
        frequency: med.frequency ?? "as directed",
        timeOfDay: med.timeOfDay ?? "morning",
        notes: med.instructions ?? null,
        active: true,
      });
      details.push(`Medication added: ${med.name}${med.dose ? ` (${med.dose})` : ""}`);
    }

    if (body.dietary_restrictions.length > 0) {
      const dietValue = JSON.stringify({
        restrictions: body.dietary_restrictions,
        source: body.source_label,
        updated_at: new Date().toISOString(),
      });
      await db.execute(sql`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('dietary_profile', ${dietValue}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${dietValue}, updated_at = NOW()
      `);
      details.push(`Dietary profile updated: ${body.dietary_restrictions.join(", ")}`);
    }

    if (body.activity_restrictions.length > 0) {
      const actValue = JSON.stringify({
        restrictions: body.activity_restrictions,
        source: body.source_label,
        updated_at: new Date().toISOString(),
      });
      await db.execute(sql`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('activity_restrictions', ${actValue}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${actValue}, updated_at = NOW()
      `);
      details.push(`Activity restrictions updated: ${body.activity_restrictions.join(", ")}`);
    }

    if (body.clinical_notes) {
      await db.execute(sql`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('clinical_notes_latest', ${body.clinical_notes}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${body.clinical_notes}, updated_at = NOW()
      `);
    }

    await db.update(medicalDocumentsTable)
      .set({ appliedAt: new Date() })
      .where(eq(medicalDocumentsTable.id, body.docId));

    await db.insert(careEventsTable).values({
      tenantId: "local",
      source: "admin",
      actor: "caregiver",
      eventType: "MEDICAL_DOC_APPLIED",
      severity: null,
      confidence: "high",
      payload: JSON.stringify({ docId: body.docId, source_label: body.source_label, details }),
      outcome: "dispatched",
      doctorRelevant: true,
      learningRelevant: true,
    }).catch(() => {});

    const summary = details.length > 0
      ? `Applied ${details.length} item(s) from ${body.source_label}.`
      : `Document processed — no items selected to apply.`;

    res.json({ ok: true, summary, details });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid apply payload" });
      return;
    }
    req.log.error({ err }, "Document apply failed");
    res.status(500).json({ error: "Apply failed" });
  }
});

export default router;
