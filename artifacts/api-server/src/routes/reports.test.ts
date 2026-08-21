/**
 * GET /reports/doctor — route-level coverage:
 *   1. An empty database returns the full report contract with explicit
 *      no-data states (never a substituted narrative).
 *   2. Tenant-carrying tables (symptom_logs, care_events) are filtered by the
 *      tenant id derived from the session — and a client-supplied tenant id
 *      never reaches any query.
 *   3. The period query param selects the window; unknown values fall back
 *      to weekly.
 *
 * vi.mock() factories are hoisted — values used inside them are defined
 * inside the factory (see documents.apply.test.ts for the same pattern).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("@workspace/db", () => ({
  db: null, // replaced per-test via dbModule
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

// Keep hermes' heavy import graph (gemini, cart, scheduler) out of the test;
// the route only needs the table-ensure hook.
vi.mock("../lib/hermes", () => ({
  ensureCareEventsTable: vi.fn().mockResolvedValue(undefined),
}));

import * as dbModule from "@workspace/db";
// Real drizzle table objects — the route's where-conditions are built against
// these, so captured conditions can be traced back to their table.
import { symptomLogsTable, careEventsTable } from "@workspace/db/schema";
import reportsRouter from "./reports";

type CapturedQuery = { table: unknown; where: unknown };

/**
 * Thenable query-builder stub: select().from(t).where(c).orderBy(...).limit(n)
 * resolves to [] at any chain depth and records each query's table + where.
 */
function makeDb(captured: CapturedQuery[]) {
  return {
    select: vi.fn(() => {
      const entry: CapturedQuery = { table: null, where: null };
      const chain: Record<string, unknown> = {};
      chain["from"] = vi.fn((table: unknown) => {
        entry.table = table;
        captured.push(entry);
        return chain;
      });
      chain["where"] = vi.fn((cond: unknown) => {
        entry.where = cond;
        return chain;
      });
      chain["orderBy"] = vi.fn(() => chain);
      chain["limit"] = vi.fn(() => chain);
      chain["then"] = (resolve: (rows: unknown[]) => unknown, reject: (err: unknown) => unknown) =>
        Promise.resolve([]).then(resolve, reject);
      return chain;
    }),
  };
}

/** Recursively collect every primitive string in an object graph (drizzle
 *  SQL conditions hold bound values in nested Param chunks). */
function collectStrings(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  const out: string[] = [];
  for (const v of Object.values(value as Record<string, unknown>)) {
    out.push(...collectStrings(v, seen));
  }
  return out;
}

function buildApp(session: { type: "local" | "tenant"; sub: string }) {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>)["tenantSession"] = session;
    (req as unknown as Record<string, unknown>)["log"] = {
      error: () => {},
      warn: () => {},
      info: () => {},
    };
    next();
  });
  app.use(reportsRouter);
  return app;
}

describe("GET /reports/doctor", () => {
  let captured: CapturedQuery[];

  beforeEach(() => {
    captured = [];
    (dbModule as unknown as Record<string, unknown>)["db"] = makeDb(captured);
  });

  it("returns the full contract with explicit no-data states on an empty database", async () => {
    const res = await request(buildApp({ type: "local", sub: "local" })).get("/reports/doctor");

    expect(res.status).toBe(200);
    expect(res.body.period).toBe("weekly");
    expect(res.body.periodStart <= res.body.periodEnd).toBe(true);
    expect(typeof res.body.scopeStatement).toBe("string");
    expect(res.body.scopeStatement).toMatch(/not a diagnosis/i);
    expect(res.body.checkIns).toEqual([]);
    expect(res.body.observations).toEqual([]);
    expect(res.body.symptomEntries).toEqual([]);
    expect(res.body.taskOutcomes).toEqual({ counts: { completed: 0, refused: 0 }, entries: [] });
    expect(res.body.medications).toEqual({
      activeMedications: [],
      injectionCycle: null,
      adjustments: [],
      medEvents: [],
    });
    expect(res.body.careEvents).toEqual([]);
    expect(res.body.appointments).toEqual({ inPeriod: [], upcoming: [] });
    expect(res.body.dataAvailability.injectionRecordOnFile).toBe(false);
    for (const banned of ["Pops", "Vietnam", "Veteran", "Schizophrenia", "stable", "adherence"]) {
      expect(JSON.stringify(res.body)).not.toContain(banned);
    }
  });

  it("rejects tenant sessions outright — most source tables have no tenant isolation", async () => {
    const app = buildApp({ type: "tenant", sub: "tenant-abc-123" });
    const res = await request(app).get("/reports/doctor");
    expect(res.status).toBe(403);
    // The guard must fire before any data is read.
    expect(captured).toHaveLength(0);
  });

  it("scopes tenant-carrying tables to the session tenant, ignoring client-supplied ids", async () => {
    const app = buildApp({ type: "local", sub: "local" });
    const res = await request(app).get("/reports/doctor?period=weekly&tenantId=evil-tenant");
    expect(res.status).toBe(200);

    const byTable = (table: unknown) => captured.filter((q) => q.table === table);
    for (const table of [symptomLogsTable, careEventsTable]) {
      const queries = byTable(table);
      expect(queries.length).toBeGreaterThan(0);
      for (const q of queries) {
        const bound = collectStrings(q.where);
        expect(bound).toContain("local");
      }
    }
    // The client-supplied tenant id must not reach any query on any table.
    for (const q of captured) {
      expect(collectStrings(q.where)).not.toContain("evil-tenant");
    }
  });

  it("honors period=monthly and falls back to weekly for unknown values", async () => {
    const app = buildApp({ type: "local", sub: "local" });

    const monthly = await request(app).get("/reports/doctor?period=monthly");
    expect(monthly.body.period).toBe("monthly");
    const monthlySpan =
      (Date.parse(monthly.body.periodEnd) - Date.parse(monthly.body.periodStart)) / 86_400_000;
    expect(monthlySpan).toBe(29);

    const bogus = await request(app).get("/reports/doctor?period=all-time");
    expect(bogus.body.period).toBe("weekly");
    const weeklySpan =
      (Date.parse(bogus.body.periodEnd) - Date.parse(bogus.body.periodStart)) / 86_400_000;
    expect(weeklySpan).toBe(6);
  });
});
