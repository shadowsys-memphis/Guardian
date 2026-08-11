---
name: OpenAPI codegen pipeline (orval)
description: This monorepo generates typed clients from an OpenAPI spec; backend route contract changes must update the spec and rerun codegen or generated types silently drift from reality.
---

# OpenAPI Codegen Pipeline

## Rule — update the spec when an Express route's request contract changes
`lib/api-spec/openapi.yaml` is the source of truth that `orval` (config at `lib/api-spec/orval.config.ts`) uses to generate `lib/api-zod` and `lib/api-client-react`. Express routes under `artifacts/api-server/src/routes/` are hand-written and are **not** generated from the spec, so nothing forces them to stay in sync automatically. Any change to a route's required/optional headers, body shape, or response shape must be mirrored in `openapi.yaml`, followed by rerunning codegen (`pnpm run codegen` from `lib/api-spec`), or the generated Zod schemas/React hooks keep documenting (and validating against) a stale contract.

**Why:** Discovered when removing a custom auth header (`x-google-access-token`) from two routes — the header was still declared as a required parameter in the spec, invisible unless someone greps `openapi.yaml` directly, since the Express route code itself compiled and ran fine either way.

**How to apply:** After editing any route's request/response shape, grep `lib/api-spec/openapi.yaml` for that route's path before considering the change done.
