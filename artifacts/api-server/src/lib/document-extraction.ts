/**
 * Shared Zod schemas and helpers for normalizing Gemini's document-extraction
 * output into the shape the rest of the app (and the frontend's .map() calls)
 * expect.  Lives here — with no DB or AI imports — so it can be unit-tested
 * in isolation.
 *
 * Design note on the two-variant looseString pattern
 * ---------------------------------------------------
 * `looseStringRaw` coerces primitive inputs to string/null but does NOT have
 * a built-in `.catch()`.  This means callers can chain their own
 * `.catch(default)` and it will actually fire when the input is an object,
 * array, or other non-primitive (e.g. source_label: looseStringRaw.catch("Medical Document")).
 *
 * `looseString` adds `.catch(null)` on top so it is always safe to use for
 * nullable fields where null is the right sentinel.  DO NOT stack another
 * `.catch()` on top of `looseString` — the outer catch is unreachable because
 * `looseString` never throws.
 */

import { z } from "zod";

// Coerces string | number | boolean → string, passes null through as null,
// throws for objects / arrays / undefined.  Use this as the base when you
// want a field-specific non-null default via .catch(yourDefault).
const looseStringRaw = z
  .union([z.string(), z.number(), z.boolean()])
  .transform(String)
  .nullable();

// Always-safe variant: returns string | null, never throws.
// Use for nullable fields.  Do NOT chain .catch() on top of this.
export const looseString = looseStringRaw.catch(null);

// Defensively reduces whatever Gemini returns (a bare "1234", "****1234",
// "ending in 1234", or a full 16-digit number) to exactly the last 4 digits.
// Never lets more than 4 digits through, regardless of model output.
export const cardLast4Schema = z
  .any()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const digits = String(v).replace(/\D/g, "");
    const last4 = digits.slice(-4);
    return last4.length === 4 ? last4 : null;
  })
  .catch(null);

export const ExtractedAppointment = z
  .object({
    date: looseString,
    time: looseString,
    provider: looseString,
    location: looseString,
    type: looseString,
  })
  .catch({ date: null, time: null, provider: null, location: null, type: null });

export const ExtractedMedication = z
  .object({
    name: looseString,
    dose: looseString,
    frequency: looseString,
    instructions: looseString,
    timeOfDay: looseString,
  })
  .catch({ name: null, dose: null, frequency: null, instructions: null, timeOfDay: null });

export const ExtractedDocumentSchema = z.object({
  // Use looseStringRaw.catch(default) for fields that must have a non-null
  // fallback — looseStringRaw can still throw for objects/arrays, so the
  // field-level .catch(default) actually fires.
  source_label: looseStringRaw.catch("Medical Document"),
  clinical_notes: looseStringRaw.catch(""),
  // Nullable scalars — null is the right sentinel when the field is absent.
  patient_name: looseString,
  date: looseString,
  physician: looseString,
  facility: looseString,
  discharge_instructions: looseString,
  // Array fields default to [] when Gemini returns a string or other non-array.
  appointments: z.array(ExtractedAppointment).catch([]),
  medications: z.array(ExtractedMedication).catch([]),
  dietary_restrictions: z.array(looseString).catch([]),
  activity_restrictions: z.array(looseString).catch([]),
  wound_care: z.array(looseString).catch([]),
  card_last4: cardLast4Schema,
});

export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;

/**
 * Coerces whatever Gemini returned (or failed to return) into a safe
 * ExtractedDocument.  Never throws.
 */
export function normalizeExtracted(
  parsed: unknown,
  rawText: string
): ExtractedDocument {
  // Arrays pass typeof === "object" but z.object() rejects them; treat
  // a top-level array the same as null — Gemini should always return an object.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return ExtractedDocumentSchema.parse({
      source_label: "Medical Document",
      raw_text: rawText,
    });
  }
  return ExtractedDocumentSchema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Appointment-type normalizer (also tested here, no external deps)
// ---------------------------------------------------------------------------

/**
 * Collapses Gemini's free-text appointment type into the fixed vocabulary the
 * Appointments tab and the night-before reminder-call job understand.
 *
 * "follow-up" / "specialist" fall back to "other" — there is no equivalent
 * bucket in the UI's TYPE_LABELS map.  "lab_work" satisfies the call-scheduler's
 * type.includes("lab") fasting-warning check.
 */
export function normalizeAppointmentType(
  rawType: string | null | undefined
): string {
  const t = (rawType ?? "").toLowerCase().trim();
  if (t.includes("blood") || t.includes("lab")) return "lab_work";
  if (t.includes("primary")) return "primary_care";
  if (!t) return "primary_care";
  return "other";
}
