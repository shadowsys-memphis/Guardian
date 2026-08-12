---
name: orval-generated react-query hook gotchas
description: Two non-obvious quirks with this codebase's orval-generated query/mutation hooks — a TS structural-typing trap on `enabled`, and missing cache invalidation on mutations.
---

# orval-generated react-query hook gotchas

## Rule — `enabled` on a generated query hook also requires its `queryKey`
Passing only `{ query: { enabled } }` to a generated hook fails typecheck: the generated option type is a full options object, not a partial, so `queryKey` must structurally be present too even though the hook supplies its own default at runtime. Pass the matching generated key-getter alongside `enabled`.

## Rule — generated mutations never auto-invalidate; you must do it yourself
Generated create/update mutations do not invalidate any query cache on success, and this app has `refetchOnWindowFocus` off globally. Any mutation meant to update an on-screen list needs an explicit cache invalidation (or manual refetch) in its own success handler, or the UI silently looks broken (success response, nothing appears until reload).

**How to apply:** Before trusting that a mutation's success toast means the UI is correct, check its success handler for this invalidation. When adding a new mutation, copy the invalidation pattern from a sibling mutation in the same file that already updates its list correctly.
