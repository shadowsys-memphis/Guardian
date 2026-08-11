---
name: pnpm workspace package installs
description: How to add a dependency to one package inside this pnpm monorepo without hitting ERR_PNPM_ADDING_TO_ROOT.
---

# pnpm Workspace Package Installs

## Rule — install into a workspace package explicitly
The generic package-install tool assumes a single-package repo and fails here with `ERR_PNPM_ADDING_TO_ROOT` because this is a pnpm workspace monorepo. Use `pnpm --filter <package-name> add <dep>` (e.g. `pnpm --filter @workspace/api-server add @replit/connectors-sdk`) run via shell instead.

**Why:** The root `package.json` is a workspace manifest, not an installable package — pnpm refuses to add deps there by default, and the generic installer doesn't know to target a workspace member.

**How to apply:** Any time a task needs a new npm dependency for one artifact/package (`artifacts/*`, `lib/*`), install it with `pnpm --filter @workspace/<pkg-dir-name> add <dep>` rather than the generic installer tool.
