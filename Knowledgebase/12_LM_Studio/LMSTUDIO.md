# AI Assistant Guidelines (Claude / Gemini / Codex / LM Studio)

This file provides guidance to AI assistants (Claude Code, Gemini, Codex, LM Studio local models) when working with code in this repository.

## What this is

`CareGiving/` is a container holding **two generations of the same product** — a caregiver AI system for a Veteran ("Pops") living with PTSD, schizophrenia, and auditory hallucinations. Raymo (the user) is the VA caregiver and developer. The two projects are independent git repositories; `CareGiving/` itself is not a repo.

| Dir | Status | Stack | Role |
|-----|--------|-------|------|
| `Br[AI]n/` | Current / legacy running app | Plain JS/JSX React 18 + Vite (`pops-tracker` v1.0) | The app in active daily use, plus auxiliary Python/Node subsystems |
| `Guardian-OS/` | Newer rewrite ("br(AI)n App") | pnpm monorepo, TypeScript, React 19 + Express 5 + Drizzle/Postgres | Clean re-architecture of the same product into a 3-part system |

When making changes, confirm which project you're in — they share a domain but share **no code**. The directory name contains literal brackets (`Br[AI]n`), which are shell-glob characters; always quote the path.

## Domain glossary (applies to both projects)

- **Pops** — the Veteran/patient; the app's passive display is built for him (large text, zero interaction).
- **Raymo** — caregiver + developer; uses the admin/command-center side.
- **Jessica** — the phone/voice gateway persona; reads scripts to Pops over the phone.
- **Haldol cycle** — a 14-day antipsychotic injection cycle the app tracks; cycle day drives UI state.
- **Zombie Mode** — days 1–5 of the Haldol cycle (heavy sedation); UI shows a banner and reduces expectations.
- **Quarters** — the day split into Q1 0600–1200, Q2 1200–1800, Q3 1800–2200, Q4 2200–0600.

---

## Guardian-OS (the rewrite)

pnpm workspace monorepo, Node 24, TypeScript 5.9 composite projects. This is the maintained architecture; prefer it for new work unless the task is specifically about the legacy app.

### Commands (run from `Guardian-OS/`)
```bash
pnpm install
pnpm run typecheck          # ALWAYS typecheck from root — composite project refs
pnpm run build              # typecheck + recursive package builds
pnpm --filter @workspace/api-spec run codegen   # regenerate Zod + React Query from OpenAPI
pnpm --filter @workspace/db run push            # push Drizzle schema to Postgres
pnpm --filter @workspace/scripts run seed       # seed schedule tasks, voice scripts, Haldol cycle
pnpm --filter @workspace/api-server run dev      # build + start Express API
pnpm --filter @workspace/brain-app run dev       # Vite frontend (host 0.0.0.0)
```

### Architecture
A **spec-first, codegen-driven** flow: the OpenAPI spec in `lib/api-spec/` is the source of truth. Orval generates `lib/api-zod/` (Zod schemas) and `lib/api-client-react/` (React Query hooks) from it. **Do not hand-edit generated packages** — change the spec and re-run codegen.

```
artifacts/
  api-server/    Express 5 API (esbuild → dist/index.mjs), Drizzle ORM, pino logging
  brain-app/     React 19 + Vite frontend, Radix UI, Tailwind v4, wouter routing
  mockup-sandbox/ design/prototyping sandbox
lib/
  api-spec/      OpenAPI spec + Orval config  ← source of truth
  api-zod/       generated Zod schemas
  api-client-react/ generated React Query hooks
  db/            Drizzle schema + connection
  integrations*/ Gemini AI integration
scripts/         seed.ts and utilities
```

The frontend serves three views from one app: `/` or `/pops` (passive patient display), `/admin` (Raymo's command center — schedule editor, symptom log, script patcher, Haldol tracker), `/jessica` (voice-script manifest display, feeds the phone system via `GET /api/scripts/active`).

DB tables: `app_state` (single live row), `schedule_tasks`, `symptom_logs`, `voice_scripts`, `haldol_cycle`. See `replit.md` for the full API endpoint table and table fields.

### TypeScript notes
Every package extends `tsconfig.base.json` (`composite: true`); root `tsconfig.json` lists all packages as project references. Typecheck emits `.d.ts` only (`emitDeclarationOnly`). pnpm is enforced via a `preinstall` guard — npm/yarn will be rejected.

---

## Br[AI]n (the legacy/running app)

Single-page React 18 + Vite app (`package.json` name is `pops-tracker`). Source is a **mix of `.jsx`, `.tsx`, and `.ts`** with `.backup` and `.miami` (old "Miami Vice" theme) files left in `src/` — the live entry is `src/App.jsx` via `src/main.jsx`.

### Commands (run from `Br[AI]n/`)
```bash
npm install
npm run dev      # Vite dev server, port 3000
npm run build    # vite build → dist/
npm run preview
```
No test or lint scripts are defined.

### App structure
- `src/App.jsx` — main component; tabbed UI (ROUTINES, etc.), Haldol cycle phase + Zombie Mode logic.
- `src/hooks/` — context providers: `useTaskContext`, `useCycleContext` (Haldol cycle), `useAlarmSystem`. Note duplicate `.jsx`/`.ts` versions exist; the app imports the `.jsx` ones.
- `src/components/` — includes `CaregiverPanel`, `MedJournal`, `BrainPuzzleModal`, and a `shopper/` dashboard.
- `src/utils/haldolService`, `dateService`, `soundService`, `celebrations` — domain + UX services.
- `src/config/firebase.js` — Firebase config.

### Auxiliary subsystems (gitignored, separate from the React app)
These are part of Raymo's broader caregiver tooling and are **excluded from git** (see `.gitignore`):
- `external_systems/state-server.js` — local state server the app talks to.
- `phone_system/` — "Shadow Voice": Docker/Node voice gateway (3CX + ElevenLabs + Claude API) that reads scripts. See `phone_system/README.md`.
- `governor/` — Python agent (`governor.py`, `shopper_agent.py`) using Gemini + Perplexity.
- `brain-scheduler/` — Node scheduler (`index.cjs` / `index.js`).

Runtime state lives in gitignored JSON files (`BRAIN.json`, `pops-state.json`, `cart-history.json`, `pantry-state.json`, etc.). `DEBT.md` is an emotional/technical debt journal, not a task list.

---

## Cautions

- This codebase manages real medical scheduling and medication tracking for a vulnerable person. Treat Haldol-cycle, Zombie-Mode, and schedule/symptom logic as safety-relevant — verify date math and state transitions carefully.
- `Br[AI]n/.env`, `governor/governor.py`, and various JSON files contain live API keys and personal data; do not commit, log, or transmit them.

---

## BrAInGuardian Brain Map (Start Here)

Full architecture, phase plan, and session context lives in the Obsidian vault:

`/Users/memphis/Desktop/CareGiving/Br[AI]n_Guardian_OS/BrAInGuardian/`

Read `Index.md` first, then `Phase Plan.md` to know where we are.
