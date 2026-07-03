---
title: Weekly & Monthly Doctor Health Report
---
# Weekly & Monthly Doctor Report

## What & Why
Generate a structured health report — weekly and monthly — that Raymo's doctor can review. It pulls together everything Jessica collects: daily check-in data (mood, sleep, medication, voices, energy, appetite, cognition), flagged/unusual events, symptom logs, and his weekly food tastes and preferences from the meal planning module. The goal is a clean, readable document the doctor can open without logging in or navigating the app.

## Done looks like
- A "Doctor Report" section accessible from the Admin view
- Weekly report shows: a category-by-category summary (green / yellow / red status), any flagged or unusual events with the raw notes, his food and meal preferences noted that week, and a plain-English narrative paragraph summarizing the week
- Monthly report shows: 30-day trend charts per category, count of flagged days, medication adherence rate, voice activity frequency, and notable patterns
- Both reports have a print/PDF-friendly layout (clean white, no nav chrome) accessible via a Print button
- A `/api/health-assessment/report/weekly` and `/api/health-assessment/report/monthly` endpoint return the aggregated data used to render both views

## Out of scope
- Emailing or faxing the report to the doctor directly
- Editing or annotating the report from the doctor's side
- Historical report archiving (view live data only)

## Steps
1. **Backend report endpoints** — Add `GET /api/health-assessment/report/weekly` and `GET /api/health-assessment/report/monthly` routes. Weekly: query the last 7 days of `callSessionsTable` + `healthDataPointsTable` + `symptomLogsTable`, aggregate per category (status, flagged count, raw flagged responses), pull meal/food preference notes from the meal planning table if available. Monthly: same but 30-day window, compute per-category daily averages for trend data and overall adherence rates.

2. **Doctor Report page** — Create `artifacts/brain-app/src/pages/doctor-report.tsx`. Tabbed layout: "This Week" and "This Month". Weekly tab renders category status badges, a flagged events list with timestamps and notes, a food/tastes section, and a 2–3 sentence AI-generated or template narrative. Monthly tab renders recharts line charts per category, a stats summary row (medication adherence %, flagged days, voice-active days).

3. **Print layout** — Add a Print button that opens a `window.print()`-triggered view. Use a `@media print` CSS class (or a separate print stylesheet) to hide the nav, tabs, and sidebar and render just the report content cleanly on the page.

4. **Wire into Admin nav** — Add a "Doctor Report" tab or card to `admin-view.tsx` that navigates to `/admin/report` (or renders the report inline). Register the `/admin/report` route in `App.tsx`.

## Relevant files
- `artifacts/api-server/src/routes/health-assessment.ts`
- `artifacts/api-server/src/routes/symptoms.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/brain-app/src/pages/admin-view.tsx`
- `artifacts/brain-app/src/App.tsx`