# SEO Strategy

## In scope
- Public indexable acquisition route `/guardian`
- Public transactional onboarding route `/guardian/success` for noindex and preview behavior
- Static public assets that affect crawler and social preview behavior (`favicon`, Open Graph image, `robots.txt`, `sitemap.xml`, and any future `llms.txt` file)
- Root-URL shell only where its static metadata or social-preview tags affect shared URLs

## Out of scope
- Internal caregiver application views exposed only after the SPA loads and vault access succeeds (`/pops`, `/admin`, `/jessica`, `/shopper`, `/scripts`, `/admin/report`, `/my-subscription`, `/settings`)
- API endpoints under `/api/**`
- Ranking-oriented content recommendations for private operational UI

## Target audience
- Family caregiver and operator users evaluating or operating the private br(AI)n App and Brain Guardian offering

## Primary keywords
- No public organic-search keyword strategy identified in the source.

## Notes
- Current source is a Vite React SPA deployed as a static site through `artifacts/brain-app/.replit-artifact/artifact.toml`.
- `artifacts/brain-app/src/App.tsx` exposes two public pre-unlock routes: `/guardian` and `/guardian/success`.
- `/guardian` has a dedicated HTML shell in `artifacts/brain-app/guardian.html`, a production rewrite from `/guardian` to `/guardian.html`, and a build-time prerender step via `artifacts/brain-app/src/entry-server-guardian.tsx` plus `artifacts/brain-app/scripts/prerender-guardian.mjs`.
- The built `/guardian` HTML now contains its H1 and body copy in the initial response, so the prior empty-shell rendering problem is fixed.
- `artifacts/brain-app/public/robots.txt` now allows `/guardian` and the public assets it depends on while keeping the private workspace blocked.
- The root app shell remains privacy-first: `artifacts/brain-app/index.html` emits `noindex, nofollow, noarchive` for the private workspace.
- The current production build now code-splits the public acquisition route: `/guardian` loads its own `guardian-main` entry plus smaller shared chunks, and no built asset is near Google's 2 MB per-resource rendering cap.
- `/guardian/success` has a dedicated source HTML shell, but production rewrites still fall through to `/index.html` for that route.
- `artifacts/brain-app/public/llms.txt` now exists, and `/guardian` emits `WebSite`, `Organization`, and `SoftwareApplication` JSON-LD in the public shell.

## Dismissed categories
- Do not propose generic ranking or content optimizations for the internal caregiver SPA while the project intentionally excludes the private shell from search.
- Treat standalone canonical-tag work as low priority unless the app later introduces additional public, indexable marketing or documentation pages.
- Treat lack of SSR or prerendering for internal caregiver views as low priority; public acquisition routes remain in scope because they are reachable before unlock.
