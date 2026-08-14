/**
 * Fuzz / unit tests for normalizeExtracted() and ExtractedDocumentSchema.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server test
 *
 * Node 22+ supports TypeScript stripping natively via
 * --experimental-strip-types, so no build step is needed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeExtracted,
  normalizeAppointmentType,
  ExtractedDocumentSchema,
  type ExtractedDocument,
} from "./document-extraction.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert the result is a valid ExtractedDocument by re-parsing it. */
function assertValidShape(result: unknown, label: string) {
  // Re-parse the output through the schema — if it is already valid the parse
  // must succeed and the output must be deeply equal to the input.
  assert.doesNotThrow(
    () => ExtractedDocumentSchema.parse(result),
    `${label}: re-parsing the output should not throw`
  );

  const r = result as ExtractedDocument;

  // Required array fields are always arrays (never null / undefined / string).
  for (const key of [
    "appointments",
    "medications",
    "dietary_restrictions",
    "activity_restrictions",
    "wound_care",
  ] as const) {
    assert.ok(Array.isArray(r[key]), `${label}: ${key} must be an array`);
  }

  // source_label is always a non-null string (has a default).
  assert.ok(
    typeof r.source_label === "string",
    `${label}: source_label must be a string`
  );

  // card_last4 is null or exactly 4 digit characters.
  if (r.card_last4 !== null) {
    assert.match(
      r.card_last4,
      /^\d{4}$/,
      `${label}: card_last4 must be exactly 4 digits`
    );
  }
}

// ---------------------------------------------------------------------------
// normalizeExtracted — null / non-object inputs
// ---------------------------------------------------------------------------

describe("normalizeExtracted with null / non-object parsed input", () => {
  const cases: Array<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["number", 42],
    ["boolean true", true],
    ["array", []],
  ];

  for (const [label, input] of cases) {
    it(`does not throw for ${label}`, () => {
      const result = normalizeExtracted(input, "raw");
      assertValidShape(result, label);
      assert.equal(result.source_label, "Medical Document");
    });
  }
});

// ---------------------------------------------------------------------------
// normalizeExtracted — completely empty object
// ---------------------------------------------------------------------------

describe("normalizeExtracted with empty object", () => {
  it("fills all required fields with defaults", () => {
    const result = normalizeExtracted({}, "raw");
    assertValidShape(result, "empty object");
    assert.equal(result.source_label, "Medical Document");
    assert.deepEqual(result.appointments, []);
    assert.deepEqual(result.medications, []);
    assert.deepEqual(result.dietary_restrictions, []);
    assert.deepEqual(result.activity_restrictions, []);
    assert.deepEqual(result.wound_care, []);
    assert.equal(result.clinical_notes, "");
  });
});

// ---------------------------------------------------------------------------
// normalizeExtracted — arrays returned as strings (common Gemini failure mode)
// ---------------------------------------------------------------------------

describe("normalizeExtracted when array fields come back as strings", () => {
  it("coerces appointments string to []", () => {
    const result = normalizeExtracted(
      { appointments: "none found" },
      "raw"
    );
    assertValidShape(result, "appointments as string");
    assert.deepEqual(result.appointments, []);
  });

  it("coerces medications string to []", () => {
    const result = normalizeExtracted({ medications: "N/A" }, "raw");
    assertValidShape(result, "medications as string");
    assert.deepEqual(result.medications, []);
  });

  it("coerces dietary_restrictions string to []", () => {
    const result = normalizeExtracted(
      { dietary_restrictions: "Diabetic diet" },
      "raw"
    );
    assertValidShape(result, "dietary_restrictions as string");
    assert.deepEqual(result.dietary_restrictions, []);
  });

  it("coerces activity_restrictions null to []", () => {
    const result = normalizeExtracted(
      { activity_restrictions: null },
      "raw"
    );
    assertValidShape(result, "activity_restrictions null");
    assert.deepEqual(result.activity_restrictions, []);
  });

  it("coerces wound_care number to []", () => {
    const result = normalizeExtracted({ wound_care: 0 }, "raw");
    assertValidShape(result, "wound_care number");
    assert.deepEqual(result.wound_care, []);
  });
});

// ---------------------------------------------------------------------------
// normalizeExtracted — wrong field types on scalar fields
// ---------------------------------------------------------------------------

describe("normalizeExtracted with wrong scalar types", () => {
  it("coerces source_label number to string", () => {
    const result = normalizeExtracted({ source_label: 123 }, "raw");
    assertValidShape(result, "source_label number");
    assert.equal(result.source_label, "123");
  });

  it("coerces date boolean to string", () => {
    const result = normalizeExtracted({ date: false }, "raw");
    assertValidShape(result, "date boolean");
    assert.equal(result.date, "false");
  });

  it("keeps source_label default when source_label is an object", () => {
    const result = normalizeExtracted({ source_label: { nested: true } }, "raw");
    assertValidShape(result, "source_label object");
    assert.equal(result.source_label, "Medical Document");
  });

  it("keeps clinical_notes default empty string when it is an object", () => {
    const result = normalizeExtracted(
      { clinical_notes: { text: "something" } },
      "raw"
    );
    assertValidShape(result, "clinical_notes object");
    assert.equal(result.clinical_notes, "");
  });
});

// ---------------------------------------------------------------------------
// normalizeExtracted — nested nulls inside appointments / medications
// ---------------------------------------------------------------------------

