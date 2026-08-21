import { describe, expect, it } from "vitest";
import { computeHaldolCycle } from "./haldol-cycle.js";

describe("computeHaldolCycle", () => {
  it("keeps the due date anchored to the last confirmed injection", () => {
    const beforeDue = computeHaldolCycle("2026-08-05", {
      intervalDays: 28,
      zombiePhaseDays: 5,
      now: new Date("2026-08-21T19:00:00Z"),
    });

    expect(beforeDue.nextInjectionDate).toBe("2026-09-02");
    expect(beforeDue.cycleDay).toBe(17);
    expect(beforeDue.isOverdue).toBe(false);
  });

  it("does not silently start a new cycle when the dose is overdue", () => {
    const overdue = computeHaldolCycle("2026-08-05", {
      intervalDays: 28,
      zombiePhaseDays: 5,
      now: new Date("2026-09-04T19:00:00Z"),
    });

    expect(overdue.nextInjectionDate).toBe("2026-09-02");
    expect(overdue.cycleDay).toBe(28);
    expect(overdue.isOverdue).toBe(true);
    expect(overdue.daysOverdue).toBe(2);
    expect(overdue.isZombiePhase).toBe(false);
  });
});