import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  medicalDocumentsTable,
  medicationsTable,
  scheduleTasksTable,
  medicalAppointmentsTable,
  appSettingsTable,
} from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { dispatch } from "../lib/hermes";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  normalizeExtracted,
  normalizeAppointmentType,
} from "../lib/document-extraction";

const router: IRouter = Router();

async function ensureMedicalDocsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medical_documents (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'local',
      source_label TEXT NOT NULL DEFAULT 'Medical Document',
      raw_text TEXT NOT NULL DEFAULT '',
      structured_json TEXT NOT NULL DEFAULT '{}',
      card_last4 TEXT,
      applied_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Self-heal existing databases created before card_last4 existed.
  await pool.query(`ALTER TABLE medical_documents ADD COLUMN IF NOT EXISTS card_last4 TEXT`);
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
    {"date": "YYYY-MM-DD", "time": "12:00 PM format", "provider": "Dr. Name", "location": "place", "type": "follow-up|primary-care|specialist|bloodwork|lab|other"}
  ],
  "medications": [
    {"name": "medication name", "dose": "dose or null", "frequency": "frequency or null", "instructions": "full instructions", "timeOfDay": "morning|afternoon|evening|night|as-needed"}
  ],
  "dietary_restrictions": ["list of dietary restrictions as plain strings"],
  "activity_restrictions": ["list of activity restrictions as plain strings"],
  "wound_care": ["wound care instructions as plain strings"],
  "clinical_notes": "discharge diagnosis, condition at discharge, and other clinical narrative as a single string",
  "discharge_instructions": "any discharge instructions not covered above",
  "card_last4": "if this is a receipt or payment confirmation showing a payment card (e.g. 'VISA ...1234' or 'card ending in 1234'), the LAST 4 DIGITS ONLY as a string, else null"
}

