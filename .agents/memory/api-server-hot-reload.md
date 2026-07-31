---
name: api-server dev workflow has no hot-reload
description: Backend source changes require a workflow restart to take effect — the dev script builds once and runs the static bundle.
---

The api-server "dev" script is build-then-start, not a watcher — restart the workflow after any backend source change before trusting live checks against it.
