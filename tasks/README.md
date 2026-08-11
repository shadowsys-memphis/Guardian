# tasks/

Task specs for the Brain Guardian / br(AI)n App codebase. **Audited 2026-08-11.**

Every file carries a `**Status:**` line near the top. Read it before implementing
anything — most of this folder is already built.

## Open work

| File | State |
|---|---|
| `lab-tracker-spec.md` | **Backend only** — 8 handlers, but no spec paths, no hooks, no UI |
| `ios-calendar-push-all-alerts.md` | Partial — only schedule tasks push; spec wants app-wide |
| `voice-to-cart-shopper.md` | Core shipped; Google Sheets sync still unbuilt |

Depth-audited 2026-08-11: each item was checked for backend handlers, router
registration, `openapi.yaml` paths, generated hooks, **and** frontend consumption.
"A route file exists" is not shipped — `lab-tracker-spec` is the cautionary case.

## Notes, not tasks

`market-validation.md` (the `MV-*` lane — field research, not code),
`onboarding-flow.md` (locked until explicitly scoped),
`shopper-sheets-audit.md` (prerequisite for the two shopper items above).

## Shipped — kept for provenance

`ai-agent-init-files.md`, `caregiver-rotation-dashboard.md`, `color-scheme-pastel.md`,
`daily-task-alert-system.md`, `doctor-report.md`, `google-workspace-dialer-upgrade.md`,
`lmstudio-local-models.md`, `shopper-inventory-phone-intake.md`, `task-7.md`, `task-20.md`

## Removed in the 2026-08-11 audit

- **7 duplicates** — `task-1/2/3/4/16/17/18.md` were byte-identical copies of the
  named specs (or older versions of them, lacking their Status headers).
- **2 dead specs** — `unconditional-reframe.md` (depends on the Governor system,
  deleted in `98a0acd`) and `brain-guardian-monetization.md` (the Stripe launch
  plan; billing was stripped out).

## Convention

Numbered `task-N.md` names are legacy. Name new specs for what they do, give them a
`**Status:**` line on creation, and update that line when the work lands — otherwise
this folder drifts back into looking like a backlog when it is mostly a changelog.
