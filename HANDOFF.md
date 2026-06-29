# br(AI)n — Task Handoff Package
**Project:** Medication-cycle-aware caregiving companion for Pops (PTSD, Schizophrenia, Auditory Hallucinations) and caregiver Ray.
**Stack:** pnpm monorepo · TypeScript 5.9 · Express 5 · PostgreSQL + Drizzle ORM · React + Vite · TailwindCSS · Framer Motion · Gemini AI · Orval codegen
**Three views:** `/pops` (Pops' display) · `/admin` (Ray's control panel) · `/jessica` (AI phone gateway)
**Date:** June 29, 2026

---

## IMMEDIATE — Crypto/Vault/Intercom Removal
**Status:** IN PROGRESS — 5 files deleted, 4 file edits still needed.

### What
Remove the unintended crypto/vault/intercom subsystem. This caregiving build should not include passphrase gating, AES encryption, or encrypted messaging.

### Files DELETED (done)
| File | What it contained |
|------|------------------|
| `artifacts/brain-app/src/lib/crypto.ts` | AES-256-GCM + PBKDF2 primitives |
| `artifacts/brain-app/src/lib/vault-context.tsx` | VaultProvider / useVault context |
| `artifacts/brain-app/src/pages/vault-gate.tsx` | Passphrase lock screen |
| `artifacts/brain-app/src/pages/intercom.tsx` | E2EE encrypted family intercom UI |
| `artifacts/api-server/src/routes/intercom.ts` | GET/POST `/intercom/messages` routes |

### Files still needing edits
**`artifacts/brain-app/src/App.tsx`**
- Remove imports: `IntercomView`, `VaultGate`, `VaultProvider`, `useVault`, `MessageSquare`, `Lock`
- Remove `/intercom` from `NAV_ITEMS`
- Remove `useVault()` call and Lock button from `BottomNav`
- Remove `VaultGate` guard from `AppContent` — app loads directly, no passphrase
- Remove `<Route path="/intercom">` from Switch
- Remove `<VaultProvider>` wrapper from `App`

**`artifacts/api-server/src/routes/index.ts`**
- Remove `import intercomRouter from "./intercom"`
- Remove `router.use(intercomRouter)`

**`lib/db/src/schema/index.ts`**
- Remove `intercomeMessagesTable` pgTable definition (lines 72–79)
- Remove `insertIntercomMessageSchema` (line 97)
- Remove `IntercomMessage` type export (line 100)
- Remove `InsertIntercomMessage` type export (line 102)

**`lib/api-spec/openapi.yaml`**
- Remove `intercom` tag entry (lines 26–27)
- Remove `/intercom/messages` path block (lines 473–509)
- Remove `IntercomMessage` schema block (lines 1366–1388)
- Remove `CreateIntercomMessageInput` schema block (lines 1389–1404)

---

## TASK #1 — Pastel Color Scheme
**Status:** PROPOSED · Tracker: #1

### What & Why
Replace the current dark high-contrast theme with softer colors. Pastel green (primary), light rose (destructive/alert), off-white (background). Softer palette is less stimulating for Pops who manages PTSD and hallucinations.

### Done looks like
- `tailwind.config.ts` + `src/index.css` updated with new CSS custom property values
- All three views look correct with the new palette
- No hardcoded hex values in component files — all reference CSS variables
- Doctor Report print layout unaffected (uses `print:` Tailwind variants)

### Relevant files
- `artifacts/brain-app/tailwind.config.ts`
- `artifacts/brain-app/src/index.css`
- All pages under `artifacts/brain-app/src/pages/`

---

## TASK #5 — SEO Scan
**Status:** AWAITING INPUT · Tracker: #5

### Blocked on
Needs clarification: is this app public-facing or private? Is social/OG sharing wanted? Which views (if any) should be indexed by search engines?

### Relevant files
- `artifacts/brain-app/index.html`
- `artifacts/brain-app/src/pages/*.tsx` (page-level meta)

---

## TASK #9 — AI Agent Init Files
**Status:** PENDING · Tracker: #9

### What & Why
Create three project-context files — one per major AI coding assistant — so Claude Code, Gemini Code Assist, and OpenAI Codex can immediately understand the codebase without manual onboarding. Content sourced from a real codebase audit.

