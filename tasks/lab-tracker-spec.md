# Spec — Blood-Work Tracker (lab_protocols / lab_phases / lab_draws)

**Status:** SHIPPED — schema in `lib/db/src/schema/index.ts`, 8 handlers in `routes/labs.ts` _(audited 2026-08-11)_
**Originally:** locked 2026-07-28 · Architect+Builder: Fable (tenant-scoped ⇒ not routed to cheap model per spec-first-routing)
**Driver:** clozapine monitoring — blood draws weekly, stepping down to biweekly.

## Goal

API + schema for tracking expected lab draws against a protocol whose cadence
changes over time. Two invariants the whole design serves:

1. **Drawn ≠ resulted.** Going to the lab and the result coming back are two
   separate completions with two separate timestamps and alert states. A result
   that never returns must stay visible.
2. **Overdue never auto-clears.** A missed draw resolves only by explicit human
   action (drawn / rescheduled / skipped-with-reason). It can never be absorbed
   by the next scheduled draw.

## Tables (lib/db/src/schema/index.ts + raw-SQL migration)

```
lab_protocols
  id            SERIAL PK
  tenant_id     TEXT NOT NULL DEFAULT 'local'
  label         TEXT NOT NULL                -- e.g. "clozapine ANC"
  active        BOOLEAN NOT NULL DEFAULT TRUE
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()

lab_phases                                   -- cadence = date-bounded rows, never a counter
  id            SERIAL PK
  protocol_id   INTEGER NOT NULL             -- FK lab_protocols.id
  interval_days INTEGER NOT NULL             -- 7, then a later row with 14
  effective_from DATE NOT NULL
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()

lab_draws
  id                 SERIAL PK
  tenant_id          TEXT NOT NULL DEFAULT 'local'
  protocol_id        INTEGER NOT NULL
  due_date           DATE NOT NULL           -- date, NOT timestamp (timezone drift moves draws by a day)
  window_days        INTEGER NOT NULL DEFAULT 2
  drawn_at           TIMESTAMP               -- completion 1
  result_received_at TIMESTAMP               -- completion 2
  status             TEXT NOT NULL DEFAULT 'pending'  -- pending | drawn | resulted | skipped | rescheduled
  reason             TEXT                    -- required for skip/reschedule
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
```

**Status is human-actioned state only.** due/overdue are *computed at read
time* from `due_date + window_days` vs today — never stored, so they can never
be stale and never auto-clear. Server returns a derived `alert` field:
`upcoming | due | overdue | awaiting_result | closed`.
`awaiting_result` = drawn but no result after `resultWaitDays` (default 7).

**Reschedule creates a new row** (old row → status `rescheduled` + reason; new
row carries the new due_date). Audit trail stays intact; nothing is mutated away.

**Draw generation is grid-based, not drift-based.** Due dates fall on
`effective_from + k * interval_days` of the phase active on that date. The
server maintains exactly ONE future `pending` draw per active protocol
(created on protocol create and on each resolving transition), always the next
grid point strictly after the latest existing draw's due_date. Actual drawn_at
never shifts the grid; a phase change (new lab_phases row) re-anchors it.

## Routes — artifacts/api-server/src/routes/labs.ts, CORE WORKSPACE tier

Registered in routes/index.ts under `coreRouter` (requireAnySession).
tenant_id derived exactly like inventory.ts:
`session?.type === "local" ? "local" : (session?.sub ?? "local")` — never from
client input. Every query filters by it; every insert sets it.

| Method/Path | operationId | Notes |
|---|---|---|
| GET  /labs/protocols | getLabProtocols | with current phase + next pending draw |
| POST /labs/protocols | createLabProtocol | body: label, intervalDays, effectiveFrom, windowDays? → creates protocol + first phase + first pending draw |
| POST /labs/protocols/:id/phases | addLabPhase | body: intervalDays, effectiveFrom → regenerates the future pending draw onto the new grid |
| GET  /labs/draws | getLabDraws | ?status&from&to; each row carries derived `alert` |
| POST /labs/draws/:id/drawn | markLabDrawDrawn | sets drawn_at + status, schedules next draw |
| POST /labs/draws/:id/resulted | markLabDrawResulted | sets result_received_at + status resulted |
| POST /labs/draws/:id/skip | skipLabDraw | reason REQUIRED (400 without), schedules next draw |
| POST /labs/draws/:id/reschedule | rescheduleLabDraw | dueDate + reason REQUIRED; old row → rescheduled, new row created |

Transition guards: drawn only from pending; resulted only from drawn; skip
only from pending; reschedule only from pending. Wrong state → 409.
:id lookups always `AND tenant_id = <derived>` — cross-tenant probing 404s.

**Every transition writes a care_events row** (existing careEventsTable):
source `labs`, actor `caregiver`, event_type `lab_protocol_created |
lab_phase_added | lab_draw_scheduled | lab_draw_drawn | lab_draw_resulted |
lab_draw_skipped | lab_draw_rescheduled`, tenant_id derived, payload JSON with
ids/dates. Verifiable by query like everything else.

## Files touched

1. `lib/db/src/schema/index.ts` — 3 tables + insert schemas + types (drizzle-zod pattern, `zod/v4`)
2. `lib/api-spec/openapi.yaml` — 8 operations above + Lab* components
3. `artifacts/api-server/src/routes/labs.ts` — new
4. `artifacts/api-server/src/routes/index.ts` — import + `coreRouter.use(labsRouter)`
5. `scripts/src/create-lab-tables.ts` — raw SQL via `@workspace/db` pool (drizzle-kit push hangs — house gotcha #1); also `CREATE TABLE IF NOT EXISTS care_events` (same SQL as hermes.ts) so fresh DBs don't 500

## Edge cases (enumerated)

- Phase change mid-stream: pending draw beyond the new effective_from is
  regenerated onto the new grid; a pending draw before it is untouched.
- Two phases same effective_from: latest created_at wins (deterministic ORDER BY).
- Protocol deactivated: no new draws generated; existing pending draws keep
  alerting (deactivation is not permission to forget an overdue draw) — they
  must be resolved or skipped explicitly.
- Skip does NOT count as coverage: next draw is still the next grid point, not
  grid-point-after-next.
- `effective_from`/`due_date` handled as plain `YYYY-MM-DD` strings end to end.

## Out of scope (this ticket)

- Frontend (PopsView silent-until-window surfacing, admin tab) — follow-up ticket
- Jessica reminder register (gemini.ts prompt wiring) — follow-up; she gets
  "a draw is due" only, never results or dosing
- Native phone reminder backstop — Ray sets manually until Replit unthrottles
- Result *values* (ANC counts) — deliberately not stored; this tracks the loop,
  clinical values live with the clinic

## Acceptance criteria

- [ ] Typecheck clean from repo root (`pnpm run typecheck`)
- [ ] Codegen clean (openapi → orval → api-client-react declarations rebuilt)
- [ ] All queries tenant-scoped from `req.tenantSession`, zero client-supplied tenant ids
- [ ] Transition guards return 409 on wrong-state, 400 on missing reason
- [ ] skip/reschedule impossible without a reason
- [ ] No generated files hand-edited; `zod/v4` in new files
- [ ] care_events rows written on every transition with tenant_id
```
