# SEO Strategy — Brain Guardian

## Product
Brain Guardian is a private, AI-powered caregiving platform for families supporting Veterans with complex needs (PTSD, Schizophrenia). It includes medication tracking, care routines, AI clinical summaries, meal planning, and family coordination.

## In Scope
- `/guardian` — the sole public acquisition / landing page (indexed, crawlable)

## Out of Scope
- `/` (root) — redirects to private care workspace, `noindex`
- `/pops` — care recipient display, private
- `/admin` — Raymo's command center, private
- `/jessica` — AI phone gateway, private
- `/shopper`, `/settings`, `/my-subscription` — private authenticated pages
- `/guardian/success` — transactional post-checkout page, `noindex`

## Target Audience
- Family caregivers of Veterans with PTSD, Schizophrenia, and complex care needs
- VA caregivers and home care coordinators

## Primary Keywords
- AI caregiving OS for Veterans
- Veteran caregiver app
- Medication tracking for PTSD / schizophrenia caregivers
- Home caregiver scheduling and management

## Dismissed Categories
- (None yet)

## Notes
- The app is a React SPA (Vite). `guardian.html` is the only public HTML shell.
- An `entry-server-guardian.tsx` with `renderToStaticMarkup` exists in source but is not currently wired to a server route.
- All private routes are protected by `noindex` and `Disallow` in `robots.txt`.
- `robots.txt` and `sitemap.xml` contain a hardcoded Replit subdomain (`guardian-os-LedgerGhost90.replit.app`).
