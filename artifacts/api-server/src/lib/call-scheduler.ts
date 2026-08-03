import { db, pool } from "@workspace/db";
import {
  appSettingsTable,
  appStateTable,
  callSessionsTable,
  haldolCycleTable,
  healthDataPointsTable,
  medicalAppointmentsTable,
  rotationTasksTable,
} from "@workspace/db";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { computeHaldolCycle } from "./haldol-cycle";
import { getSettings, isInQuietWindow } from "../routes/health-assessment";
import { triggerOutboundCall } from "../routes/jessica";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 60_000;
const PACIFIC_TZ = "America/Los_Angeles";

// ─── app_settings keys owned by the scheduler ────────────────────────────────
const KEY = {
  dailyCallClaim: "daily_call_last_triggered_date",
  apptReminderIds: "last_appointment_reminder_ids",
  haldolAlert: "haldol_alert",
  haldolClaim: "haldol_alert_last_run_date",
  medRefusalAlert: "med_refusal_alert",
  medRefusalAcked: "med_refusal_acked_ids",
  wellbeingAlert: "wellbeing_alert",
  wellbeingAcked: "wellbeing_acked_ids",
  rotationResetClaim: "rotation_reset_last_date",
  missedCallToday: "missed_call_today",
  missedCallStreak: "missed_call_streak",
  missedCallClaim: "missed_call_last_checked_date",
} as const;

export type JobOutcome = "ok" | "skipped" | "warn" | "error";
export interface JobResult {
  outcome: JobOutcome;
  detail?: string;
}

export interface CronJob {
  name: string;
  title: string;
  schedule: string;
  /** Poll interval for recurring jobs; null means the job is time-of-day driven. */
  intervalMs: number | null;
  /** True if this job can place a phone call (must respect the quiet window). */
  placesCall: boolean;
  /**
   * `force` = a manual "Run Now" from the Admin UI. It bypasses the
   * time-of-day gate and the once-per-day claim, but NEVER the quiet window —
   * an operator button shouldn't be able to ring Pops at 3am.
   */
  run(now: PacificNow, opts?: { force?: boolean }): Promise<JobResult>;
}

export interface PacificNow {
  hhmm: string;
  date: string;
  tomorrow: string;
  hour: number;
  epochMs: number;
}

// ─── Time helpers (all scheduling decisions are Pacific-local) ───────────────

function pacificNow(): PacificNow {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  // Intl renders midnight as "24" in some ICU versions — normalize to "00".
  const hour = parseInt(p["hour"], 10) % 24;
  const hh = String(hour).padStart(2, "0");
  const date = `${p["year"]}-${p["month"]}-${p["day"]}`;
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return {
    hhmm: `${hh}:${p["minute"]}`,
    date,
    tomorrow: t.toISOString().split("T")[0],
    hour,
    epochMs: now.getTime(),
  };
}

/** "10:00" + 120 → "12:00". Wraps within a 24h clock. */
function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ─── app_settings helpers ────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `);
}

async function clearSetting(key: string): Promise<void> {
  await db.delete(appSettingsTable).where(eq(appSettingsTable.key, key));
}

async function getJsonSetting<T>(key: string, fallback: T): Promise<T> {
  const raw = await getSetting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Claims a once-per-day slot for `key`. Returns false if today is already
 * claimed. The claim is written BEFORE the (slow, external) work runs so a
 * second tick inside the same minute can't double-fire.
 */
async function claimForToday(key: string, date: string, force = false): Promise<boolean> {
  const alreadyClaimed = (await getSetting(key)) === date;
  await setSetting(key, date);
  return force || !alreadyClaimed;
}

async function recordJobRun(jobName: string, result: JobResult): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO cron_job_log (job_name, outcome, detail) VALUES ($1, $2, $3)`,
      [jobName, result.outcome, result.detail ?? null]
    );
  } catch (err) {
    logger.error({ err, jobName }, "Failed to write cron_job_log row");
  }
}

/** Shared quiet-window guard for every job that can place a call. */
async function quietWindowBlocks(now: PacificNow): Promise<boolean> {
  const settings = await getSettings();
  return isInQuietWindow(now.hhmm, settings.quietWindowStart, settings.quietWindowEnd);
}

/**
 * Haldol context injected into scheduled calls once the injection is well past
 * due (cycle day 16+, i.e. 15+ days since the last logged injection).
 */
