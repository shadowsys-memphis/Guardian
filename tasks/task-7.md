---
title: Add a back-navigation button on the Doctor Report so Ray doesn't get stranded
---
# Add a back-navigation button on the Doctor Report so Ray doesn't get stranded

**Status:** SHIPPED — back-nav present at `doctor-report.tsx:318` (`title="Back to Admin"`). _(audited 2026-08-11)_

  ## What & Why
  The Doctor Report page renders standalone (outside the admin sidebar layout) and has no visible way to return to the Admin panel. On mobile the bottom-nav is visible, but on desktop Ray has no obvious escape route. A simple "← Back to Admin" button in the header fixes this.

  ## Done looks like
  - A "← Back to Admin" link/button appears in the top-left of the Doctor Report header bar (the non-print area)
  - Clicking it navigates to /admin
  - It is hidden in print/PDF mode

  ## Relevant files
  - `artifacts/brain-app/src/pages/doctor-report.tsx` (the header section, line ~150)