Rules:
- dates: convert all dates to YYYY-MM-DD format
- If a field has no data, use null or an empty array []
- dietary_restrictions: extract ONLY diet instructions (e.g. "Diabetic diet")
- activity_restrictions: extract ONLY physical limitations (e.g. "No bending/heavy lifting", "No eye rubbing")
- Include ALL medications mentioned, including eye drops or topical treatments
- appointments: include ALL future appointments mentioned in the document
- card_last4: NEVER return more than the last 4 digits of any card number, even if more digits are visible on the document. If unsure or no card is shown, return null.`;

router.get("/documents/care-context", async (req, res) => {
  try {
    // inArray, not a raw `= ANY(${keys})` — Drizzle binds a JS array as a
    // single scalar parameter, which Postgres rejects, so the raw form threw
    // a 500 on every request and silently hid the dashboard's care alerts.
    const rows = await db.select().from(appSettingsTable).where(
      inArray(appSettingsTable.key, ["dietary_profile", "activity_restrictions"])
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

// Ray's requirement is that anything scanned stays recallable forever — a
// hard cap here silently makes older documents invisible in the UI even
// though the row still exists in the DB. 500 is a generous ceiling (this is
// a single household's paperwork, not a multi-tenant table) that still
// protects against an unbounded query; pair with the frontend search box
// rather than real pagination since document counts here are small.
const MAX_DOCUMENTS_RETURNED = 500;

router.get("/documents", async (req, res) => {
  try {
    await ensureMedicalDocsTable();
    const rows = await db
      .select()
      .from(medicalDocumentsTable)
      .orderBy(desc(medicalDocumentsTable.createdAt))
      .limit(MAX_DOCUMENTS_RETURNED);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list medical documents");
    res.status(500).json({ error: "Failed to list documents" });
  }
});

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

// Lets the family set/correct/clear which card a scan is associated with
// when OCR misses it or gets it wrong — the "last 4 digits" are never
// reliably visible on every document, so this can't depend on extraction alone.
router.patch("/documents/:id", async (req, res) => {
  try {
    await ensureMedicalDocsTable();
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }
    const body = z.object({
      card_last4: z.string().nullable(),
    }).parse(req.body);

    let cardLast4: string | null = null;
    if (body.card_last4) {
      const digits = body.card_last4.replace(/\D/g, "");
      if (digits.length !== 4) {
        res.status(400).json({ error: "card_last4 must be exactly 4 digits" });
        return;
      }
      cardLast4 = digits;
    }

    const [updated] = await db
      .update(medicalDocumentsTable)
      .set({ cardLast4 })
      .where(eq(medicalDocumentsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    req.log.error({ err }, "Failed to update document card");
    res.status(500).json({ error: "Update failed" });
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
    // normalizeExtracted() lives in lib/document-extraction.ts and is
    // unit-tested there. It coerces whatever Gemini returned (truncated JSON,
    // wrong field types, nested nulls, top-level array) into a valid
    // ExtractedDocument without ever throwing.
    const extracted = normalizeExtracted(parsed, rawText);

    const [doc] = await db.insert(medicalDocumentsTable).values({
      tenantId: "local",
      sourceLabel: extracted.source_label ?? "Medical Document",
      rawText,
      structuredJson: JSON.stringify(extracted),
      cardLast4: extracted.card_last4 ?? null,
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

    // All writes are inside a single transaction so a mid-apply failure rolls
    // back completely — Pops' care plan is never left half-updated.
    await db.transaction(async (tx) => {
      for (const appt of body.appointments) {
        const title = `Appt: ${appt.provider}${appt.location ? ` @ ${appt.location}` : ""}`;
        const timeLabel = appt.time ?? "TBD";
        const descriptionPrefix = `${appt.date}${appt.location ? ` — ${appt.location}` : ""}`;

        // scheduleTasksTable (Rotation/Dashboard display) and
        // medicalAppointmentsTable (the reminder-call job's data source) are
        // checked and inserted independently below — deliberately NOT one
        // `continue` gating both — so each table's duplicate protection holds
        // on its own. Without this, a document that already has its schedule
        // task (e.g. applied before the medical_appointments dual-write below
        // existed) would short-circuit here and never backfill the missing
        // medical_appointments row even when Ray explicitly re-applies it.
        //
        // Decision point (intentionally not automated): appointments from
        // documents applied before this fix — which exist ONLY in
        // schedule_tasks — are not bulk-migrated into medical_appointments by
        // this endpoint. Ray must click "Update Care Plan" on that specific
        // document (which now backfills it via this same independent check)
        // or re-enter the appointment by hand in the Appointments tab.
        let scheduleTaskExists = false;
        if (body.overwrite) {
          const existing = await tx
            .select({ id: scheduleTasksTable.id })
            .from(scheduleTasksTable)
            .where(
              sql`${scheduleTasksTable.title} = ${title} AND ${scheduleTasksTable.description} LIKE ${descriptionPrefix + "%"}`
            )
            .limit(1);
          scheduleTaskExists = existing.length > 0;
        }
        if (!scheduleTaskExists) {
          await tx.insert(scheduleTasksTable).values({
            tenantId: "local",
            quarter: "Q1",
            timeLabel,
            title,
            description: `${descriptionPrefix}. Source: ${body.source_label}`,
            isActive: true,
            isCompleted: false,
            order: 99,
          });
        }

        // Dual-write into medical_appointments (kept separate from
        // scheduleTasksTable above, which only drives the Rotation/Dashboard
        // display). The night-before reminder-call job in lib/call-scheduler.ts
        // queries medical_appointments directly, so without this insert a
        // scanned appointment would show up on the dashboard but Jessica would
        // never call to remind Pops about it the evening before.
        let medApptExists = false;
        if (body.overwrite) {
          const existingMedAppt = await tx
            .select({ id: medicalAppointmentsTable.id })
            .from(medicalAppointmentsTable)
            .where(
              sql`${medicalAppointmentsTable.appointmentDate} = ${appt.date} AND ${medicalAppointmentsTable.provider} = ${appt.provider}`
            )
            .limit(1);
          medApptExists = existingMedAppt.length > 0;
        }
        if (!medApptExists) {
          await tx.insert(medicalAppointmentsTable).values({
            appointmentDate: appt.date,
            appointmentTime: appt.time ?? "09:00",
            provider: appt.provider,
            location: appt.location ?? null,
            type: normalizeAppointmentType(appt.type),
            notes: `Source: ${body.source_label}`,
          });
        }

        details.push(
          scheduleTaskExists && medApptExists
            ? `Appointment already scheduled (skipped): ${title} on ${appt.date}`
            : `Appointment added: ${title} on ${appt.date}`
        );
      }

      for (const med of body.medications) {
        if (body.overwrite) {
          const deactivated = await tx
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

        await tx.insert(medicationsTable).values({
          name: med.name,
          dose: med.dose ?? "as prescribed",
          frequency: med.frequency ?? "as directed",
          timeOfDay: med.timeOfDay ?? "morning",
          notes: med.instructions ?? null,
          active: true,
        });
        details.push(`Medication added: ${med.name}${med.dose ? ` (${med.dose})` : ""}`);
      }

      // On a re-apply (overwrite: true), write even an empty array so that
      // unchecking every restriction actually clears the stored value instead
      // of silently leaving the old one in place. On a first-time apply we
      // keep the old "only write when present" behaviour — there's nothing to
      // replace yet, so an empty submission means "skip this section."
      if (body.dietary_restrictions.length > 0 || body.overwrite) {
        const dietValue = JSON.stringify({
          restrictions: body.dietary_restrictions,
          source: body.source_label,
          updated_at: new Date().toISOString(),
        });
        await tx.execute(sql`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('dietary_profile', ${dietValue}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${dietValue}, updated_at = NOW()
        `);
        details.push(
          body.dietary_restrictions.length > 0
            ? `Dietary profile updated: ${body.dietary_restrictions.join(", ")}`
            : "Dietary profile cleared (all restrictions removed)"
        );
      }

      if (body.activity_restrictions.length > 0 || body.overwrite) {
        const actValue = JSON.stringify({
          restrictions: body.activity_restrictions,
          source: body.source_label,
          updated_at: new Date().toISOString(),
        });
        await tx.execute(sql`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('activity_restrictions', ${actValue}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${actValue}, updated_at = NOW()
        `);
        details.push(
          body.activity_restrictions.length > 0
            ? `Activity restrictions updated: ${body.activity_restrictions.join(", ")}`
            : "Activity restrictions cleared (all restrictions removed)"
        );
      }

      if (body.clinical_notes) {
        await tx.execute(sql`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('clinical_notes_latest', ${body.clinical_notes}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${body.clinical_notes}, updated_at = NOW()
        `);
      }

      // Mark the document as applied only after all other writes succeed —
      // this is the commit sentinel; if anything above throws, this never runs
      // and the transaction rolls back, so appliedAt stays null and Ray can
      // safely try again.
      await tx.update(medicalDocumentsTable)
        .set({ appliedAt: new Date() })
        .where(eq(medicalDocumentsTable.id, body.docId));
    });

    // dispatch runs after the transaction commits and is a best-effort
    // notification — a dispatch failure does NOT mean the care plan wasn't
    // saved (the transaction already committed), so we log and continue
    // rather than surfacing a misleading error to Ray.
    try {
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
    } catch (dispatchErr) {
      req.log.warn({ err: dispatchErr }, "MEDICAL_DOC_APPLIED dispatch failed (care plan was saved successfully)");
    }

    const summary = details.length > 0
      ? `Applied ${details.length} item(s) from ${body.source_label}.`
      : `Document processed — no items selected to apply.`;

    res.json({ ok: true, summary, details });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid apply payload" });
      return;
    }
    req.log.error({ err }, "Document apply failed — transaction rolled back");
    res.status(500).json({
      error: "Apply failed — nothing was saved",
      message: "An error occurred while applying the document. The care plan was not changed — no items were partially applied. You can try again safely.",
    });
  }
});

export default router;