async function overdueHaldolContext(): Promise<string | undefined> {
  const alert = await getJsonSetting<{ status?: string; daysOverdue?: number } | null>(KEY.haldolAlert, null);
  if (!alert || alert.status !== "overdue") return undefined;
  // Only speak up once it's meaningfully late, not on the first day past due.
  if ((alert.daysOverdue ?? 0) < 2) return undefined;
  return `CALL PURPOSE — HALDOL REMINDER: Pops' Haldol injection is overdue. Somewhere natural in the conversation, gently say that Ray wanted you to remind him his Haldol appointment is coming up and ask if he's been able to get it scheduled. Keep it warm and low-pressure — do not alarm him or repeat it more than once.`;
}

// ─── Job 1: Daily morning call ───────────────────────────────────────────────

const dailyCallJob: CronJob = {
  name: "daily_call",
  title: "Daily Morning Call",
  schedule: "Once daily at the configured call time",
  intervalMs: null,
  placesCall: true,
  async run(now, opts) {
    const settings = await getSettings();
    if (!settings.dailyCallEnabled && !opts?.force) return { outcome: "skipped" };
    if (now.hhmm !== settings.dailyCallTime && !opts?.force) return { outcome: "skipped" };

    // Quiet window is enforced even on a forced run.
    if (isInQuietWindow(now.hhmm, settings.quietWindowStart, settings.quietWindowEnd)) {
      return { outcome: "warn", detail: `Quiet window is active (${settings.quietWindowStart}–${settings.quietWindowEnd}) — call suppressed.` };
    }
    if (!(await claimForToday(KEY.dailyCallClaim, now.date, opts?.force))) return { outcome: "skipped" };

    const result = await triggerOutboundCall({ extraContext: await overdueHaldolContext() });
    if (!result.ok) {
      const streak = parseInt((await getSetting(KEY.missedCallStreak)) ?? "0", 10) + 1;
      await setSetting(KEY.missedCallStreak, String(streak));
      await setSetting(KEY.missedCallToday, JSON.stringify({ missed: true, reason: result.error, at: new Date().toISOString() }));
      return { outcome: "error", detail: `Call failed to start: ${result.error}${result.message ? ` — ${result.message}` : ""} (missed streak: ${streak})` };
    }
    return { outcome: "ok", detail: `Outbound call started (session ${result.sessionId})` };
  },
};

// ─── Job 2: Night-before appointment reminder ────────────────────────────────

const appointmentReminderJob: CronJob = {
  name: "appointment_reminder",
  title: "Night-Before Appointment Reminder",
  schedule: "Daily, 8:00–10:00 PM PT (retries within window on failure)",
  intervalMs: null,
  placesCall: true,
  async run(now, opts) {
    // A 2-hour window, not a single exact minute — so a transient failure
    // (ElevenLabs down, network blip) gets retried by a later tick instead of
    // silently going unfixed for the night. Nothing below persists a
    // "claimed" flag until AFTER a call actually succeeds, so retries work.
    const inWindow = now.hhmm >= "20:00" && now.hhmm < "22:00";
    if (!inWindow && !opts?.force) return { outcome: "skipped" };

    const appts = await db
      .select()
      .from(medicalAppointmentsTable)
      .where(eq(medicalAppointmentsTable.appointmentDate, now.tomorrow));

    if (appts.length === 0) return { outcome: "skipped" };

    // One reminder per appointment per day — this alone gives idempotency,
    // so there's no separate "claimed today" flag to set before we know the
    // call actually went through.
    const alreadyReminded = await getJsonSetting<string[]>(KEY.apptReminderIds, []);
    const pending = appts.filter((a) => !alreadyReminded.includes(`${a.id}:${now.tomorrow}`));
    if (pending.length === 0) return { outcome: "skipped" };

    if (await quietWindowBlocks(now)) {
      return { outcome: "warn", detail: "Quiet window is active — reminder call suppressed." };
    }

    const lines = pending.map((a) => {
      const type = (a.type ?? "").toLowerCase();
      const isFasting = type.includes("bloodwork") || type.includes("lab");
      const base = `Tomorrow at ${a.appointmentTime} you have a ${a.type ?? "medical"} appointment with ${a.provider}${a.location ? ` at ${a.location}` : ""}.`;
      const fasting = isFasting
        ? " IMPORTANT — this is bloodwork: tell him he'll need to fast from midnight tonight, nothing to eat or drink except water, and that he should NOT take his morning medication until after the blood draw."
        : "";
      return base + fasting;
    });

    const extraContext = `CALL PURPOSE — APPOINTMENT REMINDER: This is a night-before reminder call. Work the following into the conversation naturally and reassuringly, then let him ask questions about it:\n${lines.join("\n")}`;

    const result = await triggerOutboundCall({ extraContext });
    if (!result.ok) {
      // Do NOT record these appointment ids as reminded — the next tick,
      // still within the 20:00–22:00 window, retries automatically.
      return { outcome: "error", detail: `Reminder call failed: ${result.error}${result.message ? ` — ${result.message}` : ""}` };
    }

    await setSetting(
      KEY.apptReminderIds,
      JSON.stringify([...alreadyReminded, ...pending.map((a) => `${a.id}:${now.tomorrow}`)].slice(-50))
    );
    return { outcome: "ok", detail: `Reminded about ${pending.length} appointment(s) tomorrow` };
  },
};

