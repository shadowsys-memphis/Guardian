import { db, pool } from "@workspace/db";
import {
  appSettingsTable,
  appStateTable,
  callSessionsTable,
  haldolCycleTable,
  healthDataPointsTable,
  medicalAppointmentsTable,
  rotationTasksTable,
  scheduleTasksTable,
} from "@workspace/db";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { computeHaldolCycle } from "./haldol-cycle";
import { resolveAndStoreDayType } from "./day-type";
import { isTaskTier, nextLadderStep, DEFAULT_TIER, type TaskStatus } from "./task-tiers";
import { getSettings, isInQuietWindow } from "../routes/health-assessment";
import { triggerOutboundCall } from "../routes/jessica";
import { logger } from "./logger";
import { pacificNow, pacificDateOf, pacificWallTimeToEpochMs, type PacificNow } from "./pacific-time";

const CHECK_INTERVAL_MS = 60_000;

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
  // Persistent multi-day streak alert — stays set until the streak resets to 0,
  // unlike missed_call_today which is per-day and dismissible.
  missedCallStreakAlert: "missed_call_streak_alert",
  // The Pacific call date on which the current streak began (first miss).
  // Set when streak goes from 0→1 and cleared only when a successful call
  // breaks the streak, so the escalation banner always shows the true start
  // date, not the most-recent missed day.
  missedCallFirstMissedDate: "missed_call_first_missed_date",
  // Date Ray was last called on the admin phone to notify about a missed streak.
  missedCallAdminNotifiedDate: "missed_call_admin_notified_date",
  // ElevenLabs config validation result (agent + phone number reachability).
  elevenlabsConfigAlert: "elevenlabs_config_alert",
  // Once-per-day claim for the ElevenLabs config check job.
  elevenlabsConfigCheckClaim: "elevenlabs_config_check_last_date",
  // Once-per-day claims for the daily-routine foundation jobs.
  dayTypeResolveClaim: "day_type_resolve_last_date",
  scheduleResetClaim: "schedule_reset_last_date",
  // Tier-ladder escalation alerts awaiting Ray (JSON array of open items).
  taskEscalationAlert: "task_escalation_alert",
  // Morning wake-call retry state: { date, attempts, lastAt } (JSON).
  wakeRetryState: "wake_call_retry_state",
  // Once-per-day claim for the single out-of-bed follow-up call.
  outOfBedClaim: "out_of_bed_followup_last_date",
  // Consecutive days the shower was skipped (integer as string).
  showerSkipStreak: "shower_skip_streak",
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

// ─── Time helpers (all scheduling decisions are Pacific-local) ───────────────
//
// `pacificNow`, `pacificDateOf`, and `pacificWallTimeToEpochMs` live in
// ./pacific-time (shared with the routes that create call_sessions rows, so
// "today" means the same Pacific calendar date everywhere).

/**
 * True once `now` has reached `targetHHMM` for the day — a durable catch-up
 * window instead of an exact-minute match, so a server restart that lands on
 * (or just after) the trigger minute doesn't cause that job to be skipped for
 * the whole day. Each caller still calls `claimForToday` right after this
 * check, so widening the window never causes a job to run more than once a
 * day — it only widens WHEN the once-a-day claim can first succeed.
 *
 * `boundMinutes`, when given, closes the window that many minutes after the
 * target — use it for call-placing jobs so a long outage doesn't trigger a
 * surprise call hours late. Omit it for non-call jobs, where running late
 * the same day is strictly better than not running at all.
 *
 * Compares real epoch-ms instants (via pacificWallTimeToEpochMs), not wrapped
 * "HH:MM" strings, so a target/bound that crosses midnight (e.g. a 23:00
 * target with a 60-minute bound) is handled correctly instead of the window
 * silently never matching.
 */
function isTimeOfDayDue(now: PacificNow, targetHHMM: string, boundMinutes?: number): boolean {
  const todayTargetMs = pacificWallTimeToEpochMs(now.date, targetHHMM);
  if (boundMinutes === undefined) return now.epochMs >= todayTargetMs;
  if (isWithinBoundedWindow(now.epochMs, todayTargetMs, boundMinutes)) return true;
  // A bounded window anchored on the PRIOR Pacific calendar date can still be
  // open right now if target+bound itself crosses midnight (e.g. a 23:30
  // target with a 60-minute bound doesn't close until 00:30 the next day) —
  // `now` rolling over to a new calendar date must not prematurely close a
  // window that hasn't actually elapsed yet.
  const priorDate = pacificDateOf(todayTargetMs - 24 * 60 * 60 * 1000);
  const priorTargetMs = pacificWallTimeToEpochMs(priorDate, targetHHMM);
  return isWithinBoundedWindow(now.epochMs, priorTargetMs, boundMinutes);
}

