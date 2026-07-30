---
name: api-server dev workflow has no hot-reload
description: Backend source changes require a workflow restart to take effect — the dev script builds once and runs the static bundle.
---

The api-server artifact's "dev" script is `build && start` (bundles to `dist/index.mjs`, then runs it as a plain `node` process) — not a watcher. Editing route/lib source files does NOT take effect in the already-running process; only a workflow restart rebuilds and reloads it.

**Why:** Unlike the frontend (Vite, which HMRs `.tsx` changes live), the backend has no equivalent — the running process holds last-built code in memory indefinitely, even while `dist/index.mjs` on disk gets silently overwritten by ad-hoc `pnpm build` runs (e.g. from manual verification by another agent/session).

**How to apply:** After any backend source change (yours or another agent's), restart the api-server workflow before trusting live/curl checks against it — a passing typecheck or a fresh git commit does not prove the running server reflects it. If unsure, compare the process start time (`ps -o lstart -p <pid>`) against the last relevant commit/edit time, or just look for the expected boot-time log line after a restart.
