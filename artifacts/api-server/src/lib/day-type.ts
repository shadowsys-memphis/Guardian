/**
 * Day-type resolution — one label per tenant per Pacific calendar day.
 *
 * Resolves each morning (via the `day_type_resolve` cron job in
 * call-scheduler.ts) into exactly one of: sick, appointment, rest, sunday,
 * normal — checked in that fixed order, first match wins, no stacking.
 *
 * The one rule that shapes everything here: **Jessica never declares a Rest
 * day.** Automatic triggers she can act on herself are limited to what's
 * already on the calendar (appointment) and the calendar itself (sunday).
 * Signals that suggest Pops needs a lighter day — two rough nights, a rough
 * previous day — only ever produce a `pendingRecommendation` that sits on the
 * row until Ray confirms or dismisses it. Ray's own flags (rest/sick, set via
 * the API) are honored directly because they ARE Ray's decision.
 */
import { db } from "@workspace/db";
import {
  appSettingsTable,
  dayTypesTable,
  healthDataPointsTable,
  medicalAppointmentsTable,
  type DayTypeRow,
} from "@workspace/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { logger } from "./logger";

export const DAY_TYPES = ["normal", "sunday", "rest", "appointment", "sick"] as const;
export type DayType = (typeof DAY_TYPES)[number];

export function isDayType(value: unknown): value is DayType {
  return typeof value === "string" && (DAY_TYPES as readonly string[]).includes(value);
}

// app_settings keys Ray (or the admin UI) uses to flag a day by hand.
// Value is the Pacific date the flag applies to — stale dates are ignored,
// so a forgotten flag can never silently convert a random later day.
export const DAY_FLAG_KEYS = {
  sick: "day_flag_sick_date",
  rest: "day_flag_rest_date",
  recovery: "day_flag_recovery_date",
} as const;