function isWithinBoundedWindow(epochMs: number, targetMs: number, boundMinutes: number): boolean {
  return epochMs >= targetMs && epochMs <= targetMs + boundMinutes * 60_000;
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
 * Atomically claims a once-per-day slot for `key`. Returns false if today is
 * already claimed. Uses a single conditional UPSERT (not a separate read
 * then write) because setInterval does not wait for a slow previous tick —
 * two overlapping ticks (e.g. one stuck inside an external call) could both
 * observe "unclaimed" under a read-then-write and both fire, placing two
 * outbound calls to Pops. Postgres serializes conflicting writes to the same
 * key, so only one caller's UPSERT actually changes the row per date; the
 * `RETURNING` clause is empty for whichever caller loses that race.
 */
async function claimForToday(key: string, date: string, force = false): Promise<boolean> {
  if (force) {
    await setSetting(key, date);
    return true;
  }
  const result = await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_at = NOW()
       WHERE app_settings.value IS DISTINCT FROM $2
     RETURNING key`,
    [key, date]
  );
  return (result.rowCount ?? 0) > 0;
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

/**
 * Idempotent, self-contained guard so the scheduler's own table doesn't
 * depend on the broader tenant migration succeeding (index.ts logs and
 * continues past a migration failure). Without this, a failed migration left
 * jobs running "blind" — recordJobRun errors every tick and /api/cron/status
 * (the Admin Jobs panel) 500s outright since it queries cron_job_log with no
 * fallback. Mirrors the exact shape tenant-migration.ts creates.
 */
async function ensureCronLogTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cron_job_log (
        id SERIAL PRIMARY KEY,
        job_name TEXT NOT NULL,
        ran_at TIMESTAMP NOT NULL DEFAULT NOW(),
        outcome TEXT NOT NULL,
        detail TEXT
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS cron_job_log_name_ran_idx ON cron_job_log (job_name, ran_at DESC)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure cron_job_log table — job history/status may be unavailable");
  }
}

/**
 * Daily-routine foundation DDL — runs once at scheduler startup (raw SQL via
 * pool per the repo's drizzle-kit-push-hangs gotcha). Idempotent: guarded
 * ALTERs on schedule_tasks plus CREATE IF NOT EXISTS for day_types, with a
 * one-time tier backfill for rows that predate the tier column.
 */
async function ensureRoutineFoundationSchema(): Promise<void> {
  try {
    // schedule_tasks may not exist yet on a fresh DB (DB Gotchas #2).
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedule_tasks') THEN
          ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'routine';
          ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
          ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS completion_source TEXT;
          ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP;
          ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;
          ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS jessica_calls BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS day_types (
        id SERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'local',
        day_date DATE NOT NULL,
        day_type TEXT NOT NULL DEFAULT 'normal',
        resolved_by TEXT NOT NULL DEFAULT 'auto',
        reason TEXT,
        pending_recommendation TEXT,
        recommendation_reason TEXT,
        confirmed_by TEXT,
        confirmed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // One label per tenant per day — this constraint IS the "never two
    // conflicting day types" rule; resolver re-runs update in place.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS day_types_tenant_date_idx ON day_types (tenant_id, day_date)
    `);

    // One-time backfill for rows that predate the tier/status columns.
    // Guarded by an app_settings marker so a restart can never re-run it and
    // clobber tiers Ray has since corrected by hand. Tier inference mirrors
    // inferTierFromTitle() in task-tiers.ts.
    const marker = await pool.query(
      `SELECT 1 FROM app_settings WHERE key = 'routine_foundation_backfill_done' LIMIT 1`
    );
    if (marker.rowCount === 0) {
      await pool.query(`
        UPDATE schedule_tasks SET tier = CASE
          WHEN title ~* '\\m(fall|emergency|911|panic|unsafe|stove|smoke|wander)\\M' THEN 'safety'
          WHEN title ~* '\\m(meds?|medications?|pills?|doses?|haldol|injections?|prescriptions?|rx)\\M' THEN 'medication'
          WHEN title ~* '\\m(breakfast|lunch|dinner|snacks?|meals?|eat|water|hydration|hydrate|drinks?|fluids?)\\M' THEN 'meals_hydration'
          WHEN title ~* '\\m(sleep|bed|bedtime|naps?|wake|goodnight)\\M' THEN 'sleep'
          WHEN title ~* '\\m(showers?|bathe|bath|teeth|brush|deodorant|hygiene|dress|clothes|koda|dog|walks?|feed)\\M' THEN 'hygiene_koda'
          ELSE 'routine'
        END
        WHERE tier = 'routine'
      `);
      // Bring status in line with the legacy isCompleted mirror for rows
      // completed before the status column existed.
      await pool.query(`
        UPDATE schedule_tasks SET status = 'done', completion_source = COALESCE(completion_source, 'admin')
        WHERE is_completed = true AND status = 'pending'
      `);
      await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('routine_foundation_backfill_done', $1)
         ON CONFLICT (key) DO NOTHING`,
        [new Date().toISOString()]
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to ensure daily-routine foundation schema — tier/day-type features may be unavailable");
  }
}

/**
 * One-time seed of the morning sequence + hydration checkpoints (routine
 * spec: wake → water → dog out → make bed → tidy room → hygiene → breakfast,
 * plus four water check-ins across the day).
 *
 * Additive and marker-guarded: only inserts tasks that don't already exist
 * (fuzzy title match), never edits or moves anything Ray already has, and
 * never runs twice — so deleting one of these later is a decision that
 * sticks, not a fight with the seeder. Times slot into the gaps of the
 * existing 0600-wake schedule; Q1 order is then renumbered by time so the
 * sequence reads correctly on the dashboard.
 */
async function ensureMorningSequenceSeed(): Promise<void> {
  try {
    const marker = await pool.query(
      `SELECT 1 FROM app_settings WHERE key = 'morning_sequence_seed_done' LIMIT 1`
    );
    if ((marker.rowCount ?? 0) > 0) return;

    const SEED: Array<{ match: string; quarter: string; timeLabel: string; title: string; description: string; tier: string }> = [
      { match: "\\m(water|hydrat)\\M.*\\m(morning)\\M|\\mmorning water\\M", quarter: "Q1", timeLabel: "0615", title: "Morning Water", description: "First water of the day — counts only when he confirms drinking it on the call.", tier: "meals_hydration" },
      { match: "\\m(koda|dog)\\M(?!.*walk)", quarter: "Q1", timeLabel: "0620", title: "Koda Out & Fed", description: "Done = Koda out, fed, and watered. Bad weather or a health issue never fails this.", tier: "hygiene_koda" },
      { match: "\\mmake\\M.*\\mbed\\M", quarter: "Q1", timeLabel: "0640", title: "Make the Bed", description: "Quick tidy of the bed.", tier: "routine" },
      { match: "\\mtidy\\M", quarter: "Q1", timeLabel: "0645", title: "Tidy the Room", description: "A few minutes of straightening up.", tier: "routine" },
      { match: "\\m(teeth|deodorant)\\M", quarter: "Q1", timeLabel: "0815", title: "Teeth, Deodorant & Clean Clothes", description: "Daily basics — tracked separately from the shower.", tier: "hygiene_koda" },
      { match: "\\m(koda|dog)\\M.*\\mwalk\\M|\\mwalk\\M.*\\m(koda|dog)\\M", quarter: "Q1", timeLabel: "0830", title: "Koda Walk (bonus)", description: "Bonus, not required — skipping never counts against the day.", tier: "routine" },
      { match: "\\mwater check\\M.*\\m(midday|1130)\\M|\\mmidday water\\M", quarter: "Q2", timeLabel: "1130", title: "Water Check (midday)", description: "Counts only when he confirms drinking it on the call.", tier: "meals_hydration" },
      { match: "\\mwater check\\M.*\\m(afternoon|1500)\\M|\\mafternoon water\\M", quarter: "Q2", timeLabel: "1500", title: "Water Check (afternoon)", description: "Counts only when he confirms drinking it on the call.", tier: "meals_hydration" },
      { match: "\\mwater check\\M.*\\m(evening|1830)\\M|\\mevening water\\M", quarter: "Q3", timeLabel: "1830", title: "Water Check (evening)", description: "Counts only when he confirms drinking it on the call.", tier: "meals_hydration" },
    ];

    for (const s of SEED) {
      const existing = await pool.query(
        `SELECT 1 FROM schedule_tasks WHERE tenant_id = 'local' AND title ~* $1 LIMIT 1`,
        [s.match]
      );
      if ((existing.rowCount ?? 0) > 0) continue;
      await pool.query(
        `INSERT INTO schedule_tasks (tenant_id, quarter, time_label, title, description, tier, "order", is_active, is_completed, status)
         VALUES ('local', $1, $2, $3, $4, $5, 999, true, false, 'pending')`,
        [s.quarter, s.timeLabel, s.title, s.description, s.tier]
      );
    }

    // Renumber the whole local schedule by (quarter, time) so the morning
    // reads in the spec's order. Non-HHMM labels sort after timed tasks.
    await pool.query(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
          ORDER BY quarter,
                   (time_label !~ '^[0-2][0-9][0-5][0-9]$'),
                   time_label,
                   "order"
        ) AS rn
        FROM schedule_tasks WHERE tenant_id = 'local'
      )
      UPDATE schedule_tasks t SET "order" = ranked.rn FROM ranked WHERE t.id = ranked.id
    `);

    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('morning_sequence_seed_done', $1)
       ON CONFLICT (key) DO NOTHING`,
      [new Date().toISOString()]
    );
    logger.info("Morning sequence seed applied");
  } catch (err) {
    logger.error({ err }, "Failed to seed morning sequence — schedule unchanged");
  }
}

/** Shared quiet-window guard for every job that can place a call. */
async function quietWindowBlocks(now: PacificNow): Promise<boolean> {
  const settings = await getSettings();
  return isInQuietWindow(now.hhmm, settings.quietWindowStart, settings.quietWindowEnd);
}

/**
 * Validates that ELEVENLABS_AGENT_ID and ELEVENLABS_PHONE_NUMBER_ID actually
 * resolve against ElevenLabs' live API. Returns a result object rather than
 * throwing — the caller stores the result in app_settings so the dashboard
 * can surface it, regardless of whether this is the startup check or the
 * daily scheduled run.
 */
async function validateElevenLabsConfig(): Promise<{
  agentOk: boolean;
  phoneOk: boolean;
  issues: string[];
}> {
  const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  const agentId = process.env["ELEVENLABS_AGENT_ID"];
  const phoneId = process.env["ELEVENLABS_PHONE_NUMBER_ID"];

  if (!apiKey) {
    return { agentOk: false, phoneOk: false, issues: ["ELEVENLABS_API_KEY is not set"] };
  }

  const issues: string[] = [];
  let agentOk = false;
  let phoneOk = false;

  if (!agentId) {
    issues.push("ELEVENLABS_AGENT_ID is not set");
  } else {
    try {
      const res = await fetch(`${ELEVENLABS_BASE}/convai/agents/${agentId}`, {
        headers: { "xi-api-key": apiKey },
      });
      if (res.ok) {
        // IDENTITY CHECK — existence is not correctness. This config has
        // repeatedly drifted to a *valid but wrong* agent ("Laura", a blank
        // default in an old second ElevenLabs account), and an ID that merely
        // resolves passes silently while calls run with a stranger's prompt.
        // The reliable identity signal is the agent's NAME: it must be Jessica.
        const agent = await res.json() as { name?: string };
        const agentName = agent.name ?? "(unnamed)";
        if (agentName.trim().toLowerCase() === "jessica") {
          agentOk = true;
        } else {
          issues.push(
            `WRONG AGENT: ELEVENLABS_AGENT_ID resolves to "${agentName}", not Jessica. ` +
            `The API key and agent ID are likely from the wrong ElevenLabs account — ` +
            `see ELEVENLABS_HANDOFF.md for the verified configuration.`
          );
        }
      } else if (res.status === 404) {
        issues.push(`Agent ID "${agentId}" not found in ElevenLabs — wrong account's API key, or the agent was deleted. See ELEVENLABS_HANDOFF.md.`);
      } else {
        issues.push(`Agent check failed (HTTP ${res.status})`);
      }
    } catch (err) {
      issues.push(`Agent check request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!phoneId) {
    issues.push("ELEVENLABS_PHONE_NUMBER_ID is not set");
  } else {
    try {
      const res = await fetch(`${ELEVENLABS_BASE}/convai/phone-numbers`, {
        headers: { "xi-api-key": apiKey },
      });
      if (res.ok) {
        const list = await res.json() as Array<{ phone_number: string; phone_number_id: string; assigned_agent?: { agent_id?: string; agent_name?: string } }>;
        const match = list.find((p) => p.phone_number === phoneId || p.phone_number_id === phoneId);
        if (match) {
          // The number must also be assigned to OUR agent — a number that
          // exists but rings a different agent is the same wrong-account trap.
          if (!agentId || !match.assigned_agent?.agent_id || match.assigned_agent.agent_id === agentId) {
            phoneOk = true;
          } else {
            issues.push(
              `Phone number is assigned to agent "${match.assigned_agent.agent_name ?? match.assigned_agent.agent_id}", ` +
              `not the configured ELEVENLABS_AGENT_ID — see ELEVENLABS_HANDOFF.md.`
            );
          }
        } else {
          issues.push(`Phone number ID "${phoneId}" not found in this ElevenLabs account (${list.length} number(s) visible) — likely the wrong account's API key. See ELEVENLABS_HANDOFF.md.`);
        }
      } else {
        issues.push(`Phone number check failed (HTTP ${res.status})`);
      }
    } catch (err) {
      issues.push(`Phone number check request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { agentOk, phoneOk, issues };
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
    if (!isTimeOfDayDue(now, settings.dailyCallTime, 60) && !opts?.force) return { outcome: "skipped" };

    // Quiet window is enforced even on a forced run.
    if (isInQuietWindow(now.hhmm, settings.quietWindowStart, settings.quietWindowEnd)) {
      return { outcome: "warn", detail: `Quiet window is active (${settings.quietWindowStart}–${settings.quietWindowEnd}) — call suppressed.` };
    }
    if (!(await claimForToday(KEY.dailyCallClaim, now.date, opts?.force))) return { outcome: "skipped" };

    const result = await triggerOutboundCall({ extraContext: await overdueHaldolContext() });
    if (!result.ok) {
      // Record the failure reason for the per-day banner — but do NOT increment
      // missed_call_streak here. Streak counting is owned exclusively by
      // missedCallJob (the post-deadline detection job), which checks the DB for
      // an actual confirmed-reached session. If we also incremented here,
      // a single failed day would produce streak=2 (once in dailyCallJob, once
      // in missedCallJob), which would falsely trigger the multi-day escalation.
      await setSetting(KEY.missedCallToday, JSON.stringify({ missed: true, reason: result.error, at: new Date().toISOString() }));
      return { outcome: "error", detail: `Call failed to start: ${result.error}${result.message ? ` — ${result.message}` : ""}` };
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
    // Honor the same master call switch as the daily call — no job may dial
    // the phone while calling is disabled in Settings, or the admin UI lies.
    const settings = await getSettings();
    if (!settings.dailyCallEnabled && !opts?.force) return { outcome: "skipped" };

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
    if (!isTimeOfDayDue(now, "09:00") && !opts?.force) return { outcome: "skipped" };
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
    if (!isTimeOfDayDue(now, "00:00") && !opts?.force) return { outcome: "skipped" };
    if (!(await claimForToday(KEY.rotationResetClaim, now.date, opts?.force))) return { outcome: "skipped" };

    // NOTE: rotation_tasks tracks completion via `status` + `completed_at`
    // (there is no is_completed column). Ray's typed notes (logged_note) and
    // med_response are intentionally preserved — only completion state resets.
    //
    // Only clear completions earned on an EARLIER Pacific day. `isTimeOfDayDue`
    // with no bound is true from 00:00 until 23:59, so this job is "due" all day
    // and fires on the first tick after the server comes up. On Replit the
    // server sleeps and restarts constantly, so that first tick is routinely
    // mid-afternoon — an unfiltered reset would then wipe the caregiving tasks
    // already checked off that morning. Scoping by day makes a late catch-up
    // run harmless instead of destructive.
    const startOfToday = new Date(pacificWallTimeToEpochMs(now.date, "00:00"));
    const reset = await db
      .update(rotationTasksTable)
      .set({ status: "pending", completedAt: null })
      .where(sql`(${rotationTasksTable.status} <> 'pending' OR ${rotationTasksTable.completedAt} IS NOT NULL)
                 AND (${rotationTasksTable.completedAt} IS NULL OR ${rotationTasksTable.completedAt} < ${startOfToday})`)
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

    // The 2-hour deadline as a real epoch instant — not a wrapped "HH:MM"
    // string — so a late-configured call time (e.g. 23:00, deadline 01:00
    // the next Pacific day) is handled correctly instead of silently never
    // matching or matching against the wrong day.
    const callTargetMs = pacificWallTimeToEpochMs(now.date, settings.dailyCallTime);
    const deadlineMs = callTargetMs + 120 * 60_000;
    if (now.epochMs < deadlineMs && !opts?.force) return { outcome: "skipped" };
    if (!(await claimForToday(KEY.missedCallClaim, now.date, opts?.force))) return { outcome: "skipped" };

    // The call being checked for happened (if at all) on the Pacific calendar
    // date the call TIME itself falls on. For a normal morning call this is
    // still `now.date`, but for a late call time the 2-hour deadline can
    // itself land after midnight, so by the time we check, `now.date` has
    // already rolled to the next Pacific day relative to when the call ran.
    const callDate = pacificDateOf(callTargetMs);

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
        eq(callSessionsTable.sessionDate, callDate),
        isNotNull(callSessionsTable.elevenlabsConversationId),
        eq(callSessionsTable.reached, true)
      ))
      .limit(1);

    if (todaysSessions.length > 0) {
      await clearSetting(KEY.missedCallToday);
      // Persistent streak alert and first-missed-date both clear on success —
      // they reset together so the next run starts fresh.
      await clearSetting(KEY.missedCallStreakAlert);
      await clearSetting(KEY.missedCallFirstMissedDate);
      await setSetting(KEY.missedCallStreak, "0");
      return { outcome: "ok", detail: "A call reached Pops today — streak reset." };
    }

    const streak = parseInt((await getSetting(KEY.missedCallStreak)) ?? "0", 10) + 1;
    await setSetting(KEY.missedCallStreak, String(streak));
    await setSetting(KEY.missedCallToday, JSON.stringify({ missed: true, reason: "no_session_today", at: new Date().toISOString() }));

    // Record the first missed date the moment the streak begins (streak 0→1).
    // This is the only write to missedCallFirstMissedDate during a streak —
    // subsequent missed days just increment the counter and leave the date alone,
    // so the escalation banner always shows the true start of the gap.
    if (streak === 1) {
      await setSetting(KEY.missedCallFirstMissedDate, callDate);
    }

    // ── Streak escalation ─────────────────────────────────────────────────────
    //
    // A single missed day is surfaced as a per-day dashboard banner and a log
    // entry only. Two or more consecutive missed days triggers escalation:
    //   1. A persistent dashboard alert that stays visible until the streak
    //      actually breaks (a successful Pops call), so Ray can't dismiss-and-
    //      forget a multi-day gap by acknowledging yesterday's per-day banner.
    //   2. A best-effort outbound ElevenLabs call to Ray's admin phone, placed
    //      once per Pacific day, so he gets a spoken heads-up even if he hasn't
    //      opened the app.
    //
    // The admin call MUST pass noSession: true — see triggerOutboundCall() for
    // the full reasoning, but in short: admin calls must not write call_sessions
    // rows, otherwise an answered admin call's reached=true would satisfy the
    // detection query below and incorrectly reset the streak even though Pops
    // was never reached.
    //
    // The admin call is best-effort: if ElevenLabs is down (possibly why the
    // daily call failed in the first place), the admin call will also fail —
    // the streak alert on the dashboard remains as the fallback signal.
    if (streak >= 2) {
      // firstMissed was stored when the streak began (streak 0→1); read it back
      // so the banner shows the true start date, not the most recent missed day.
      const firstMissed = await getSetting(KEY.missedCallFirstMissedDate) ?? callDate;
      await setSetting(
        KEY.missedCallStreakAlert,
        JSON.stringify({ streak, since: firstMissed, at: new Date().toISOString() })
      );

      // Only call the admin phone once per day — the claim key resets each
      // Pacific calendar day and the quiet window is still respected, so a
      // late-night detection doesn't ring Ray at 2am.
      const lastAdminNotified = await getSetting(KEY.missedCallAdminNotifiedDate);
      if (lastAdminNotified !== now.date && !(await quietWindowBlocks(now))) {
        await setSetting(KEY.missedCallAdminNotifiedDate, now.date);
        // Fire-and-forget — never throws because triggerOutboundCall itself
        // never throws. The streak-alert dashboard banner remains the durable
        // signal regardless of whether this call succeeds.
        void triggerOutboundCall({
          test: true,     // routes to ADMIN_PHONE_NUMBER, never Pops' number
          noSession: true, // MUST be true — see above; admin sessions must not
                          // appear as Pops sessions in the missed-call detection query
          extraContext: `CALL PURPOSE — AUTOMATED SYSTEM ALERT: Do NOT treat this as a normal care check-in. This is an automated system message. Pops' daily Jessica check-in call has not successfully reached him for ${streak} consecutive days. The most recent missed day was ${now.date}. Please open the Brain app, check the System Jobs panel on the Dashboard, and investigate why the daily call is failing. This message was placed automatically by the scheduling system.`,
        }).catch(() => {});
      }
    }

    return { outcome: "warn", detail: `No call reached Pops today (missed streak: ${streak})` };
  },
};

