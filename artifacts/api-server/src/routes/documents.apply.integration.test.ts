/**
 * documents apply endpoint — integration tests against the real database
 *
 * MUST be invoked explicitly with the guard flag set:
 *
 *   RUN_INTEGRATION_TESTS=1 pnpm --filter @workspace/api-server test:integration
 *
 * The suite is excluded from the default `pnpm test` run (vitest.config.ts
 * exclude: **\/*.integration.test.ts) and requires an explicit opt-in so it
 * cannot run silently against whichever DATABASE_URL happens to be active
 * (including a production database).  In addition, the suite refuses to run
 * when NODE_ENV=production as a hard production-safety guard.
 *
 * What these tests prove that the mock unit tests cannot:
 *   - drizzle's transaction ROLLBACK fires at the real Postgres level.
 *   - Rows inserted before the failure are not retrievable from the live
 *     database after the transaction aborts.
 *
 * Cleanup guarantee: every marker-created row is deleted in a `finally`
 * block, including the path where rollback itself is broken and the rows
 * actually persist — so a failing assertion never leaves bogus care-plan
 * data behind.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { eq, sql } from "drizzle-orm";

// Real DB — intentionally no mock.
import {
  db,
  scheduleTasksTable,
  medicalAppointmentsTable,
  medicationsTable,
  medicalDocumentsTable,
} from "@workspace/db";

// Mock only network side-effects irrelevant to rollback behaviour.
vi.mock("@workspace/integrations-gemini-ai", () => ({
  ai: { models: { generateContent: vi.fn() } },
}));
vi.mock("../lib/hermes.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Safety guards
//
// Both conditions must hold before any real-database writes happen:
//   1. RUN_INTEGRATION_TESTS=1  — explicit opt-in per invocation.
//   2. NODE_ENV !== "production" — hard block against production runs.
//
// `describe.skipIf` skips the entire suite when either guard fails, so the
// test file can be imported by vitest without touching the database at all.
// ---------------------------------------------------------------------------
const isExplicitlyEnabled = process.env.RUN_INTEGRATION_TESTS === "1";
const isNotProduction     = process.env.NODE_ENV !== "production";
const shouldRun           = isExplicitlyEnabled && isNotProduction;

/** Unique per-test marker — never collides with real care-plan rows. */
function marker() {
  return `INTEG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Minimal Express app that mounts only the documents router. */
async function buildApp() {
  const { default: documentsRouter } = await import("./documents.js");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
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
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!shouldRun)(
  "drizzle transaction rollback — real database",
  () => {
    afterEach(() => vi.restoreAllMocks());

    // -----------------------------------------------------------------------
    it("rolls back schedule_tasks and medical_appointments when an error is thrown mid-transaction", async () => {
      const m = marker();
      const taskTitle = `Appt: Dr. ${m}`;

      // Sanity-check: marker is fresh.
      const before = await db
        .select({ id: scheduleTasksTable.id })
        .from(scheduleTasksTable)
        .where(eq(scheduleTasksTable.title, taskTitle));
      expect(before).toHaveLength(0);

      try {
        // Run a real transaction that inserts two rows, then throws.
        // drizzle issues ROLLBACK when the callback rejects.
        await expect(
          db.transaction(async (tx) => {
            await tx.insert(scheduleTasksTable).values({
              tenantId:    "local",
              quarter:     "Q1",
              timeLabel:   "1000",
              title:       taskTitle,
              description: "2099-01-01. Source: integration-test",
              isActive:    true,
              isCompleted: false,
              order:       99,
            });

            await tx.insert(medicalAppointmentsTable).values({
              appointmentDate: "2099-01-01",
              appointmentTime: "10:00",
              provider:        m,
              type:            "other",
              notes:           "integration-test",
            });

            // Simulates the medications insert failing before COMMIT.
            throw new Error("simulated medications failure");
          })
        ).rejects.toThrow("simulated medications failure");

        // Assert both earlier inserts were rolled back by Postgres.
        const stRows = await db
          .select({ id: scheduleTasksTable.id })
          .from(scheduleTasksTable)
          .where(eq(scheduleTasksTable.title, taskTitle));
        expect(stRows).toHaveLength(0);

        const maRows = await db
          .select({ id: medicalAppointmentsTable.id })
          .from(medicalAppointmentsTable)
          .where(eq(medicalAppointmentsTable.provider, m));
        expect(maRows).toHaveLength(0);
      } finally {
        // Delete any rows with this marker that survived a rollback failure.
        // Runs regardless of assertion outcome so no bogus rows are left behind.
        await db
          .delete(scheduleTasksTable)
          .where(eq(scheduleTasksTable.title, taskTitle));
        await db
          .delete(medicalAppointmentsTable)
          .where(eq(medicalAppointmentsTable.provider, m));
      }
    });

    // -----------------------------------------------------------------------
    it("HTTP 500 + no persisted rows when medications insert fails inside the apply handler", async () => {
      const m = marker();
      const taskTitle = `Appt: Dr. ${m} @ VA Clinic`;

      // Insert a test document via drizzle (no DDL — the table must already
      // exist; ensureMedicalDocsTable() runs on any real /documents request).
      const [testDoc] = await db
        .insert(medicalDocumentsTable)
        .values({
          tenantId:       "local",
          sourceLabel:    "Integration Test Doc",
          rawText:        `raw-text-${m}`,
          structuredJson: "{}",
        })
        .returning({ id: medicalDocumentsTable.id });

      try {
        // Spy on db.transaction: execute a REAL Postgres transaction but
        // intercept the 3rd tx.insert() call (medications) and throw so the
        // transaction aborts and issues ROLLBACK for the two earlier inserts.
        const originalTxn = db.transaction.bind(db);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.spyOn(db, "transaction").mockImplementationOnce(async (cb: any) => {
          return originalTxn(async (realTx: any) => {
            let insertCount = 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const proxiedTx: any = new Proxy(realTx as object, {
              get(target, prop) {
                if (prop === "insert") {
                  return (table: any) => {
                    const chain: any = (target as any).insert(table);
                    const origValues = chain.values.bind(chain);
                    chain.values = (...args: any[]) => {
                      insertCount++;
                      if (insertCount === 3) {
                        // 3rd insert = medications → abort the transaction.
                        throw new Error("simulated medications failure (integration)");
                      }
                      return origValues(...args);
                    };
                    return chain;
                  };
                }
                return Reflect.get(target as object, prop);
              },
            });
            return cb(proxiedTx);
          });
        });

        const app = await buildApp();
        const res = await request(app)
          .post("/documents/apply")
          .send({
            docId:        testDoc.id,
            source_label: "Integration Test Doc",
            appointments: [
              {
                date:     "2099-01-01",
                time:     "10:00 AM",
                provider: `Dr. ${m}`,
                location: "VA Clinic",
                type:     "follow-up",
              },
            ],
            medications:           [{ name: `Med-${m}`, dose: "5mg" }],
            dietary_restrictions:  [],
            activity_restrictions: [],
          });

        // ── HTTP assertion ──────────────────────────────────────────────────
        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Apply failed — nothing was saved");

        // ── DB assertions: nothing committed in any of the four tables ──────
        const stRows = await db
          .select({ id: scheduleTasksTable.id })
          .from(scheduleTasksTable)
          .where(eq(scheduleTasksTable.title, taskTitle));
        expect(stRows).toHaveLength(0);

        const maRows = await db
          .select({ id: medicalAppointmentsTable.id })
          .from(medicalAppointmentsTable)
          .where(sql`${medicalAppointmentsTable.provider} = ${"Dr. " + m}`);
        expect(maRows).toHaveLength(0);

        const medRows = await db
          .select({ id: medicationsTable.id })
          .from(medicationsTable)
          .where(sql`${medicationsTable.name} = ${"Med-" + m}`);
        expect(medRows).toHaveLength(0);

        // The commit sentinel must still be NULL — doc remains re-applicable.
        const docRows = await db
          .select({ appliedAt: medicalDocumentsTable.appliedAt })
          .from(medicalDocumentsTable)
          .where(eq(medicalDocumentsTable.id, testDoc.id));
        expect(docRows[0]?.appliedAt).toBeNull();
      } finally {
        // Remove the test document and any marker rows that survived a
        // rollback failure — runs regardless of assertion outcome.
        await db
          .delete(medicalDocumentsTable)
          .where(eq(medicalDocumentsTable.id, testDoc.id));
        await db
          .delete(scheduleTasksTable)
          .where(eq(scheduleTasksTable.title, taskTitle));
        await db
          .delete(medicalAppointmentsTable)
          .where(sql`${medicalAppointmentsTable.provider} = ${"Dr. " + m}`);
        await db
          .delete(medicationsTable)
          .where(sql`${medicationsTable.name} = ${"Med-" + m}`);
      }
    });
  }
);