describe("normalizeExtracted with null/missing fields inside nested objects", () => {
  it("keeps an appointment with all-null fields", () => {
    const result = normalizeExtracted(
      {
        appointments: [
          { date: null, time: null, provider: null, location: null, type: null },
        ],
      },
      "raw"
    );
    assertValidShape(result, "all-null appointment");
    assert.equal(result.appointments.length, 1);
    assert.equal(result.appointments[0].date, null);
    assert.equal(result.appointments[0].provider, null);
  });

  it("keeps a medication with all-null fields", () => {
    const result = normalizeExtracted(
      {
        medications: [
          {
            name: null,
            dose: null,
            frequency: null,
            instructions: null,
            timeOfDay: null,
          },
        ],
      },
      "raw"
    );
    assertValidShape(result, "all-null medication");
    assert.equal(result.medications.length, 1);
  });

  it("recovers when an appointment item is a string instead of an object", () => {
    const result = normalizeExtracted(
      { appointments: ["some string", null, 42] },
      "raw"
    );
    assertValidShape(result, "appointment items as primitives");
    // Each bad item falls back to the all-null default via .catch()
    for (const appt of result.appointments) {
      assert.equal(appt.date, null);
      assert.equal(appt.provider, null);
    }
  });

  it("recovers when a medication item is a string instead of an object", () => {
    const result = normalizeExtracted(
      { medications: ["take aspirin daily"] },
      "raw"
    );
    assertValidShape(result, "medication item as string");
    assert.equal(result.medications.length, 1);
    assert.equal(result.medications[0].name, null);
  });
});

// ---------------------------------------------------------------------------
// normalizeExtracted — truncated / partial JSON (parsed as partial objects)
// ---------------------------------------------------------------------------

describe("normalizeExtracted with partial (truncated) objects", () => {
  it("handles only source_label present", () => {
    const result = normalizeExtracted(
      { source_label: "VA Loma Linda - Discharge" },
      "raw"
    );
    assertValidShape(result, "partial: source_label only");
    assert.equal(result.source_label, "VA Loma Linda - Discharge");
    assert.deepEqual(result.medications, []);
  });

  it("handles only medications present, no appointments", () => {
    const result = normalizeExtracted(
      {
        medications: [{ name: "Haldol", dose: "2mg", timeOfDay: "morning" }],
      },
      "raw"
    );
    assertValidShape(result, "partial: medications only");
    assert.equal(result.medications.length, 1);
    assert.equal(result.medications[0].name, "Haldol");
  });

  it("handles extra unknown keys gracefully (Zod strips them)", () => {
    const result = normalizeExtracted(
      {
        source_label: "Test",
        some_future_gemini_field: "unexpected value",
        appointments: [],
      },
      "raw"
    );
    assertValidShape(result, "extra unknown keys");
    assert.equal(result.source_label, "Test");
  });
});

// ---------------------------------------------------------------------------
// card_last4 edge cases
// ---------------------------------------------------------------------------

describe("card_last4 extraction edge cases", () => {
  const cases: Array<[string, unknown, string | null]> = [
    ["null input", null, null],
    ["undefined input", undefined, null],
    ["bare 4 digits", "1234", "1234"],
    ["full 16-digit number", "4111111111111234", "1234"],
    ["masked '****1234'", "****1234", "1234"],
    ["'ending in 1234'", "ending in 1234", "1234"],
    ["'VISA ...1234'", "VISA ...1234", "1234"],
    ["only 3 digits", "123", null],
    ["empty string", "", null],
    ["letters only", "ABCD", null],
    ["numeric 0 (falsy)", 0, null],        // 0 → "0" → 1 digit → null
    ["number 1234", 1234, "1234"],
    ["object (invalid)", { n: 1 }, null],  // String({n:1}) → "[object Object]" → no digits → null
  ];

  for (const [label, input, expected] of cases) {
    it(`card_last4: ${label} → ${expected}`, () => {
      const result = normalizeExtracted({ card_last4: input }, "raw");
      assert.equal(result.card_last4, expected, `${label}`);
    });
  }
});

// ---------------------------------------------------------------------------
// normalizeAppointmentType
// ---------------------------------------------------------------------------

describe("normalizeAppointmentType", () => {
  const cases: Array<[string | null | undefined, string]> = [
    ["lab", "lab_work"],
    ["LAB", "lab_work"],
    ["bloodwork", "lab_work"],
    ["Blood Draw", "lab_work"],
    ["Laboratory", "lab_work"],
    ["primary-care", "primary_care"],
    ["Primary Care", "primary_care"],
    ["primary", "primary_care"],
    ["follow-up", "other"],
    ["specialist", "other"],
    ["other", "other"],
    ["", "primary_care"],
    [null, "primary_care"],
    [undefined, "primary_care"],
    ["CARDIOLOGY", "other"],
    ["va_appointment", "other"],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      assert.equal(normalizeAppointmentType(input), expected);
    });
  }
});

// ---------------------------------------------------------------------------
// Idempotency — normalizing already-normalized output must be stable
// ---------------------------------------------------------------------------

describe("idempotency: normalizing normalized output is stable", () => {
  const inputs = [
    {},
    { source_label: "Test", appointments: [], medications: [] },
    {
      source_label: "VA Note",
      appointments: [{ date: "2026-01-15", provider: "Dr. Smith" }],
      medications: [{ name: "Metformin", dose: "500mg", timeOfDay: "morning" }],
      dietary_restrictions: ["Diabetic diet"],
      card_last4: "1234",
    },
  ];

  for (const [i, input] of inputs.entries()) {
    it(`case ${i} is idempotent`, () => {
      const first = normalizeExtracted(input, "raw");
      const second = normalizeExtracted(first, "raw");
      assert.deepEqual(first, second, `idempotency case ${i}`);
    });
  }
});