// ─── Job 3: Haldol cycle overdue alert ───────────────────────────────────────

const haldolAlertJob: CronJob = {
  name: "haldol_alert",
  title: "Haldol Cycle Overdue Alert",
  schedule: "Daily at 9:00 AM PT",
  intervalMs: null,
  placesCall: false,
  async run(now, opts) {
    if (now.hhmm !== "09:00" && !opts?.force) return { outcome: "skipped" };
    if (!(await claimForToday(KEY.haldolClaim, now.date, opts?.force))) return { outcome: "skipped" };

    const rows = await db.select().from(haldolCycleTable).orderBy(desc(haldolCycleTable.id)).limit(1);
    if (!rows[0]) return { outcome: "warn", detail: "No haldol_cycle row — cannot compute cycle day." };

    const info = computeHaldolCycle(rows[0].lastInjectionDate, {
      intervalDays: rows[0].intervalDays,
      zombiePhaseDays: rows[0].zombiePhaseDays,
    });
    const { cycleDay, intervalDays, daysSinceInjection, isOverdue, daysOverdue } = info;

    let status: "ok" | "due_tomorrow" | "due_today" | "overdue" = "ok";
    if (isOverdue) status = "overdue";
    else if (info.isDueToday) status = "due_today";
    else if (daysSinceInjection === intervalDays - 1) status = "due_tomorrow";

    if (status === "ok") {
      await clearSetting(KEY.haldolAlert);
      return { outcome: "ok", detail: `Cycle day ${cycleDay} of ${intervalDays} — on track (next ${info.nextInjectionDate}).` };
    }

    await setSetting(
      KEY.haldolAlert,
      JSON.stringify({
        status,
        cycleDay,
        intervalDays,
        daysSinceInjection,
        daysOverdue,
        lastInjectionDate: rows[0].lastInjectionDate,
        nextInjectionDate: info.nextInjectionDate,
        at: new Date().toISOString(),
      })
    );
    return {
      outcome: "warn",
      detail: isOverdue
        ? `Injection OVERDUE — ${daysOverdue} day(s) past the ${intervalDays}-day window (cycle day ${cycleDay}).${daysOverdue >= 2 ? " Jessica will raise it on the next call." : ""}`
        : status === "due_today"
          ? `Injection due today (cycle day ${cycleDay} of ${intervalDays}).`
          : `Injection due tomorrow (cycle day ${cycleDay} of ${intervalDays}).`,
    };
  },
};

// ─── Job 4: Medication refusal escalation ────────────────────────────────────

