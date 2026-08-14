/**
 * documents apply endpoint — transaction rollback test
 *
 * Verifies that a DB failure partway through the apply handler:
 *   1. Causes db.transaction() to propagate the error (drizzle rollback).
 *   2. Returns HTTP 500 with the exact error string Ray sees in the UI.
 *   3. Does not reach the app_settings writes that follow the failed insert,
 *      proving the transaction aborted before committing anything.
 *
 * The test mounts only the documents router on a minimal Express app so it
 * doesn't need to resolve every other route's workspace-package imports.
 *
 * vi.mock() factories are hoisted by Vitest — all values used inside them
 * must be defined inside the factory, not at the module top level.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ---------------------------------------------------------------------------
// @workspace/db mock
//
// All table stubs are defined inside the factory (hoisting safety — top-level
// variables are not yet initialised when a hoisted vi.mock factory runs).
// `db` is set to null here and replaced per-test in beforeEach via dbModule.
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => ({
  scheduleTasksTable:       { _tag: "scheduleTasksTable" },
  medicalAppointmentsTable: { _tag: "medicalAppointmentsTable" },
  medicationsTable:         { _tag: "medicationsTable" },
  appSettingsTable:         { _tag: "appSettingsTable" },
  medicalDocumentsTable:    { _tag: "medicalDocumentsTable" },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  db: null, // replaced per-test
}));

// Mock the AI client — the scan route references `ai`; it must resolve even
// though the apply route never calls it.
vi.mock("@workspace/integrations-gemini-ai", () => ({
  ai: { models: { generateContent: vi.fn() } },
}));

// Mock Hermes — dispatch fires after a successful transaction; we don't want
// side-effects (or real network calls) in unit tests.
vi.mock("../lib/hermes.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered.
// Only import the documents router — not the full app — so we don't have to
// resolve @workspace/db/schema, @workspace/api-zod, etc. that other routes
// drag in transitively.
// ---------------------------------------------------------------------------
import * as dbModule from "@workspace/db";
import documentsRouter from "./documents.js";

/** Minimal test server: just the documents router, with JSON parsing. */
function buildApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // pinoHttp attaches req.log — documents.ts calls req.log.error on failures.
  // Provide a lightweight stub so those calls don't crash.
  app.use((_req, _res, next) => {
    (_req as unknown as Record<string, unknown>).log = {
      error: () => {},
      warn:  () => {},
      info:  () => {},
    };
    next();
  });
  app.use(documentsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Query-builder chain factories
// ---------------------------------------------------------------------------

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from  = () => chain;
  chain.where = () => chain;
  chain.limit = () => Promise.resolve(rows);
  return chain;
}

function makeInsertOk() {
  return { values: vi.fn().mockResolvedValue([]) };
}

function makeInsertFail(err: Error) {
  return { values: vi.fn().mockRejectedValue(err) };
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set       = () => chain;
  chain.where     = () => chain;
  chain.returning = () => Promise.resolve([]);
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /documents/apply — transaction rollback on mid-apply failure", () => {
  let txInsert:    ReturnType<typeof vi.fn>;
  let txExecute:   ReturnType<typeof vi.fn>;
  let dbTransaction: ReturnType<typeof vi.fn>;

  /** Payload with 1 appointment + 1 medication + restrictions. */
  const payload = {
    docId: 99,
    source_label: "VA Post-Op Instructions",
    appointments: [
      {
        date:     "2026-09-15",
        time:     "10:00 AM",
        provider: "Dr. Ortega",
        location: "VA Loma Linda",
        type:     "follow-up",
      },
    ],
    medications: [{ name: "Haldol", dose: "2mg", frequency: "nightly" }],
    dietary_restrictions:  ["Low sodium"],
    activity_restrictions: ["No heavy lifting"],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    const simulatedDbError = new Error("simulated Postgres failure");

    // -----------------------------------------------------------------------
    // tx.insert call order for the payload above (overwrite defaults false,
    // so existence checks are skipped and inserts go straight through):
    //
    //   1st call → scheduleTasksTable        (appointment → schedule_tasks)  OK
    //   2nd call → medicalAppointmentsTable  (appointment → medical_appts)   OK
    //   3rd call → medicationsTable                                           THROWS
    //
    // tx.execute() handles the app_settings upserts that come AFTER
    // medications — it must NOT be called if the 3rd insert throws.
    // -----------------------------------------------------------------------
    txInsert = vi.fn()
      .mockReturnValueOnce(makeInsertOk())                    // schedule_tasks
      .mockReturnValueOnce(makeInsertOk())                    // medical_appointments
      .mockReturnValueOnce(makeInsertFail(simulatedDbError)); // medications → ABORT

    txExecute = vi.fn().mockResolvedValue({ rows: [] });

    const tx = {
      insert:  txInsert,
      select:  vi.fn().mockReturnValue(makeSelectChain([])),
      update:  vi.fn().mockReturnValue(makeUpdateChain()),
      execute: txExecute,
    };

    // db.transaction() runs the callback with the mock tx.
    // If the callback throws, the error propagates naturally — mirroring
    // drizzle's behaviour after it issues ROLLBACK on the real connection.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbTransaction = vi.fn().mockImplementation(async (cb: (t: any) => Promise<void>) => cb(tx));

    // Pre-transaction selects:
    //   1st → fetch this doc:  appliedAt: null means it hasn't been applied yet
    //   2nd → duplicate check: empty array means no duplicate found
    const dbSelect = vi.fn()
      .mockReturnValueOnce(
        makeSelectChain([{ appliedAt: null, rawText: "original document text" }]),
      )
      .mockReturnValueOnce(makeSelectChain([]));

    // Patch the exported `db` reference for this test run.
    (dbModule as Record<string, unknown>).db = {
      select:      dbSelect,
      transaction: dbTransaction,
      update:      vi.fn().mockReturnValue(makeUpdateChain()),
    };
  });

  // -------------------------------------------------------------------------
  it("returns HTTP 500 with the correct error body when a DB write fails mid-transaction", async () => {
    const res = await request(buildApp())
      .post("/documents/apply")
      .send(payload);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Apply failed — nothing was saved");
  });

  // -------------------------------------------------------------------------
  it("never reaches the app_settings writes (dietary/activity) when medications insert fails", async () => {
    // tx.execute() handles the app_settings upserts; confirming it was never
    // called proves the transaction aborted before touching those tables.
    await request(buildApp()).post("/documents/apply").send(payload);

    expect(txExecute).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it("attempts exactly three inserts before aborting (schedule_tasks, medical_appointments, medications)", async () => {
    // Pins the precise failure point: two inserts fire and succeed, the third
    // (medications) throws, and nothing after it runs.  A future refactor that
    // accidentally reorders or skips inserts will break this count.
    await request(buildApp()).post("/documents/apply").send(payload);

    // Three insert attempts total — the third threw.
    expect(txInsert).toHaveBeenCalledTimes(3);
    // The transaction was entered exactly once.
    expect(dbTransaction).toHaveBeenCalledTimes(1);
  });
});