// ─── Job 8.5: ElevenLabs config validation ───────────────────────────────────
//
// Runs once daily (8:00 AM PT) and at any forced "Run Now" from the Admin UI.
// Validates that ELEVENLABS_AGENT_ID and ELEVENLABS_PHONE_NUMBER_ID both
// resolve against ElevenLabs' live API. Stores the result in app_settings so
// the dashboard can surface a persistent, Ray-visible warning instead of
// burying the problem in a startup log line.
//
// This catches "deleted / renamed agent" drift before it silently kills the
// next call, rather than discovering it the day the daily call fails.

const elevenlabsConfigJob: CronJob = {
  name: "elevenlabs_config_check",
  title: "ElevenLabs Config Validation",
  schedule: "Daily at 8:00 AM PT",
  intervalMs: null,
  placesCall: false,
  async run(now, opts) {
    if (!isTimeOfDayDue(now, "08:00") && !opts?.force) return { outcome: "skipped" };
    if (!(await claimForToday(KEY.elevenlabsConfigCheckClaim, now.date, opts?.force))) return { outcome: "skipped" };

    const result = await validateElevenLabsConfig();

    if (result.agentOk && result.phoneOk) {
      await clearSetting(KEY.elevenlabsConfigAlert);
      return { outcome: "ok", detail: "ElevenLabs agent and phone number verified against live API." };
    }

    await setSetting(
      KEY.elevenlabsConfigAlert,
      JSON.stringify({ agentOk: result.agentOk, phoneOk: result.phoneOk, issues: result.issues, at: new Date().toISOString() })
    );
    return { outcome: "warn", detail: `ElevenLabs config issue(s): ${result.issues.join("; ")}` };
  },
};