const medRefusalJob: CronJob = {
  name: "med_refusal_escalation",
  title: "Medication Refusal Escalation",
  schedule: "Every 15 minutes",
  intervalMs: 15 * 60_000,
  placesCall: false,
  async run() {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
    // MED_REFUSED is written by hermes.ts as a flagged medication data point
    // with parsedValue "no" — see handleMedRefused().
    const refusals = await db
      .select()
      .from(healthDataPointsTable)
      .where(
        and(
          eq(healthDataPointsTable.category, "medication"),
          eq(healthDataPointsTable.parsedValue, "no"),
          eq(healthDataPointsTable.flagged, true),
          gte(healthDataPointsTable.createdAt, since)
        )
      )
      .orderBy(desc(healthDataPointsTable.createdAt));

    const acked = await getJsonSetting<number[]>(KEY.medRefusalAcked, []);
    const unacked = refusals.filter((r) => !acked.includes(r.id));

    if (unacked.length === 0) {
      await clearSetting(KEY.medRefusalAlert);
      return { outcome: "skipped" };
    }

    const latest = unacked[0];
    await setSetting(
      KEY.medRefusalAlert,
      JSON.stringify({
        dataPointId: latest.id,
        sessionId: latest.sessionId,
        count: unacked.length,
        detail: latest.rawResponse,
        at: latest.createdAt instanceof Date ? latest.createdAt.toISOString() : String(latest.createdAt),
      })
    );
    return { outcome: "warn", detail: `${unacked.length} unacknowledged medication refusal(s) in the last 2h` };
  },
};

// ─── Job 5: Wellbeing alert escalation ───────────────────────────────────────

const wellbeingJob: CronJob = {
  name: "wellbeing_escalation",
  title: "Wellbeing Alert Escalation",
  schedule: "Every 5 minutes",
  intervalMs: 5 * 60_000,
  placesCall: false,
  async run() {
    const since = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const flagged = await db
      .select()
      .from(callSessionsTable)
      .where(and(eq(callSessionsTable.flagged, true), gte(callSessionsTable.startedAt, since)))
      .orderBy(desc(callSessionsTable.startedAt));

    const acked = await getJsonSetting<number[]>(KEY.wellbeingAcked, []);
    const unacked = flagged.filter((s) => !acked.includes(s.id));

    if (unacked.length === 0) {
      await clearSetting(KEY.wellbeingAlert);
      return { outcome: "skipped" };
    }

    const latest = unacked[0];
    await setSetting(
      KEY.wellbeingAlert,
      JSON.stringify({
        sessionId: latest.id,
        count: unacked.length,
        summary: latest.summary,
        at: latest.startedAt instanceof Date ? latest.startedAt.toISOString() : String(latest.startedAt),
      })
    );
    return { outcome: "warn", detail: `${unacked.length} unacknowledged flagged wellbeing session(s) in the last 4h` };
  },
};

// ─── Job 6: Rotation task daily reset ────────────────────────────────────────

const rotationResetJob: CronJob = {
  name: "rotation_reset",
  title: "Rotation Task Daily Reset",
  schedule: "Daily at midnight PT",
  intervalMs: null,
  placesCall: false,
  async run(now, opts) {
    if (now.hhmm !== "00:00" && !opts?.force) return { outcome: "skipped" };
    if (!(await claimForToday(KEY.rotationResetClaim, now.date, opts?.force))) return { outcome: "skipped" };

    // NOTE: rotation_tasks tracks completion via `status` + `completed_at`
    // (there is no is_completed column). Ray's typed notes (logged_note) and
    // med_response are intentionally preserved — only completion state resets.
    const reset = await db
      .update(rotationTasksTable)
      .set({ status: "pending", completedAt: null })
      .where(sql`${rotationTasksTable.status} <> 'pending' OR ${rotationTasksTable.completedAt} IS NOT NULL`)
      .returning({ id: rotationTasksTable.id });

    return { outcome: "ok", detail: `Reset ${reset.length} rotation task(s) for the new day` };
  },
};

// ─── Job 7: Missed call detection ────────────────────────────────────────────

