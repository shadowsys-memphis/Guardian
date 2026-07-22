---
name: Hermes adapter + careEventsTable
description: careEventsTable was added to hermes.ts by a task agent but the schema export was missing — pattern for how to fix this class of build failure.
---

# Hermes Adapter & careEventsTable

## The rule
When a task agent adds a new Drizzle table import to any file but forgets to define it in `lib/db/src/schema/index.ts`, the API server build will fail with:
`No matching export in "../../lib/db/src/index.ts" for import "xyzTable"`

## How to fix
1. Add the `pgTable(...)` definition to `lib/db/src/schema/index.ts` (end of file)
2. Add a lazy `CREATE TABLE IF NOT EXISTS` in the consuming file (or a shared migration helper)
3. Call the lazy migration before the first DB write

**Why:** `lib/db/src/index.ts` does `export * from "./schema"` — so any table in the schema is automatically available. The schema is the single source of truth.

## Hermes architecture
`artifacts/api-server/src/lib/hermes.ts` is the event dispatch + evidence ledger layer.
- `dispatch(action, ctx)` routes Jessica ACTION blocks to subsystems
- `writeLedger(action, ctx, outcome)` records every event to `care_events`
- `care_events` table: tenant_id, source, actor, event_type, session_id, severity, confidence, payload (JSON), outcome, doctor_relevant, learning_relevant
- Ledger writes are non-fatal (catch + warn) so dispatch failures never break a call
