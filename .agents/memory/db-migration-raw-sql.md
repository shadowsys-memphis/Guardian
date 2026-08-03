---
name: DB migration via raw SQL
description: How to create new DB tables when drizzle-kit push hangs on interactive prompts — and where migrations actually live in this project.
---

When adding new Drizzle tables, `drizzle-kit push` prompts interactively (arrow-key menu) to confirm whether tables are "create new" or "renamed from". This blocks in non-TTY environments.

**Workaround for one-off / exploratory changes against the current dev DB:** Run raw SQL directly via pg:
```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('CREATE TABLE IF NOT EXISTS my_table (id SERIAL PRIMARY KEY, ...)').then(() => { console.log('Done'); pool.end(); });
"
```

**For anything that must survive a fresh deploy or a reset database:** this project's real migration mechanism is `artifacts/api-server/src/lib/tenant-migration.ts` (`runTenantMigration()`, called at startup from `index.ts`) — a sequence of idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements, not a `migrations/` folder or `.sql` files anywhere else in the repo.

**Why:** The interactive TTY prompt cannot be bypassed with piped stdin in this environment, so ad-hoc raw SQL against the live DB is how schema changes get made day-to-day — but only what's also added to tenant-migration.ts will exist on a fresh database or after a reset. Wrongly assuming "no migrations directory" means "no migration mechanism" leads to false reports of missing migrations.

**How to apply:** Any time you add a new pgTable() or column to the schema: (1) apply it to the current dev DB with the raw SQL workaround above so the running app keeps working, AND (2) add the same idempotent statement to tenant-migration.ts so it survives fresh deploys/resets. Before reporting a table/column as having "no migration," check tenant-migration.ts first.
