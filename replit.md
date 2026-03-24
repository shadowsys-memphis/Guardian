# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This is the **br(AI)n App** — a three-part unified caregiver AI system for a Veteran (Pops) dealing with PTSD, Schizophrenia, and Auditory Hallucinations. Raymo is the VA caregiver/developer.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, TailwindCSS, Framer Motion

## Three-Part System

### 1. Client Side (Pops' Display) — `/pops`
- Zero-touch passive display for Pops
- Navy/Gold high-contrast military aesthetic, large text
- Shows 4 Quarters (Q1: 0600-1200, Q2: 1200-1800, Q3: 1800-2200, Q4: 2200-0600)
- 14-day Haldol cycle progress bar
- **Zombie Mode** banner when `isZombiePhase=true` (Days 1-5 of cycle)
- Auto-refreshes every 30 seconds
- No interaction required from Pops

### 2. Admin Side (Raymo's Command Center) — `/admin`
- Full monitoring dashboard for Raymo
- Tabs: Dashboard, Schedule Editor, Symptom Log, Voice Scripts (Script Patcher), Haldol Tracker
- Can change current quarter, trigger Zombie Mode, broadcast messages to Pops' display
- Full CRUD on schedule tasks including voice scripts per task
- Symptom logger: PTSD triggers, hallucination intensity (0-5), motivation level (1-5)
- Script Patcher: live edit Jessica's voice scripts with patch notes and tone control

### 3. Phone/Voice Gateway (Jessica) — `/jessica`
- Terminal-style display of active script manifest
- Shows all scripts by trigger key, tone, and full script text
- Last patch timestamp tracking
- API endpoint `/api/scripts/active` feeds the phone system

## Routes

- `/` or `/pops` — Pops' display
- `/admin` — Raymo's command center
- `/jessica` — Jessica phone gateway display

## API Endpoints (at `/api`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/state | Current app state |
| PUT | /api/state | Update state (quarter, zombie mode, motivation, message) |
| GET | /api/schedule | All schedule tasks (Q1-Q4) |
| POST | /api/schedule | Create task |
| PUT | /api/schedule/:id | Update task |
| DELETE | /api/schedule/:id | Delete task |
| POST | /api/schedule/:id/complete | Mark task complete |
| GET | /api/symptoms | Symptom logs (most recent first) |
| POST | /api/symptoms | Log symptom/behavior |
| GET | /api/scripts | All voice scripts |
| POST | /api/scripts | Create script |
| PUT | /api/scripts/:id | Update/patch script |
| DELETE | /api/scripts/:id | Delete script |
| GET | /api/scripts/active | Active scripts (for phone system) |
| GET | /api/haldol | Current Haldol 14-day cycle |
| PUT | /api/haldol | Update injection date/notes |

## Database Tables

- `app_state` — Single-row live state (quarter, zombie mode, motivation, active message)
- `schedule_tasks` — Daily tasks by quarter with voice scripts
- `symptom_logs` — Logged PTSD triggers, hallucination intensity, behavior notes
- `voice_scripts` — Jessica's scripts by task key with tone and patch history
- `haldol_cycle` — Last injection date (cycle day computed on read)

## Seed Data

Run `pnpm --filter @workspace/scripts run seed` to seed initial schedule tasks, voice scripts, and Haldol cycle.

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── brain-app/          # React + Vite frontend (3 views)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (seed.ts)
└── ...
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- `emitDeclarationOnly` — we only emit `.d.ts` files during typecheck
- Run codegen: `pnpm --filter @workspace/api-spec run codegen`
- Push DB schema: `pnpm --filter @workspace/db run push`