// ─── Job 8: Schedule quarter auto-advance ────────────────────────────────────

/**
 * Mirrors computeCurrentQuarter() in routes/state.ts so the app has ONE
 * definition of quarter boundaries — evaluated against Pacific time here.
 */
function computeQuarterForHour(hour: number): "Q1" | "Q2" | "Q3" | "Q4" {
  // Ray's quarter boundaries (2026-08-14): Q1 6-10, Q2 10-14, Q3 14-18, Q4 18+.
  if (hour >= 6 && hour < 10) return "Q1";
  if (hour >= 10 && hour < 14) return "Q2";
  if (hour >= 14 && hour < 18) return "Q3";
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

// ─── Job 8.7: Wake-call retry (morning routine) ──────────────────────────────
//
// The daily wake-up call gets two retries, 15 minutes apart, before the
// morning is flagged as "no answer" — which is a soft flag, explicitly NOT an
// emergency (the 2-hour missed-call detection and its streak escalation
// remain the serious path). A reached session at any point cancels the
// sequence. Retries never fire in the quiet window, and never more than
// 90 minutes past the configured call time, so a long outage can't cause a
// surprise mid-day ring.

interface WakeRetryState {
  date: string;
  attempts: number;
  lastAt: string;
}

/** True if any confirmed-reached ElevenLabs session exists for `date`. */
async function reachedSessionExists(date: string): Promise<boolean> {
  const rows = await db
    .select({ id: callSessionsTable.id })
    .from(callSessionsTable)
    .where(and(
      eq(callSessionsTable.sessionDate, date),
      isNotNull(callSessionsTable.elevenlabsConversationId),
      eq(callSessionsTable.reached, true)
    ))
    .limit(1);
  return rows.length > 0;
}

/**
 * True if any outbound session STARTED within the last `minutes` — used to
 * avoid placing a new call while a previous one may still be in progress
 * (session rows are created at call start; `reached` only flips when the
 * call ends and the webhook fires, so "no reached session yet" is NOT proof
 * the line is free).
 */
async function sessionStartedWithinMinutes(date: string, minutes: number, nowMs: number): Promise<boolean> {
  const since = new Date(nowMs - minutes * 60_000);
  const rows = await db
    .select({ id: callSessionsTable.id })
    .from(callSessionsTable)
    .where(and(
      eq(callSessionsTable.sessionDate, date),
      isNotNull(callSessionsTable.elevenlabsConversationId),
      gte(callSessionsTable.startedAt, since)
    ))
    .limit(1);
  return rows.length > 0;
}

const wakeRetryJob: CronJob = {
  name: "wake_call_retry",
  title: "Wake-Up Call Retries",
  schedule: "Up to 2 retries, 15 min apart, after the daily call",
  intervalMs: null,
  placesCall: true,
  async run(now) {
    const settings = await getSettings();
    if (!settings.dailyCallEnabled) return { outcome: "skipped" };

    // Only meaningful once today's wake call has actually been placed.
    const claimed = await getSetting(KEY.dailyCallClaim);
    if (claimed !== now.date) return { outcome: "skipped" };

    const callTargetMs = pacificWallTimeToEpochMs(now.date, settings.dailyCallTime);
    if (now.epochMs < callTargetMs) return { outcome: "skipped" };

    const state = await getJsonSetting<WakeRetryState>(KEY.wakeRetryState, { date: "", attempts: 0, lastAt: "" });
    const attempts = state.date === now.date ? state.attempts : 0;

    // Sequence already concluded (gave up earlier today) — nothing else to do.
    if (attempts >= 3) return { outcome: "skipped" };

    // Reached? Sequence over — clear state so tomorrow starts fresh.
    if (await reachedSessionExists(now.date)) {
      if (state.date === now.date && state.attempts > 0) {
        await clearSetting(KEY.wakeRetryState);
        return { outcome: "ok", detail: "Pops was reached — wake retry sequence cleared." };
      }
      return { outcome: "skipped" };
    }

    // Give up: 2 retries spent → flag the morning as no-answer (soft, not emergency).
    if (attempts >= 2) {
      if (state.date === now.date && state.attempts === 2) {
        await setSetting(KEY.wakeRetryState, JSON.stringify({ date: now.date, attempts: 3, lastAt: new Date(now.epochMs).toISOString() }));
        await db
          .update(scheduleTasksTable)
          .set({ status: "no_answer", lastAttemptAt: new Date(now.epochMs) })
          .where(and(
            eq(scheduleTasksTable.tenantId, "local"),
            sql`${scheduleTasksTable.title} ~* '\\mwake\\M'`,
            eq(scheduleTasksTable.status, "pending")
          ));
        return { outcome: "warn", detail: "Wake call unanswered after 2 retries — morning flagged no-answer (not an emergency)." };
      }
      return { outcome: "skipped" };
    }

    // Next retry due 15 min after the last attempt (the initial call counts
    // from the configured call time). Hard-stop 90 min past the call time.
    const lastAttemptMs = attempts === 0 ? callTargetMs : Date.parse(state.lastAt);
    if (now.epochMs < lastAttemptMs + 15 * 60_000) return { outcome: "skipped" };
    if (now.epochMs > callTargetMs + 90 * 60_000) return { outcome: "skipped" };
    if (isInQuietWindow(now.hhmm, settings.quietWindowStart, settings.quietWindowEnd)) return { outcome: "skipped" };
    // A session that STARTED recently may still be a live call (reached only
    // flips at call end) — never ring in on top of it; try again next tick.
    if (await sessionStartedWithinMinutes(now.date, 20, now.epochMs)) return { outcome: "skipped" };

    await setSetting(KEY.wakeRetryState, JSON.stringify({ date: now.date, attempts: attempts + 1, lastAt: new Date(now.epochMs).toISOString() }));
    const result = await triggerOutboundCall({
      extraContext: `CALL PURPOSE — WAKE-UP RETRY ${attempts + 1} of 2: The first wake-up call this morning didn't reach Pops. Keep this call short and gentle — just help him get his morning started. Do not mention missed calls in a way that could worry him.`,
    });
    if (!result.ok) {
      return { outcome: "warn", detail: `Wake retry ${attempts + 1} failed to start: ${result.error}` };
    }
    return { outcome: "ok", detail: `Wake retry ${attempts + 1} of 2 placed (session ${result.sessionId})` };
  },
};

// ─── Job 8.8: Out-of-bed follow-up (morning routine) ─────────────────────────
//
// One follow-up call ~45 minutes after a successful wake call, checking that
// Pops is actually out of bed — then the system moves on. Exactly once per
// day, no repeats, no nagging: if this call doesn't reach him, the normal
// missed-call detection is still the safety net.

const outOfBedJob: CronJob = {
  name: "out_of_bed_followup",
  title: "Out-of-Bed Follow-Up Call",
  schedule: "Once, ~45 min after a successful wake call",
  intervalMs: null,
  placesCall: true,
  async run(now, opts) {
    const settings = await getSettings();
    if (!settings.dailyCallEnabled && !opts?.force) return { outcome: "skipped" };

    const callTargetMs = pacificWallTimeToEpochMs(now.date, settings.dailyCallTime);
    // Window: 45 min to 3 h after the configured call time.
    if (!opts?.force) {
      if (now.epochMs < callTargetMs + 45 * 60_000) return { outcome: "skipped" };
      if (now.epochMs > callTargetMs + 180 * 60_000) return { outcome: "skipped" };
      if (!(await reachedSessionExists(now.date))) return { outcome: "skipped" };
      // Breathing room after the wake call (or a retry) — don't ring again
      // within 30 minutes of any call starting, and never over a live call.
      if (await sessionStartedWithinMinutes(now.date, 30, now.epochMs)) return { outcome: "skipped" };
    }
    if (isInQuietWindow(now.hhmm, settings.quietWindowStart, settings.quietWindowEnd)) {
      return { outcome: "warn", detail: "Quiet window is active — follow-up suppressed." };
    }
    if (!(await claimForToday(KEY.outOfBedClaim, now.date, opts?.force))) return { outcome: "skipped" };

    const result = await triggerOutboundCall({
      extraContext: "CALL PURPOSE — OUT-OF-BED CHECK: This is a very short, warm follow-up to this morning's wake-up call. Ask one thing: is he up and out of bed? If yes, celebrate briefly and let him go. If he's still in bed, gently encourage him to get up now, but do not lecture or repeat yourself — one nudge, then wrap up kindly either way. Keep the whole call under two minutes.",
    });
    if (!result.ok) {
      return { outcome: "warn", detail: `Out-of-bed follow-up failed to start: ${result.error}` };
    }
    return { outcome: "ok", detail: `Out-of-bed follow-up placed (session ${result.sessionId})` };
  },
};

// ─── Job 9: Day-type resolution (daily-routine foundation) ───────────────────
//
// Resolves today's single day type (normal/sunday/rest/appointment/sick) once
// each morning, before the wake-up call, so every downstream decision that day
// reads one consistent label. Re-runs after a restart are safe: the resolver
// updates today's row in place and preserves Ray's confirmations.

const dayTypeResolveJob: CronJob = {
  name: "day_type_resolve",
  title: "Daily Day-Type Resolution",
  schedule: "Daily at 5:30 AM PT",
  intervalMs: null,
  placesCall: false,
  async run(now, opts) {
    if (!isTimeOfDayDue(now, "05:30") && !opts?.force) return { outcome: "skipped" };
    if (!(await claimForToday(KEY.dayTypeResolveClaim, now.date, opts?.force))) return { outcome: "skipped" };

    const row = await resolveAndStoreDayType("local", now.date);
    const rec = row.pendingRecommendation ? ` (pending recommendation: ${row.pendingRecommendation})` : "";
    return { outcome: "ok", detail: `Resolved ${now.date} as "${row.dayType}" via ${row.resolvedBy}${rec}` };
  },
};

// ─── Job 10: Daily schedule reset (nothing carries over) ─────────────────────
//
// schedule_tasks previously kept completions forever unless manually
// uncompleted. Under the routine system every day starts fresh: completion
// state, outcome status, and ladder bookkeeping all reset at midnight PT.
// Mirrors rotation_reset's day-scoping so a late catch-up run after a restart
// never wipes progress already made today.

const scheduleResetJob: CronJob = {
  name: "schedule_reset",
  title: "Schedule Task Daily Reset",
  schedule: "Daily at midnight PT",
  intervalMs: null,
  placesCall: false,
  async run(now, opts) {
    if (!isTimeOfDayDue(now, "00:00") && !opts?.force) return { outcome: "skipped" };
    if (!(await claimForToday(KEY.scheduleResetClaim, now.date, opts?.force))) return { outcome: "skipped" };

    // Shower cadence bookkeeping — MUST run before the reset below wipes
    // yesterday's statuses. Skipping a shower now and then is fine and never
    // penalized; the streak only exists so Jessica can do one gentle check-in
    // after 3+ consecutive skipped days (surfaced via her live context).
    // Teeth/deodorant/clothes are a separate daily item and don't affect this.
    try {
      const showerDone = await db
        .select({ id: scheduleTasksTable.id })
        .from(scheduleTasksTable)
        .where(and(
          eq(scheduleTasksTable.tenantId, "local"),
          sql`${scheduleTasksTable.title} ~* '\\m(shower|hygiene)\\M'`,
          eq(scheduleTasksTable.status, "done")
        ))
        .limit(1);
      if (showerDone.length > 0) {
        await setSetting(KEY.showerSkipStreak, "0");
      } else {
        const streak = parseInt((await getSetting(KEY.showerSkipStreak)) ?? "0", 10) + 1;
        await setSetting(KEY.showerSkipStreak, String(streak));
      }
    } catch (err) {
      logger.warn({ err }, "Shower streak bookkeeping failed — continuing with reset");
    }

    const startOfToday = new Date(pacificWallTimeToEpochMs(now.date, "00:00"));
    const reset = await db
      .update(scheduleTasksTable)
      .set({
        status: "pending",
        isCompleted: false,
        completedAt: null,
        completionSource: null,
        attemptCount: 0,
        lastAttemptAt: null,
        escalatedAt: null,
      })
      .where(sql`(${scheduleTasksTable.status} <> 'pending'
                   OR ${scheduleTasksTable.isCompleted} = true
                   OR ${scheduleTasksTable.attemptCount} > 0)
                 AND (${scheduleTasksTable.completedAt} IS NULL OR ${scheduleTasksTable.completedAt} < ${startOfToday})
                 AND (${scheduleTasksTable.lastAttemptAt} IS NULL OR ${scheduleTasksTable.lastAttemptAt} < ${startOfToday})`)
      .returning({ id: scheduleTasksTable.id });

    // Yesterday's unanswered escalations die with yesterday — the alert key
    // resets so the dashboard shows only today's open items.
    await clearSetting(KEY.taskEscalationAlert);

    return { outcome: "ok", detail: `Reset ${reset.length} schedule task(s) for the new day` };
  },
};

// ─── Job 11: Tier-ladder sweep (late/missed handling by tier) ────────────────
//
// Every 15 minutes, walks today's timed schedule tasks through the shared
// tier ladder (lib/task-tiers.ts): expires lower-tier tasks whose window has
// closed as "missed", and surfaces Ray-notification steps as a persistent
// dashboard alert. It records escalations; it does NOT place calls — retries
// of call-based tasks (wake-up, medication) are driven by their own flows,
// which read the same ladder.
//
// Tasks whose timeLabel isn't a real HHMM time ("Task", "Event") have no
// scheduled instant, so the ladder can't apply — they simply close at the
// nightly reset.

const HHMM_LABEL = /^([01]\d|2[0-3])([0-5]\d)$/;

const taskLadderSweepJob: CronJob = {
  name: "task_ladder_sweep",
  title: "Tier Ladder Sweep",
  schedule: "Every 15 minutes",
  intervalMs: 15 * 60_000,
  placesCall: false,
  async run(now) {
    const tasks = await db
      .select()
      .from(scheduleTasksTable)
      .where(and(eq(scheduleTasksTable.tenantId, "local"), eq(scheduleTasksTable.isActive, true)));

    let closed = 0;
    const escalations: Array<{ taskId: number; title: string; tier: string; reason: string }> = [];

    for (const task of tasks) {
      const m = HHMM_LABEL.exec(task.timeLabel);
      if (!m) continue;
      const status = (task.status as TaskStatus) ?? "pending";
      if (status === "done" || status === "missed") continue;

      const tier = isTaskTier(task.tier) ? task.tier : DEFAULT_TIER;
      const step = nextLadderStep(
        {
          tier,
          status,
          attemptCount: task.attemptCount,
          lastAttemptAtMs: task.lastAttemptAt?.getTime() ?? null,
          escalatedAtMs: task.escalatedAt?.getTime() ?? null,
          scheduledAtMs: pacificWallTimeToEpochMs(now.date, `${m[1]}:${m[2]}`),
        },
        now.epochMs
      );

      if (step.kind === "close_missed") {
        await db
          .update(scheduleTasksTable)
          .set({ status: "missed" })
          .where(eq(scheduleTasksTable.id, task.id));
        closed++;
      } else if (step.kind === "notify_ray") {
        await db
          .update(scheduleTasksTable)
          .set({ escalatedAt: new Date(now.epochMs) })
          .where(eq(scheduleTasksTable.id, task.id));
        escalations.push({ taskId: task.id, title: task.title, tier, reason: step.reason });
      }
    }

    if (escalations.length > 0) {
      const existing = await getJsonSetting<Array<{ taskId: number }>>(KEY.taskEscalationAlert, []);
      const merged = [
        ...existing,
        ...escalations.filter((e) => !existing.some((x) => x.taskId === e.taskId)),
      ];
      await setSetting(KEY.taskEscalationAlert, JSON.stringify(merged));
    }

    if (closed === 0 && escalations.length === 0) return { outcome: "skipped" };
    return {
      outcome: escalations.length > 0 ? "warn" : "ok",
      detail: `Closed ${closed} expired task(s); ${escalations.length} new escalation(s) for Ray`,
    };
  },
};

// ─── Touchpoints: the purpose-driven calls across Pops' day ─────────────────
//
// Ray's schedule expects ~10 short Jessica interactions a day, each with its
// own purpose (hydration nudge, chores, meds at noon/6pm only, journal…).
// One generic job fires whichever active touchpoints are due; the purpose
// prompt flows into triggerOutboundCall's extraContext so Jessica knows this
// is an 8:15 hydration nudge, not a generic check-in. Times/prompts are rows
// Ray can edit (routes/touchpoints.ts) — nothing is hardcoded into the job.
//
// The 7:00 wake-up is deliberately seeded INACTIVE: the existing Daily
// Morning Call (+ its wake-retry and out-of-bed follow-up chain) already owns
// the wake-up slot. Activating both would double-call him every morning.

export interface TouchpointRow {
  id: number;
  timeOfDay: string;
  purpose: string;
  title: string;
  purposePrompt: string;
  active: boolean;
  sortOrder: number;
}

const TOUCHPOINT_TONE =
  "Keep this call SHORT (2–4 minutes), warm, and easy. One question at a time, never a checklist. " +
  "Do not bring up medication unless this purpose explicitly says to. If he sounds tired or wants to go, wrap up kindly.";

const TOUCHPOINT_SEED: Array<Omit<TouchpointRow, "id">> = [
  { timeOfDay: "07:00", purpose: "wake_up", title: "Wake-Up Call", sortOrder: 1, active: false,
    purposePrompt: `CALL PURPOSE — WAKE-UP: A gentle good morning. Confirm he's up and moving, mention one nice thing about the day ahead. ${TOUCHPOINT_TONE}` },
  { timeOfDay: "08:15", purpose: "hydration_morning", title: "Morning Hydration", sortOrder: 2, active: true,
    purposePrompt: `CALL PURPOSE — MORNING HYDRATION: A quick hello. Ask if he's had some water and a little breakfast. That's the whole call. ${TOUCHPOINT_TONE}` },
  { timeOfDay: "10:00", purpose: "chores", title: "Chores Check-In", sortOrder: 3, active: true,
    purposePrompt: `CALL PURPOSE — CHORES: Casually mention what's on the schedule for late morning (use the schedule context you have). Encourage, never push. ${TOUCHPOINT_TONE}` },
  { timeOfDay: "12:00", purpose: "meds_noon", title: "Noon Medication", sortOrder: 4, active: true,
    purposePrompt: `CALL PURPOSE — NOON MEDICATION: This is one of only two calls where medication belongs. Gently confirm he's taking his noon meds, ideally with lunch. If he's already taken them, celebrate briefly and chat a moment. If he refuses, stay kind, don't argue, and note it. ${TOUCHPOINT_TONE}` },
  { timeOfDay: "13:00", purpose: "hydration_afternoon", title: "Afternoon Hydration", sortOrder: 5, active: true,
    purposePrompt: `CALL PURPOSE — AFTERNOON HYDRATION: A short water nudge and a friendly how's-your-day. ${TOUCHPOINT_TONE}` },
  { timeOfDay: "14:00", purpose: "activity", title: "Fun Block", sortOrder: 6, active: true,
    purposePrompt: `CALL PURPOSE — FUN BLOCK: Suggest one enjoyable thing for the afternoon (music, a puzzle, sitting outside, time with Koda). Follow his lead — this call is about enjoyment, not tasks. ${TOUCHPOINT_TONE}` },
  { timeOfDay: "17:00", purpose: "health_check", title: "Health Check", sortOrder: 7, active: true,
    purposePrompt: `CALL PURPOSE — HEALTH CHECK: This is the one call for the day's health questions. Weave them in naturally, a few at most, one at a time — never rapid-fire. ${TOUCHPOINT_TONE}` },
  { timeOfDay: "18:00", purpose: "meds_evening", title: "Evening Medication", sortOrder: 8, active: true,
    purposePrompt: `CALL PURPOSE — EVENING MEDICATION: The second of the two medication calls. Gently confirm the evening dose, maybe with a light snack. Same rules as noon: kind, no arguing, note a refusal. ${TOUCHPOINT_TONE}` },
  { timeOfDay: "20:00", purpose: "journal", title: "Evening Journal", sortOrder: 9, active: true,
    purposePrompt: `CALL PURPOSE — JOURNAL: A reflective chat about the day. What was good? Anything on his mind? Listen more than you talk. ${TOUCHPOINT_TONE}` },
  { timeOfDay: "21:00", purpose: "sleep_check", title: "Sleep Check", sortOrder: 10, active: true,
    purposePrompt: `CALL PURPOSE — SLEEP CHECK: Wind-down. Doors locked, lights low, settled in. Wish him a good night, keep it soft and brief. ${TOUCHPOINT_TONE}` },
];

let touchpointsSchemaReady: Promise<void> | null = null;

/** Memoized create-and-seed (lazy-schema-init pattern — safe on fresh DBs). */
export function ensureTouchpointsSchema(): Promise<void> {
  touchpointsSchemaReady ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS touchpoints (
        id SERIAL PRIMARY KEY,
        time_of_day TEXT NOT NULL,
        purpose TEXT NOT NULL,
        title TEXT NOT NULL,
        purpose_prompt TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // Marker-guarded seed: runs once ever, so deleting or editing a
    // touchpoint later is a decision that sticks, not a fight with the seeder.
    const marker = await pool.query(
      `SELECT 1 FROM app_settings WHERE key = 'touchpoints_seed_done' LIMIT 1`
    );
    if ((marker.rowCount ?? 0) === 0) {
      for (const t of TOUCHPOINT_SEED) {
        await pool.query(
          `INSERT INTO touchpoints (time_of_day, purpose, title, purpose_prompt, active, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [t.timeOfDay, t.purpose, t.title, t.purposePrompt, t.active, t.sortOrder]
        );
      }
      await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('touchpoints_seed_done', $1)
         ON CONFLICT (key) DO NOTHING`,
        [new Date().toISOString()]
      );
      logger.info("Touchpoints seeded");
    }
  })().catch((err) => {
    touchpointsSchemaReady = null; // let a later call retry instead of caching the failure
    throw err;
  });
  return touchpointsSchemaReady;
}

function mapTouchpointRow(r: Record<string, unknown>): TouchpointRow {
  return {
    id: r["id"] as number,
    timeOfDay: r["time_of_day"] as string,
    purpose: r["purpose"] as string,
    title: r["title"] as string,
    purposePrompt: r["purpose_prompt"] as string,
    active: r["active"] as boolean,
    sortOrder: r["sort_order"] as number,
  };
}

export async function listTouchpoints(): Promise<TouchpointRow[]> {
  await ensureTouchpointsSchema();
  const { rows } = await pool.query(`SELECT * FROM touchpoints ORDER BY time_of_day, sort_order`);
  return rows.map(mapTouchpointRow);
}

export async function updateTouchpoint(
  id: number,
  patch: { timeOfDay?: string; title?: string; purposePrompt?: string; active?: boolean }
): Promise<TouchpointRow | null> {
  await ensureTouchpointsSchema();
  const { rows } = await pool.query(
    `UPDATE touchpoints SET
       time_of_day = COALESCE($2, time_of_day),
       title = COALESCE($3, title),
       purpose_prompt = COALESCE($4, purpose_prompt),
       active = COALESCE($5, active),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, patch.timeOfDay ?? null, patch.title ?? null, patch.purposePrompt ?? null, patch.active ?? null]
  );
  return rows[0] ? mapTouchpointRow(rows[0]) : null;
}

const touchpointsJob: CronJob = {
  name: "touchpoints",
  title: "Daily Touchpoint Calls",
  schedule: "Throughout the day, at each active touchpoint's time",
  intervalMs: null,
  placesCall: true,
  async run(now, opts) {
    // Same master switch as every other call-placing job. (Whether a call
    // dials Pops or the admin line is decided separately, inside
    // triggerOutboundCall's global test-mode guard.)
    const settings = await getSettings();
    if (!settings.dailyCallEnabled && !opts?.force) return { outcome: "skipped" };

    await ensureTouchpointsSchema();
    if (await quietWindowBlocks(now)) return { outcome: "skipped" };

    const due = (await listTouchpoints()).filter(
      (t) => t.active && isTimeOfDayDue(now, t.timeOfDay, 45)
    );
    if (due.length === 0) return { outcome: "skipped" };

    // At most ONE call per tick. If a restart lands with several windows open
    // at once, the rest fire on later ticks — never back-to-back calls.
    for (const t of due) {
      if (!(await claimForToday(`touchpoint_claim_${t.id}`, now.date, opts?.force))) continue;
      const result = await triggerOutboundCall({ extraContext: t.purposePrompt });
      if (!result.ok) {
        return { outcome: "error", detail: `${t.title} (${t.timeOfDay}) failed to start: ${result.error}${result.message ? ` — ${result.message}` : ""}` };
      }
      return { outcome: "ok", detail: `${t.title} (${t.timeOfDay}) call started (session ${result.sessionId})` };
    }
    return { outcome: "skipped" };
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
  elevenlabsConfigJob,
  quarterAdvanceJob,
  dayTypeResolveJob,
  scheduleResetJob,
  taskLadderSweepJob,
  wakeRetryJob,
  outOfBedJob,
  touchpointsJob,
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

/**
 * Starts the in-process scheduled-jobs runner. Call once at server startup.
 * Ensures its own log table, then runs an immediate tick before the first
 * 60s interval fires — otherwise a restart landing right on a trigger minute
 * (or shortly before it) could wait up to a minute before the first check,
 * on top of whatever the (now-widened) time-of-day windows already forgive.
 */
export function startCronScheduler(): void {
  void (async () => {
    await ensureCronLogTable();
    await ensureRoutineFoundationSchema();
    await ensureMorningSequenceSeed();
    await ensureTouchpointsSchema().catch((err) =>
      logger.error({ err }, "Failed to ensure touchpoints schema — touchpoint calls unavailable until a later retry")
    );
    await tick().catch((err) => logger.error({ err }, "Cron scheduler initial tick threw"));
    setInterval(() => {
      tick().catch((err) => logger.error({ err }, "Cron scheduler tick threw"));
    }, CHECK_INTERVAL_MS);
    logger.info({ jobs: CRON_JOBS.map((j) => j.name) }, "Cron scheduler started");
  })();
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
    /** Set when the streak is >= 2 — persists until a successful call breaks it. */
    missedCallStreakAlert: unknown | null;
    /** Set when ELEVENLABS_AGENT_ID or ELEVENLABS_PHONE_NUMBER_ID fails live validation. */
    elevenlabsConfig: unknown | null;
  };
}

export async function getCronStatus(): Promise<CronStatus> {
  const { rows } = await pool.query<{ job_name: string; ran_at: Date; outcome: JobOutcome; detail: string | null }>(
    `SELECT DISTINCT ON (job_name) job_name, ran_at, outcome, detail
     FROM cron_job_log ORDER BY job_name, ran_at DESC`
  );
  const byName = new Map(rows.map((r) => [r.job_name, r]));

  const [medRefusal, wellbeing, missedCall, haldol, streak, streakAlert, elevenlabsConfig] = await Promise.all([
    getJsonSetting<unknown | null>(KEY.medRefusalAlert, null),
    getJsonSetting<unknown | null>(KEY.wellbeingAlert, null),
    getJsonSetting<unknown | null>(KEY.missedCallToday, null),
    getJsonSetting<unknown | null>(KEY.haldolAlert, null),
    getSetting(KEY.missedCallStreak),
    getJsonSetting<unknown | null>(KEY.missedCallStreakAlert, null),
    getJsonSetting<unknown | null>(KEY.elevenlabsConfigAlert, null),
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
      missedCallStreakAlert: streakAlert,
      elevenlabsConfig,
    },
  };
}

/**
 * Ray acknowledging an alert. Med-refusal and wellbeing alerts record the
 * acknowledged row ids so the polling jobs don't immediately re-raise them.
 */
export async function acknowledgeAlert(kind: "med_refusal" | "wellbeing" | "missed_call" | "elevenlabs_config"): Promise<void> {
  if (kind === "missed_call") {
    await clearSetting(KEY.missedCallToday);
    return;
  }
  // NOTE: missed_call_streak is intentionally NOT user-dismissible — it clears
  // automatically only when missedCallJob confirms a successful call reached Pops.
  // This prevents Ray from dismissing a multi-day gap and forgetting about it
  // while calls continue to fail.
  if (kind === "elevenlabs_config") {
    // Ray has acknowledged the config issue. Clear the alert so it doesn't
    // keep firing — it will reappear tomorrow if the problem persists.
    await clearSetting(KEY.elevenlabsConfigAlert);
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
