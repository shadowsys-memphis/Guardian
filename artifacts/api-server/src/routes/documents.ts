import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  medicalDocumentsTable,
  medicationsTable,
  scheduleTasksTable,
  appSettingsTable,
} from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { dispatch } from "../lib/hermes";
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

router.get("/documents/care-context", async (req, res) => {
  try {
    const keys = ["dietary_profile", "activity_restrictions"];
    const rows = await db.select().from(appSettingsTable).where(
      sql`${appSettingsTable.key} = ANY(${keys})`
    );
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch care context");
    res.status(500).json({ error: "Failed" });
  }
});

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

// Gemini's responseMimeType:"application/json" only guarantees valid JSON
// syntax — it doesn't guarantee our schema. A field can come back as the
// wrong type (e.g. appointments: "none found" instead of []) or be missing
// entirely. This coerces whatever comes back into the shape the rest of the
// app (and the frontend's .map() calls) expect, instead of crashing on it.
const looseString = z.union([z.string(), z.number(), z.boolean()]).transform(String).nullable().catch(null);
const ExtractedAppointment = z.object({
  date: looseString.catch(null),
  time: looseString.catch(null),
  provider: looseString.catch(null),
  location: looseString.catch(null),
  type: looseString.catch(null),
}).catch({ date: null, time: null, provider: null, location: null, type: null });
const ExtractedMedication = z.object({
  name: looseString.catch(null),
  dose: looseString.catch(null),
  frequency: looseString.catch(null),
  instructions: looseString.catch(null),
  timeOfDay: looseString.catch(null),
}).catch({ name: null, dose: null, frequency: null, instructions: null, timeOfDay: null });
const ExtractedDocumentSchema = z.object({
  source_label: looseString.catch("Medical Document"),
  patient_name: looseString,
  date: looseString,
  physician: looseString,
  facility: looseString,
  appointments: z.array(ExtractedAppointment).catch([]),
  medications: z.array(ExtractedMedication).catch([]),
  dietary_restrictions: z.array(looseString).catch([]),
  activity_restrictions: z.array(looseString).catch([]),
  wound_care: z.array(looseString).catch([]),
  clinical_notes: looseString.catch(""),
  discharge_instructions: looseString,
});

function normalizeExtracted(parsed: unknown, rawText: string): Record<string, unknown> {
  if (typeof parsed !== "object" || parsed === null) {
    return { source_label: "Medical Document", raw_text: rawText };
  }
  return ExtractedDocumentSchema.parse(parsed);
}

router.delete("/documents/:id", async (req, res) => {
  try {
    await ensureMedicalDocsTable();
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }
    const deleted = await db
      .delete(medicalDocumentsTable)
      .where(eq(medicalDocumentsTable.id, id))
      .returning({ id: medicalDocumentsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete document");
    res.status(500).json({ error: "Failed to delete document" });
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
    const extracted = normalizeExtracted(parsed, rawText);

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
      overwrite: z.boolean().default(false),
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

    // Block re-applying a document that's already reflected in the active
    // care plan — either because this exact doc row was already applied
    // (and the caller isn't explicitly asking to update it via overwrite),
    // or because another document with identical extracted text was applied
    // earlier (same paperwork scanned/uploaded twice).
    const thisDocRows = await db
      .select({ appliedAt: medicalDocumentsTable.appliedAt, rawText: medicalDocumentsTable.rawText })
      .from(medicalDocumentsTable)
      .where(eq(medicalDocumentsTable.id, body.docId))
      .limit(1);
    const thisDoc = thisDocRows[0];

    if (thisDoc?.appliedAt && !body.overwrite) {
      res.status(409).json({
        error: "already_applied",
        message: "This document has already been applied to the care plan. Use \"Update Care Plan\" if you want to re-apply it.",
      });
      return;
    }

    if (thisDoc?.rawText) {
      const dupeRows = await db
        .select({ id: medicalDocumentsTable.id, sourceLabel: medicalDocumentsTable.sourceLabel })
        .from(medicalDocumentsTable)
        .where(
          sql`${medicalDocumentsTable.rawText} = ${thisDoc.rawText} AND ${medicalDocumentsTable.id} != ${body.docId} AND ${medicalDocumentsTable.appliedAt} IS NOT NULL`
        )
        .limit(1);
      if (dupeRows.length > 0 && !body.overwrite) {
        res.status(409).json({
          error: "duplicate_of_applied_document",
          message: `This looks like the same document as "${dupeRows[0].sourceLabel}" (already applied to the care plan). Skipping to avoid duplicate entries.`,
          matchingDocId: dupeRows[0].id,
        });
        return;
      }
    }

    const details: string[] = [];

    for (const appt of body.appointments) {
      const title = `Appt: ${appt.provider}${appt.location ? ` @ ${appt.location}` : ""}`;
      const timeLabel = appt.time ?? "TBD";
      const descriptionPrefix = `${appt.date}${appt.location ? ` — ${appt.location}` : ""}`;

      if (body.overwrite) {
        const existing = await db
          .select()
          .from(scheduleTasksTable)
          .where(
            sql`${scheduleTasksTable.title} = ${title} AND ${scheduleTasksTable.description} LIKE ${descriptionPrefix + "%"}`
          )
          .limit(1);
        if (existing.length > 0) {
          details.push(`Appointment already scheduled (skipped): ${title} on ${appt.date}`);
          continue;
        }
      }

      await db.insert(scheduleTasksTable).values({
        tenantId: "local",
        quarter: "Q1",
        timeLabel,
        title,
        description: `${descriptionPrefix}. Source: ${body.source_label}`,
        isActive: true,
        isCompleted: false,
        order: 99,
      });
      details.push(`Appointment added: ${title} on ${appt.date}`);
    }

    for (const med of body.medications) {
      if (body.overwrite) {
        const deactivated = await db
          .update(medicationsTable)
          .set({ active: false })
          .where(
            sql`LOWER(${medicationsTable.name}) = LOWER(${med.name}) AND ${medicationsTable.active} = true`
          )
          .returning();
        if (deactivated.length > 0) {
          details.push(`Deactivated old medication: ${med.name} (${deactivated.length} entry)`);
        }
      }

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

    await dispatch(
      {
        type: "MEDICAL_DOC_APPLIED",
        title: body.source_label,
        details: details.join("; "),
        docId: body.docId,
      },
      {
        tenantId: "local",
        source: "admin",
        actor: "caregiver",
        confidence: "high",
      }
    );

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