### Output files
| File | For | Format |
|------|-----|--------|
| `.claude/CLAUDE.md` | Claude Code | Detailed — full schema + API reference, codegen workflow, gotchas |
| `.gemini/GEMINI.md` | Gemini Code Assist | Same core + Gemini AI integration architecture + Jessica pipeline |
| `.codex/AGENTS.md` | OpenAI Codex | Compact — pnpm filter commands, env vars, prohibited actions |

### Each file must cover
- Project mission + three-view architecture
- Full monorepo structure (packages, artifacts, libs)
- All DB tables with key columns
- All API endpoints grouped by domain (operationIds + paths)
- Codegen: `cd lib/api-spec && npx orval` → `cd lib/api-client-react && npx tsc --build --force`
- Dev commands: `pnpm --filter @workspace/<pkg> run dev`
- Gotchas: use `zod/v4` not `zod`, `PORT` env var (no hardcoded ports), no direct `.replit` edits
- Env vars: `DATABASE_URL`, `GEMINI_API_KEY`, `LM_STUDIO_URL` (optional)

### Note
Run after #10 so init files reflect the LM Studio integration.

### Relevant files
`replit.md` · `pnpm-workspace.yaml` · `lib/db/src/schema/index.ts` · `lib/api-spec/openapi.yaml` · `artifacts/api-server/src/routes/index.ts` · `artifacts/brain-app/src/App.tsx`

---

## TASK #10 — Local LM Studio Models
**Status:** PENDING · Tracker: #10

### What & Why
Let Ray switch Jessica's AI brain from Gemini to one of three local LM Studio models without touching code. LM Studio exposes an OpenAI-compatible REST API (`/v1/chat/completions`), so it slots in as a clean adapter alongside the existing Gemini path.

### Models
| Label | LM Studio ID | Format | Size |
|-------|-------------|--------|------|
| Qwen3.5 9B | `qwen3_5` | 4bit MLX | 5.57 GB |
| Gemma 4 12B | `gemma4` | Q6_K GGUF | 9.28 GB |
| Gemma 4 E4B | `gemma4` | 4bit MLX | 6.39 GB |

### Done looks like
- Admin panel has an "AI Brain" card: 4 buttons (Gemini · Qwen3.5 9B · Gemma 4 12B · Gemma 4 E4B)
- Selection saves to `app_settings` table (`key: active_ai_model`)
- Jessica phone page shows a small badge with the active model name
- LM Studio unreachable → clear error message, not a silent crash
- `LM_STUDIO_URL` env var sets base URL (default `http://localhost:1234`)

### Steps
1. **Model config** — Add `LM_STUDIO_URL` env var. Seed `active_ai_model = "gemini"` in `app_settings`. Define model registry constant.
2. **LM Studio adapter** — Module in `artifacts/api-server/src/routes/` calling `POST {LM_STUDIO_URL}/v1/chat/completions` with OpenAI message format. Reuses existing `parseHealthDataTags` / `parseCravingTag` XML helpers.
3. **Unified message handler** — In `gemini.ts` `POST /gemini/conversations/:id/messages`: read `active_ai_model` at request time, branch to Gemini or LM Studio. Same post-processing either way.
4. **Admin model selector** — "AI Brain" card in Admin with 4 option buttons. New `PUT /api/ai-model` endpoint saves selection.
5. **Jessica badge** — Small model-name badge in Jessica phone page header.

### Key constraint
LM Studio runs locally. For the deployed Replit app, Ray must tunnel it (e.g. ngrok) and set `LM_STUDIO_URL`.

### Relevant files
`artifacts/api-server/src/routes/gemini.ts` · `artifacts/api-server/src/routes/health-assessment.ts` · `artifacts/api-server/src/routes/index.ts` · `artifacts/brain-app/src/pages/jessica-phone.tsx` · `artifacts/brain-app/src/pages/admin-view.tsx` · `lib/db/src/schema/index.ts` · `lib/api-spec/openapi.yaml`

---

## Suggested execution order
1. **Crypto/Vault/Intercom removal** — in progress, 4 file edits remaining
2. **#10 LM Studio** — depends on clean routes/index.ts
3. **#9 AI agent init files** — run after #10 so LM Studio is reflected
4. **#1 Color scheme** — purely visual, no code dependencies, can run anytime
5. **#5 SEO scan** — blocked on your input
