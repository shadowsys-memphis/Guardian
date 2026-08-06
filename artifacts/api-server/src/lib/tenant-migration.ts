import { pool } from "@workspace/db";
import { logger } from "./logger";

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
