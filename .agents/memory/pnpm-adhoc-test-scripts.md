---
name: Ad-hoc test scripts & pnpm module resolution
description: Why a throwaway ESM script placed in /tmp fails to find workspace deps like pg or drizzle-orm, and where to put it instead.
---

A standalone `.mjs` script that `import`s a workspace dependency (e.g. `pg`, `drizzle-orm`) resolves node_modules relative to the **script file's own location**, not the shell's CWD. A script saved under `/tmp` has no `node_modules` in its ancestry, so it fails with `ERR_MODULE_NOT_FOUND` even though the same package is installed and hoisted for the workspace.

**Why:** This is easy to misdiagnose as "the package isn't installed" when it's really just an ESM resolution path problem — `node -e "...require('pg')..."` run from the workspace root works fine (CJS `require` resolves from `process.cwd()`), which makes the `.mjs`-from-`/tmp` failure mode confusing by contrast.

**How to apply:** For one-off verification/test scripts that need a workspace package, save the file inside an actual workspace package directory that already depends on it (e.g. `lib/db/` for `pg`/drizzle), run it from there, then delete it when done — don't debug module resolution, just relocate the script.
