---
title: Market Seam Validation (not feature expansion)
status: note — run after foundation BR debt; do not expand features to “win” the category
---

# Market Seam Validation

## Note

**Do not treat this as a feature backlog.** The market thesis (`docs/core-guardian/market-thesis.md`) says Brain Guardian found an open seam inside a contested market. Next proof is validation of that seam.

PRD IDs: `MV-001` … `MV-007`.

---

## Positioning to protect

> A voice-first family-care operating system for complex, changing home-care environments — coordinating the person, caregiver, household and care team without requiring the care recipient to operate an app.

Do not dilute this into generic “AI caregiver OS” language.

---

## Validation order (battle plan Phase V)

| ID | Prove | Lightest test |
|---|---|---|
| MV-001 | Generalizes beyond one household | Second caregiver configures a different care profile end-to-end |
| MV-002 | Configurable without the builder | Stranger/friend completes setup using only in-product guidance |
| MV-003 | Reduces burden / prevents misses | Before/after: missed meds, missed meals, caregiver hours in one week |
| MV-004 | Trust with sensitive data | Explicit trust interview + what must stay local vs cloud |
| MV-005 | Safe voice around meds/purchase/crisis | Written safety rules + refusal/approval paths exercised |
| MV-006 | Willingness to pay | 5–10 problem interviews with a price probe (no Stripe required) |
| MV-007 | Essential experience only | Define the smallest reliable slice that still matches the seam |

---

## Out of scope here

- OpenClaw / external agent runtimes
- Reviving Stripe before MV-006 evidence
- New feature modules that do not serve MV-001–007
- Claiming category ownership without proof

---

## Done looks like

Each `MV-*` story in `prd.json` has evidence noted in `progress.txt` and `passes: true`.