const missedCallJob: CronJob = {
  name: "missed_call_detection",
  title: "Missed Call Detection",
  schedule: "Daily, 2 hours after the configured call time",
  intervalMs: null,
  placesCall: false,
  async run(now, opts) {
    const settings = await getSettings();
    if (!settings.dailyCallEnabled && !opts?.force) return { outcome: "skipped" };
    if (now.hhmm !== addMinutesToHHMM(settings.dailyCallTime, 120) && !opts?.force) return { outcome: "skipped" };
    if (!(await claimForToday(KEY.missedCallClaim, now.date, opts?.force))) return { outcome: "skipped" };

    // A row merely existing isn't proof Pops was reached — browser chat
    // (gemini.ts) and in-app health-assessment sessions also write to
    // call_sessions with no ElevenLabs call involved, and even a real
    // outbound call can ring out unanswered. Require an actual ElevenLabs
    // outbound session AND a confirmed-reached outcome (set by the webhook
    // once Pops is heard on the transcript).
    const todaysSessions = await db
      .select({ id: callSessionsTable.id })
      .from(callSessionsTable)
      .where(and(
        eq(callSessionsTable.sessionDate, now.date),
        isNotNull(callSessionsTable.elevenlabsConversationId),
        eq(callSessionsTable.reached, true)
      ))
      .limit(1);

    if (todaysSessions.length > 0) {
      await clearSetting(KEY.missedCallToday);
      await setSetting(KEY.missedCallStreak, "0");
      return { outcome: "ok", detail: "A call reached Pops today — streak reset." };
    }

    const streak = parseInt((await getSetting(KEY.missedCallStreak)) ?? "0", 10) + 1;
    await setSetting(KEY.missedCallStreak, String(streak));
    await setSetting(KEY.missedCallToday, JSON.stringify({ missed: true, reason: "no_session_today", at: new Date().toISOString() }));
    return { outcome: "warn", detail: `No call reached Pops today (missed streak: ${streak})` };
  },
};

// ─── Job 8: Schedule quarter auto-advance ────────────────────────────────────

/**
 * Mirrors computeCurrentQuarter() in routes/state.ts so the app has ONE
 * definition of quarter boundaries — evaluated against Pacific time here.
 */
function computeQuarterForHour(hour: number): "Q1" | "Q2" | "Q3" | "Q4" {
  if (hour >= 6 && hour < 12) return "Q1";
  if (hour >= 12 && hour < 18) return "Q2";
  if (hour >= 18 && hour < 22) return "Q3";
  return "Q4";
}

const quarterAdvanceJob: CronJob = {
  name: "quarter_auto_advance",
  title: "Schedule Quarter Auto-Advance",
  schedule: "Every 30 minutes",
  intervalMs: 30 * 60_000,
  placesCall: false,
  async run(now) {
    const rows = await db.select().from(appStateTable).where(eq(appStateTable.tenantId, "local")).limit(1);
    const state = rows[0];
    if (!state) return { outcome: "skipped" };
    // Ray's manual override always wins — never clobber it.
    if (state.quarterOverride) return { outcome: "skipped" };

    const computed = computeQuarterForHour(now.hour);
    if (state.currentQuarter === computed) return { outcome: "skipped" };

    await db
      .update(appStateTable)
      .set({ currentQuarter: computed, lastUpdated: new Date() })
      .where(eq(appStateTable.id, state.id));
    return { outcome: "ok", detail: `Advanced ${state.currentQuarter} → ${computed}` };
  },
};

// ─── Registry + master tick ──────────────────────────────────────────────────

export const CRON_JOBS: CronJob[] = [
  dailyCallJob,
  appointmentReminderJob,
  haldolAlertJob,
  medRefusalJob,
  wellbeingJob,
  rotationResetJob,
  missedCallJob,
  quarterAdvanceJob,
];

const lastPolledAt = new Map<string, number>();

async function runJob(job: CronJob, now: PacificNow, opts?: { force?: boolean }): Promise<JobResult> {
  let result: JobResult;
  try {
    result = await job.run(now, opts);
  } catch (err) {
    // A failing job must never take down the tick loop or its siblings.
    result = { outcome: "error", detail: err instanceof Error ? err.message : String(err) };
    logger.error({ err, job: job.name }, "Cron job threw");
  }
  // "skipped" is the common no-op path (wrong minute, nothing to do) — logging
  // it every tick would bury the meaningful history.
  if (result.outcome !== "skipped") {
    await recordJobRun(job.name, result);
    const log = result.outcome === "ok" ? logger.info.bind(logger) : logger.warn.bind(logger);
    log({ job: job.name, outcome: result.outcome, detail: result.detail }, "Cron job ran");
  }
  return result;
}

/** Runs a single job on demand (the Admin "Run Now" button). */
export async function runJobByName(name: string): Promise<JobResult | null> {
  const job = CRON_JOBS.find((j) => j.name === name);
  if (!job) return null;
  return runJob(job, pacificNow(), { force: true });
}

async function tick(): Promise<void> {
  const now = pacificNow();
  for (const job of CRON_JOBS) {
    if (job.intervalMs !== null) {
      const last = lastPolledAt.get(job.name) ?? 0;
      if (now.epochMs - last < job.intervalMs) continue;
      lastPolledAt.set(job.name, now.epochMs);
    }
    await runJob(job, now);
  }
}

