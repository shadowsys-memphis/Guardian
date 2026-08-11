---
name: Hermes adapter + careEventsTable
description: careEventsTable was added to hermes.ts by a task agent but the schema export was missing — pattern for how to fix this class of build failure.
---

# Hermes Adapter & careEventsTable

## The rule
When a task agent adds a new Drizzle table import to any file but forgets to define it in `lib/db/src/schema/index.ts`, the API server build will fail with:
`No matching export in "../../lib/db/src/index.ts" for import "xyzTable"`

## How to fix
Add the missing `pgTable(...)` definition to `lib/db/src/schema/index.ts`, plus a lazy `CREATE TABLE IF NOT EXISTS` (called before the first DB write) if the table isn't covered by the main migration path yet.

**Why:** `lib/db/src/index.ts` does `export * from "./schema"` — so any table referenced elsewhere must be defined there, or the build fails on a missing export. The schema file is the single source of truth; a table introduced only in a consuming file (not the schema) is the specific mistake this error means.
