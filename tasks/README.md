# tasks/

Task specs for the Brain Guardian / br(AI)n App codebase. **Audited 2026-08-11.**

Every file carries a `**Status:**` line near the top. Read it before implementing
anything — most of this folder is already built.

## Open work

| File | State |
|---|---|
| `ios-calendar-push-all-alerts.md` | Partial — `POST /calendar/events` exists; app-wide wiring unverified |
| `shopper-inventory-phone-intake.md` | Blocked on `shopper-sheets-audit.md` |
| `voice-to-cart-shopper.md` | Core shipped; Sheets sync still unbuilt |

## Notes, not tasks

`market-validation.md` (the `MV-*` lane — field research, not code),
`onboarding-flow.md` (locked until explicitly scoped),
`shopper-sheets-audit.md` (prerequisite for the two shopper items above).

## Shipped — kept for provenance

`ai-agent-init-files.md`, `caregiver-rotation-dashboard.md`, `color-scheme-pastel.md`,
`daily-task-alert-system.md`, `doctor-report.md`, `google-workspace-dialer-upgrade.md`,
`lab-tracker-spec.md`, `lmstudio-local-models.md`, `task-7.md`, `task-20.md`

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
