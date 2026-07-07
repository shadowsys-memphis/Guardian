---
name: spec-first-routing
description: Cost-routing workflow for nontrivial features/fixes — plan and review with the strongest model, delegate bulk code-writing and mechanical fixes to a cheaper model. Trigger before writing implementation code for anything beyond a one-line fix, or when asked to "route", "delegate to a cheap model", "save cost", or when handing work to Codex/Gemini CLI/Cursor/a subagent.
---

# Spec-First Routing

Separates command from labor: a strong model plans and reviews, a cheap model
builds. The spec is the contract that lets the cheap model skip
"rediscover + debate + plan" and go straight to "read locked spec → execute
exact task → report diff."

## Roles

| Role | Who | Job |
|---|---|---|
| Architect | This session (Claude/Fable/frontier) | Research, architecture decisions, writes the spec |
| Builder | Cheaper model | Writes code from the spec, nothing more |
| Inspector | This session (same model as Architect) | Reviews the diff against the spec and against `AGENTS.md` |
| Fixer | Cheaper model | Applies Inspector's fix instructions only |

## When to route

Route when the task is a real feature/bugfix with a clear scope: new endpoint,
new page, schema change, refactor with a defined target.

Do **not** route — do it directly as the strong model instead:
- One-line or few-line mechanical fixes (writing a spec costs more than the fix).
- Anything touching auth, tenant scoping (`tenant_id`), billing/Stripe, or the
  vault gate — Guardian's non-negotiables live in `AGENTS.md`, and getting
  these wrong is expensive to catch late.
- Genuinely ambiguous or exploratory work where the "spec" would just be
  "figure it out" — that's architect work, not builder work.

## Step 1 — Architect: write the spec

Before any implementation code, produce a written spec (a scratch file, or
inline in the conversation if short enough). A good spec includes:

1. **Goal** — one or two sentences, what "done" looks like.
2. **Files touched** — exact paths, and for each: what changes.
3. **Exact signatures/routes/schema** — function signatures, new API paths +
   operationIds (see `.claude/CLAUDE.md` → API table), new DB columns, etc.
   Not prose descriptions — the literal shape.
4. **Edge cases** the builder must handle, enumerated.
5. **Acceptance criteria** — how the Inspector will judge the diff.
6. **Explicitly out of scope** — what the builder must NOT touch or redesign.
7. **Relevant non-negotiables** — pull the specific rules from `AGENTS.md`
   that apply (e.g. "every `care_events` row needs `tenant_id` from
   `req.tenantSession.sub`", "CORS stays exact-match", "`zod/v4` not `zod`").

If the spec can't be written this concretely, the task isn't ready to route —
go back to research/planning.

## Step 2 — Builder: execute from the spec

Two ways to run this, pick based on what's available:

**In-harness (this environment):** spawn the builder as a subagent with a
cheaper model override, and paste the spec verbatim as its prompt:

```
Agent({
  description: "Build from locked spec",
  subagent_type: "general-purpose",
  model: "haiku",
  prompt: "<full spec text>\n\nBuild exactly this. Do not redesign, do not
           change the approach, do not touch files not listed. If something
           in the spec is ambiguous or doesn't match what you find in the
           code, stop and report the mismatch instead of guessing."
})
```

**External tool:** paste the spec into Codex CLI / Gemini CLI / Cursor and
say "Build this." Collect the resulting diff back into this session.

Either way, the builder's instructions are the spec — not "the feature," not
"what we discussed." If the builder needs to make a judgment call the spec
doesn't cover, that's an escalation back to the Architect, not something for
the builder to decide.

## Step 3 — Inspector: review the diff

Switch back to the strong model (this session, no override). Review the
diff against:
- The spec's acceptance criteria — did it build what was asked, nothing more.
- `AGENTS.md` non-negotiables — tenant scoping, CORS, `zod/v4`, generated
  files never hand-edited, etc.
- Standard correctness/security review (can invoke `/code-review` here for
  a structured pass on nontrivial diffs).

Never merge or hand off to the user without this step. This is the gate a
cheap model cannot substitute for.

## Step 4 — Fixer: apply feedback

If the Inspector finds issues, write concrete fix instructions (not code) and
send them back to the same cheap-model builder pattern as Step 2. Loop
Steps 2–4 as needed, but if two rounds don't converge, the Architect takes
the diff over directly rather than burning further rounds.

## Why this exists

Output tokens are the expensive part of coding, and bulk code-writing
generates a lot of them. Keeping the frontier model on research/spec/review
and pushing bulk writing to a cheaper model cuts cost substantially without
giving up judgment quality — the spec is what makes that safe.