/** Starts the in-process scheduled-jobs runner. Call once at server startup. */
export function startCronScheduler(): void {
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "Cron scheduler tick threw"));
  }, CHECK_INTERVAL_MS);
  logger.info({ jobs: CRON_JOBS.map((j) => j.name) }, "Cron scheduler started");
}

// ─── Status + acknowledgement surface (consumed by routes/cron.ts) ───────────

export interface CronStatus {
  jobs: Array<{
    name: string;
    title: string;
    schedule: string;
    lastRanAt: string | null;
    lastOutcome: JobOutcome | null;
    lastDetail: string | null;
  }>;
  alerts: {
    medRefusal: unknown | null;
    wellbeing: unknown | null;
    missedCall: unknown | null;
    haldol: unknown | null;
    missedCallStreak: number;
  };
}

export async function getCronStatus(): Promise<CronStatus> {
  const { rows } = await pool.query<{ job_name: string; ran_at: Date; outcome: JobOutcome; detail: string | null }>(
    `SELECT DISTINCT ON (job_name) job_name, ran_at, outcome, detail
     FROM cron_job_log ORDER BY job_name, ran_at DESC`
  );
  const byName = new Map(rows.map((r) => [r.job_name, r]));

  const [medRefusal, wellbeing, missedCall, haldol, streak] = await Promise.all([
    getJsonSetting<unknown | null>(KEY.medRefusalAlert, null),
    getJsonSetting<unknown | null>(KEY.wellbeingAlert, null),
    getJsonSetting<unknown | null>(KEY.missedCallToday, null),
    getJsonSetting<unknown | null>(KEY.haldolAlert, null),
    getSetting(KEY.missedCallStreak),
  ]);

  return {
    jobs: CRON_JOBS.map((j) => {
      const row = byName.get(j.name);
      return {
        name: j.name,
        title: j.title,
        schedule: j.schedule,
        lastRanAt: row ? new Date(row.ran_at).toISOString() : null,
        lastOutcome: row?.outcome ?? null,
        lastDetail: row?.detail ?? null,
      };
    }),
    alerts: {
      medRefusal,
      wellbeing,
      missedCall,
      haldol,
      missedCallStreak: parseInt(streak ?? "0", 10),
    },
  };
}

/**
 * Ray acknowledging an alert. Med-refusal and wellbeing alerts record the
 * acknowledged row ids so the polling jobs don't immediately re-raise them.
 */
export async function acknowledgeAlert(kind: "med_refusal" | "wellbeing" | "missed_call"): Promise<void> {
  if (kind === "missed_call") {
    await clearSetting(KEY.missedCallToday);
    return;
  }
  if (kind === "med_refusal") {
    const alert = await getJsonSetting<{ dataPointId?: number } | null>(KEY.medRefusalAlert, null);
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const open = await db
      .select({ id: healthDataPointsTable.id })
      .from(healthDataPointsTable)
      .where(
        and(
          eq(healthDataPointsTable.category, "medication"),
          eq(healthDataPointsTable.parsedValue, "no"),
          eq(healthDataPointsTable.flagged, true),
          gte(healthDataPointsTable.createdAt, since)
        )
      );
    const acked = await getJsonSetting<number[]>(KEY.medRefusalAcked, []);
    const merged = [...new Set([...acked, ...open.map((r) => r.id), ...(alert?.dataPointId ? [alert.dataPointId] : [])])];
    await setSetting(KEY.medRefusalAcked, JSON.stringify(merged.slice(-200)));
    await clearSetting(KEY.medRefusalAlert);
    return;
  }
  const alert = await getJsonSetting<{ sessionId?: number } | null>(KEY.wellbeingAlert, null);
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const open = await db
    .select({ id: callSessionsTable.id })
    .from(callSessionsTable)
    .where(and(eq(callSessionsTable.flagged, true), gte(callSessionsTable.startedAt, since)));
  const acked = await getJsonSetting<number[]>(KEY.wellbeingAcked, []);
  const merged = [...new Set([...acked, ...open.map((r) => r.id), ...(alert?.sessionId ? [alert.sessionId] : [])])];
  await setSetting(KEY.wellbeingAcked, JSON.stringify(merged.slice(-200)));
  await clearSetting(KEY.wellbeingAlert);
}
