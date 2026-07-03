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
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        plan TEXT NOT NULL DEFAULT 'family',
        status TEXT NOT NULL DEFAULT 'pending_checkout',
        passphrase_hash TEXT,
        setup_token_hash TEXT,
        setup_token_pending TEXT,
        setup_completed_at TIMESTAMP,
        trial_ends_at TIMESTAMP,
        current_period_end TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS setup_token_hash TEXT`);
    await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS setup_token_pending TEXT`);

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

    await pool.query(`
      CREATE INDEX IF NOT EXISTS tenants_stripe_sub_idx
      ON tenants (stripe_subscription_id)
      WHERE stripe_subscription_id IS NOT NULL
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants (status)`);

    // ── inventory_items — ensure table exists with tenant_id from the start ──
    // The original app created this table lazily in ensureInventorySeeded().
    // We take ownership here so tenant_id is part of the schema from creation.
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
    // Uses DO blocks so the migration is idempotent on both fresh and existing DBs.
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

    logger.info("Tenant migration complete");
  } catch (err) {
    logger.error({ err }, "Tenant migration failed");
    throw err;
  }
}
