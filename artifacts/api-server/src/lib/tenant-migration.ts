import { pool, db } from "@workspace/db";
import { scheduleTasksTable, symptomLogsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { DEMO_TENANT_ID } from "./demo-tenant";

// ── Demo workspace sample data ──────────────────────────────────────────────
// Realistic but clearly fictional — never Ray/Pops' real schedule or history.
// timeLabel is raw 24h "HHMM" (no colon), matching every other schedule_tasks row.
const DEMO_SCHEDULE_TASKS = [
  { quarter: "Q1", timeLabel: "0700", title: "Morning Medication", description: "Take morning medication with breakfast.", order: 1, isCompleted: true },
  { quarter: "Q1", timeLabel: "0800", title: "Breakfast", description: "Oatmeal and fruit — a favorite.", order: 2, isCompleted: true },
  { quarter: "Q2", timeLabel: "1000", title: "Morning Walk", description: "Short walk around the block, weather permitting.", order: 3, isCompleted: false },
  { quarter: "Q2", timeLabel: "1200", title: "Lunch", description: "Sandwich and soup.", order: 1, isCompleted: true },
  { quarter: "Q2", timeLabel: "1400", title: "Afternoon Check-in", description: "Quick call just to chat and see how the day's going.", order: 2, isCompleted: false },
  { quarter: "Q2", timeLabel: "1600", title: "Hobby Time", description: "Puzzles or music, whatever sounds good today.", order: 3, isCompleted: false },
  { quarter: "Q3", timeLabel: "1800", title: "Dinner", description: "Balanced plate, easy on the spice.", order: 1, isCompleted: false },
  { quarter: "Q3", timeLabel: "1930", title: "Evening Medication", description: "Evening dose with a light snack.", order: 2, isCompleted: false },
  { quarter: "Q3", timeLabel: "2100", title: "Wind Down", description: "TV or reading, lights dimmed low.", order: 3, isCompleted: false },
  { quarter: "Q4", timeLabel: "2200", title: "Bedtime Check-in", description: "Doors locked, lights off, settled in for the night.", order: 1, isCompleted: false },
] as const;

// Offsets (days ago, hour) are computed at seed time so the demo always looks
// like a recent, lived-in log rather than a fixed historical date.
const DEMO_SYMPTOM_LOGS = [
  { daysAgo: 5, hour: 8, ptsdTrigger: false, hallucinationIntensity: 1, motivationLevel: 4, behaviorNotes: "Calm morning, ate a full breakfast, chatted about the game on TV." },
  { daysAgo: 4, hour: 19, ptsdTrigger: true, hallucinationIntensity: 2, motivationLevel: 3, behaviorNotes: "A loud truck outside startled him; settled down after a few minutes of music." },
  { daysAgo: 3, hour: 9, ptsdTrigger: false, hallucinationIntensity: 0, motivationLevel: 5, behaviorNotes: "Great mood — asked to go for an extra walk after lunch." },
  { daysAgo: 2, hour: 18, ptsdTrigger: false, hallucinationIntensity: 3, motivationLevel: 2, behaviorNotes: "Mentioned hearing voices during dinner; redirected with a favorite show." },
  { daysAgo: 1, hour: 8, ptsdTrigger: false, hallucinationIntensity: 1, motivationLevel: 4, behaviorNotes: "Slept well, in good spirits at breakfast." },
  { daysAgo: 0, hour: 7, ptsdTrigger: false, hallucinationIntensity: 0, motivationLevel: 4, behaviorNotes: "Easy morning, medication taken on time." },
] as const;

async function seedDemoWorkspaceData(): Promise<void> {
  const existingSchedule = await db
    .select({ id: scheduleTasksTable.id })
    .from(scheduleTasksTable)
    .where(eq(scheduleTasksTable.tenantId, DEMO_TENANT_ID))
    .limit(1);
  if (existingSchedule.length === 0) {
    await db.insert(scheduleTasksTable).values(
      DEMO_SCHEDULE_TASKS.map((t) => ({
        tenantId: DEMO_TENANT_ID,
        quarter: t.quarter,
        timeLabel: t.timeLabel,
        title: t.title,
        description: t.description,
        order: t.order,
        isActive: true,
        isCompleted: t.isCompleted,
        completedAt: t.isCompleted ? new Date() : null,
      }))
    );
  }

  const existingSymptoms = await db
    .select({ id: symptomLogsTable.id })
    .from(symptomLogsTable)
    .where(eq(symptomLogsTable.tenantId, DEMO_TENANT_ID))
    .limit(1);
  if (existingSymptoms.length === 0) {
    await db.insert(symptomLogsTable).values(
      DEMO_SYMPTOM_LOGS.map((l) => {
        const loggedAt = new Date();
        loggedAt.setDate(loggedAt.getDate() - l.daysAgo);
        loggedAt.setHours(l.hour, 0, 0, 0);
        return {
          tenantId: DEMO_TENANT_ID,
          loggedAt,
          ptsdTrigger: l.ptsdTrigger,
          hallucinationIntensity: l.hallucinationIntensity,
          motivationLevel: l.motivationLevel,
          behaviorNotes: l.behaviorNotes,
          loggedBy: "Demo Caregiver",
        };
      })
    );
  }
}

export async function runTenantMigration(): Promise<void> {
  try {
    // ── Tenants table ────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'family',
        status TEXT NOT NULL DEFAULT 'active',
        passphrase_hash TEXT,
        setup_completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // ── Drop Stripe-specific columns if they exist from earlier migrations ───
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE tenants DROP COLUMN IF EXISTS stripe_customer_id;
        ALTER TABLE tenants DROP COLUMN IF EXISTS stripe_subscription_id;
        ALTER TABLE tenants DROP COLUMN IF EXISTS setup_token_hash;
        ALTER TABLE tenants DROP COLUMN IF EXISTS setup_token_pending;
        ALTER TABLE tenants DROP COLUMN IF EXISTS trial_ends_at;
        ALTER TABLE tenants DROP COLUMN IF EXISTS current_period_end;
      END $$
    `);

    // Drop legacy plaintext setup_token if it exists from an earlier migration run
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tenants' AND column_name = 'setup_token'
        ) THEN
          ALTER TABLE tenants DROP COLUMN setup_token;
        END IF;
      END $$
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants (status)`);

    // ── session_version — bumping this invalidates all outstanding JWTs for a
    //    tenant (or for the local workspace, via app_settings) without waiting
    //    for their 24h natural expiry. Checked on every request in tenant-auth.ts.
    await pool.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1
    `);

    // ── inventory_items — ensure table exists with tenant_id from the start ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id SERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'local',
        item_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'food',
        replenishment_cycle TEXT NOT NULL DEFAULT 'weekly',
        last_restocked_date DATE,
        estimated_run_out_date DATE,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // ── Add tenant_id to existing tables that may already be present ─────────
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_state') THEN
          ALTER TABLE app_state ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'local';
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedule_tasks') THEN
          ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'local';
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'symptom_logs') THEN
          ALTER TABLE symptom_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'local';
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_items') THEN
          ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'local';
        END IF;
      END $$
    `);

    // ── Demo workspace — a fixed, publicly-reachable tenant with no passphrase
    //    (see routes/tenants.ts POST /tenants/demo). Created once; inventory
    //    seeds itself lazily via ensureInventorySeeded() on first request like
    //    it does for every tenant, so only schedule/symptoms need seeding here.
    await pool.query(
      `INSERT INTO tenants (id, name, email, plan, status, setup_completed_at)
       VALUES ($1, 'Demo Workspace', 'demo@brain-app.invalid', 'demo', 'active', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_TENANT_ID]
    );
    await seedDemoWorkspaceData();

    // ── call_sessions — add elevenlabs_conversation_id if not yet present ─────
    await pool.query(`
      ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS elevenlabs_conversation_id TEXT
    `);

    // ── call_sessions — full call transcript, saved when the call ends ────────
    await pool.query(`
      ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS transcript TEXT
    `);

    // ── call_sessions — was Pops actually reached, not just dialed? ──────────
    // Historical rows default true (nothing to retroactively flag); new
    // outbound-call rows explicitly pass reached: false at creation and the
    // ElevenLabs webhook flips it true once the transcript shows Pops spoke.
    await pool.query(`
      ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS reached BOOLEAN NOT NULL DEFAULT true
    `);

    // ── haldol_cycle — dosing interval is prescriber-set, not a constant ─────
    // Pops moved from biweekly to monthly on 2026-07-28; hardcoding 14 made
    // every cycle-day, zombie-phase and overdue figure in the app wrong.
    // zombie_phase_days is the post-injection high-symptom window, which also
    // shifts with dose/interval changes — tuned from observation, not guessed.
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'haldol_cycle') THEN
          ALTER TABLE haldol_cycle ADD COLUMN IF NOT EXISTS interval_days INTEGER NOT NULL DEFAULT 28;
          ALTER TABLE haldol_cycle ADD COLUMN IF NOT EXISTS zombie_phase_days INTEGER NOT NULL DEFAULT 5;
        END IF;
      END $$
    `);

    // ── cron_job_log — one row per scheduled-job execution (see lib/call-scheduler.ts) ──
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

    logger.info("Tenant migration complete");
  } catch (err) {
    logger.error({ err }, "Tenant migration failed");
    throw err;
  }
}
