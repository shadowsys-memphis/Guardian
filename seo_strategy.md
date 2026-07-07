# SEO Strategy

## In scope
- Public SPA shell delivered from `artifacts/brain-app/index.html`
- Public acquisition and onboarding routes exposed before vault unlock: `/guardian` and `/guardian/success`
- Static public assets that affect crawler and social preview behavior (`favicon`, Open Graph image, `robots.txt`, and any future `sitemap.xml` / `llms.txt` files)
- Root-URL and acquisition-route share preview behavior for the app shell

## Out of scope
- Internal caregiver application views exposed only after the SPA loads and vault access succeeds (`/pops`, `/admin`, `/jessica`, `/smarthome`, `/scripts`, `/admin/report`, `/my-subscription`)
- API endpoints under `/api/**`
- Ranking-oriented content recommendations for private operational UI

## Target audience
- Family caregiver / operator users evaluating or operating the private br(AI)n App and Brain Guardian offering

## Primary keywords
- No public organic-search keyword strategy identified in the source.

## Notes
- Current source is a Vite React SPA. Non-JavaScript bots and social preview bots only see `artifacts/brain-app/index.html`.
- `artifacts/brain-app/src/App.tsx` exposes two public, pre-unlock routes: `/guardian` and `/guardian/success`.
- The current crawl strategy is privacy-first for the shared shell: `index.html` emits `noindex, nofollow, noarchive`, and `artifacts/brain-app/public/robots.txt` disallows all crawlers.
- Public acquisition routes currently inherit that same privacy-first shell, creating a crawlability mismatch for Brain Guardian if organic discovery is intended.
- Root-URL and acquisition-route share-preview tags currently come from the single shared HTML shell, not from route-specific SSR or prerendered HTML.
- The prior `%VITE_PUBLIC_SITE_URL%` placeholder-share issue is fixed in source via `artifacts/brain-app/vite.config.ts` validation.

## Dismissed categories
- Do not propose generic ranking/content optimizations for the internal caregiver SPA while the project intentionally excludes the private shell from search.
- Treat standalone canonical-tag work as low priority unless the app later introduces additional public, indexable marketing or documentation pages.
- Treat lack of SSR or prerendering for internal caregiver views as low priority; public acquisition routes remain in scope because they are reachable before unlock.
