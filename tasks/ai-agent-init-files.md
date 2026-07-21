# AI Agent Init Files

## What & Why
Create three separate, comprehensive project-context files — one for each major AI coding assistant (Claude Code, Gemini Code Assist, OpenAI Codex) — so any of them can immediately understand the br(AI)n codebase without manual onboarding. Each file lives in its own directory (`.claude/CLAUDE.md`, `.gemini/GEMINI.md`, `.codex/AGENTS.md`) and is tuned to that assistant's conventions and reading format. The content is sourced from a thorough audit of the real codebase — schema, routes, patterns, constraints, and dev commands — not a generic template.

## Done looks like
- `.claude/CLAUDE.md` exists: project overview, three-view architecture, full DB schema table list, all 50+ API operationIds with their paths, codegen workflow, TS composite project rules, critical gotchas (zod/v4 import, orval codegen flow, Vault PIN gate), and preferred patterns for this repo
- `.gemini/GEMINI.md` exists: same core audit adapted to Gemini's markdown conventions, emphasising the Gemini AI integration (`lib/integrations-gemini-ai`), call-session health-intelligence pipeline, and the Jessica AI phone gateway data flow
- `.codex/AGENTS.md` exists: same audit in the compact AGENTS.md format OpenAI Codex expects, covering monorepo workspace structure, pnpm commands, env vars, test/build/typecheck commands, and explicit notes on what NOT to do (no virtual envs, no direct `.replit` edits, no hardcoded ports)
- All three files are accurate to the current codebase (no hallucinated routes or tables)
- Each file is standalone — no cross-references to the others required

## Out of scope
- Adding runtime config or `.env` files
- Changing any existing code
- Creating files for other assistants (Cursor, Copilot, etc.)

## Steps
1. **Audit collection** — Gather the full list of DB tables, API routes (operationIds + paths), pages, libraries, build commands, env requirements, and known gotchas from the current codebase.
2. **`.claude/CLAUDE.md`** — Write a detailed Claude-formatted context file: project mission, three-view system, stack, monorepo structure, all DB tables with column highlights, all API endpoints grouped by domain, codegen instructions, TS composite rules, critical constraints (zod/v4 path, Vault gate, orval → tsc rebuild sequence), and patterns to follow.
3. **`.gemini/GEMINI.md`** — Write the Gemini-formatted file emphasising the Gemini AI integration architecture (conversations/messages tables, `lib/integrations-gemini-ai`, Jessica pipeline, health-data extraction flow), same core audit sections but with Gemini-specific context about the project's use of the Gemini SDK.
4. **`.codex/AGENTS.md`** — Write a compact AGENTS.md: repo layout, workspace commands (`pnpm --filter` patterns), DB push, codegen commands, env vars needed, explicit prohibited actions, and a concise domain map so Codex can navigate without reading every file.

## Relevant files
- `replit.md`
- `pnpm-workspace.yaml`
- `lib/db/src/schema/index.ts`
- `lib/api-spec/openapi.yaml`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/brain-app/src/App.tsx`
- `artifacts/brain-app/src/pages/admin-view.tsx`