async function getFlagDate(key: string): Promise<string | null> {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

/** True when the last two calendar days both logged a flagged/poor sleep data point. */
async function hadTwoRoughNights(dayDate: string): Promise<boolean> {
  // Look back 3 days of sleep data points; a "rough night" is a flagged sleep
  // entry or one parsed as poor/bad/none.
  const since = new Date(new Date(`${dayDate}T00:00:00-08:00`).getTime() - 3 * 24 * 60 * 60_000);
  const rows = await db
    .select({
      createdAt: healthDataPointsTable.createdAt,
      flagged: healthDataPointsTable.flagged,
      parsedValue: healthDataPointsTable.parsedValue,
    })
    .from(healthDataPointsTable)
    .where(and(eq(healthDataPointsTable.category, "sleep"), gte(healthDataPointsTable.createdAt, since)))
    .orderBy(desc(healthDataPointsTable.createdAt));

  const roughDays = new Set<string>();
  for (const r of rows) {
    const bad = r.flagged || /\b(poor|bad|none|terrible|rough|no sleep)\b/i.test(r.parsedValue ?? "");
    if (bad) roughDays.add(r.createdAt.toISOString().slice(0, 10));
  }
  return roughDays.size >= 2;
}

export interface ResolvedDayType {
  dayType: DayType;
  resolvedBy: string;
  reason: string | null;
  /** Rest-day suggestion awaiting Ray — only ever set alongside a non-rest dayType. */
  pendingRecommendation: "rest" | null;
  recommendationReason: string | null;
}

/**
 * Pure-ish resolver: reads signals, applies the fixed precedence, returns the
 * verdict without writing anything. Precedence (first match wins):
 *
 *   1. sick        — Ray's sick flag for today
 *   2. appointment — a medical appointment on today's calendar
 *   3. rest        — Ray's rest/recovery flag for today, or a rest day Ray
 *                    already confirmed on today's existing row
 *   4. sunday      — the calendar
 *   5. normal      — everything else
 *
 * Auto-detected fatigue signals (two rough nights) never place `rest` directly;
 * they attach a pending recommendation to whatever type did win.
 */
export async function resolveDayType(dayDate: string, existing?: DayTypeRow | null): Promise<ResolvedDayType> {
  // 1. Sick — Ray's call, today only.
  if ((await getFlagDate(DAY_FLAG_KEYS.sick)) === dayDate) {
    return { dayType: "sick", resolvedBy: "ray_flag", reason: "Sick flag set for today", pendingRecommendation: null, recommendationReason: null };
  }

  // 2. Appointment — calendar wins over rest so meds/meals restructure around it.
  const appts = await db
    .select({ id: medicalAppointmentsTable.id, provider: medicalAppointmentsTable.provider, time: medicalAppointmentsTable.appointmentTime })
    .from(medicalAppointmentsTable)
    .where(eq(medicalAppointmentsTable.appointmentDate, dayDate))
    .limit(1);
  if (appts.length > 0) {
    return {
      dayType: "appointment",
      resolvedBy: "calendar",
      reason: `Appointment with ${appts[0].provider} at ${appts[0].time}`,
      pendingRecommendation: null,
      recommendationReason: null,
    };
  }

  // 3. Rest — only from Ray: an explicit flag, or a confirmation already on the row.
  const restFlagged = (await getFlagDate(DAY_FLAG_KEYS.rest)) === dayDate
    || (await getFlagDate(DAY_FLAG_KEYS.recovery)) === dayDate;
  const alreadyConfirmedRest = existing?.dayType === "rest" && existing.confirmedBy != null;
  if (restFlagged || alreadyConfirmedRest) {
    return {
      dayType: "rest",
      resolvedBy: restFlagged ? "ray_flag" : "ray_confirmed",
      reason: restFlagged ? "Rest/recovery flag set for today" : (existing?.reason ?? null),
      pendingRecommendation: null,
      recommendationReason: null,
    };
  }

  // 4/5. Sunday or normal — then check whether Jessica should *suggest* rest.
  const isSunday = new Date(`${dayDate}T12:00:00Z`).getUTCDay() === 0;
  const base: ResolvedDayType = isSunday
    ? { dayType: "sunday", resolvedBy: "calendar", reason: null, pendingRecommendation: null, recommendationReason: null }
    : { dayType: "normal", resolvedBy: "auto", reason: null, pendingRecommendation: null, recommendationReason: null };

  // Preserve an unanswered recommendation from an earlier resolve today rather
  // than re-deriving (and possibly flip-flopping) it.
  if (existing?.pendingRecommendation === "rest" && existing.confirmedAt == null) {
    return { ...base, pendingRecommendation: "rest", recommendationReason: existing.recommendationReason };
  }

  try {
    if (await hadTwoRoughNights(dayDate)) {
      return {
        ...base,
        pendingRecommendation: "rest",
        recommendationReason: "Two rough nights in a row — Jessica suggests a Rest day.",
      };
    }
  } catch (err) {
    // A failed fatigue check must never block the day from resolving.
    logger.warn({ err }, "[day-type] rough-night check failed; resolving without recommendation");
  }

  return base;
}

/** Read today's resolved row, or null if the morning job hasn't run yet. */
export async function getDayTypeRow(tenantId: string, dayDate: string): Promise<DayTypeRow | null> {
  const rows = await db
    .select()
    .from(dayTypesTable)
    .where(and(eq(dayTypesTable.tenantId, tenantId), eq(dayTypesTable.dayDate, dayDate)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Resolve and persist today's day type (insert or update the single row).
 * Called by the morning cron job; safe to call repeatedly — a re-run updates
 * the existing row in place, honoring Ray's confirmations via `existing`.
 */
export async function resolveAndStoreDayType(tenantId: string, dayDate: string): Promise<DayTypeRow> {
  const existing = await getDayTypeRow(tenantId, dayDate);
  const resolved = await resolveDayType(dayDate, existing);

  if (existing) {
    const [updated] = await db
      .update(dayTypesTable)
      .set({
        dayType: resolved.dayType,
        resolvedBy: resolved.resolvedBy,
        reason: resolved.reason,
        pendingRecommendation: resolved.pendingRecommendation,
        recommendationReason: resolved.recommendationReason,
        updatedAt: new Date(),
      })
      .where(eq(dayTypesTable.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(dayTypesTable)
    .values({
      tenantId,
      dayDate,
      dayType: resolved.dayType,
      resolvedBy: resolved.resolvedBy,
      reason: resolved.reason,
      pendingRecommendation: resolved.pendingRecommendation,
      recommendationReason: resolved.recommendationReason,
    })
    .returning();
  return created;
}

/**
 * Ray answers a pending Rest-day recommendation. Accepting flips the day to
 * rest with his name on it; dismissing just clears the recommendation. Either
 * way `confirmedAt` records that the question was answered, which stops the
 * resolver from re-raising the same suggestion later the same day.
 */
export async function answerRestRecommendation(
  tenantId: string,
  dayDate: string,
  accept: boolean,
  confirmedBy = "ray"
): Promise<DayTypeRow | null> {
  const existing = await getDayTypeRow(tenantId, dayDate);
  if (!existing || existing.pendingRecommendation !== "rest") return null;

  const [updated] = await db
    .update(dayTypesTable)
    .set({
      ...(accept
        ? { dayType: "rest" as const, resolvedBy: "ray_confirmed", reason: existing.recommendationReason }
        : {}),
      pendingRecommendation: null,
      confirmedBy,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dayTypesTable.id, existing.id))
    .returning();
  return updated ?? null;
}
