---
name: DB migration via raw SQL
description: How to create new DB tables when drizzle-kit push hangs on interactive prompts
---

When adding new Drizzle tables, `drizzle-kit push` prompts interactively (arrow-key menu) to confirm whether tables are "create new" or "renamed from". This blocks in non-TTY environments.

**Workaround:** Run raw SQL directly via pg:
```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('CREATE TABLE IF NOT EXISTS my_table (id SERIAL PRIMARY KEY, ...)').then(() => { console.log('Done'); pool.end(); });
"
```

**Why:** The interactive TTY prompt cannot be bypassed with piped stdin in this environment.

**How to apply:** Any time you add a new pgTable() to the schema, use this raw SQL approach instead of drizzle-kit push.
