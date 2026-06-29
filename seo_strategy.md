# SEO Strategy

## In scope
- Public SPA shell delivered from `artifacts/brain-app/index.html`
- Static public assets that affect crawler and social preview behavior (`favicon`, Open Graph image, `robots.txt`, and any future `sitemap.xml` / `llms.txt` files)
- Root-URL share preview behavior for the app shell

## Out of scope
- Internal caregiver application views exposed only after the SPA loads (`/pops`, `/admin`, `/jessica`, `/smarthome`, `/scripts`, `/admin/report`) while the project continues to exclude the entire shell from search with global `noindex` and `robots.txt` blocks
- API endpoints under `/api/**`
- Ranking-oriented content recommendations for private operational UI

## Target audience
- Family caregiver / operator users of the private br(AI)n App

## Primary keywords
- No public organic-search keyword strategy identified in the source.

## Notes
- Current source is a Vite React SPA. Non-JavaScript bots and social preview bots only see `artifacts/brain-app/index.html`.
- `artifacts/brain-app/src/App.tsx` currently routes directly to the internal app views; the repo still contains `vault-context` / `vault-gate` components, but they are not wired into the delivered shell.
- The current crawl strategy is privacy-first: `index.html` emits `noindex, nofollow, noarchive`, and `artifacts/brain-app/public/robots.txt` disallows all crawlers.

## Dismissed categories
- Do not propose generic ranking/content optimizations for the internal caregiver SPA while the project intentionally excludes the shell from search.
- Treat standalone canonical-tag work as low priority unless the app later introduces public, indexable marketing or documentation pages.
- Treat lack of SSR or prerendering for internal caregiver views as low priority unless the app later adopts an indexable public section.
