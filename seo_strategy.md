# SEO Strategy

## In scope
- Public application shell delivered from `artifacts/brain-app/index.html`
- Vault gate / unlock screen that unauthenticated visitors and crawlers can access
- Static public assets that affect crawler and social preview behavior (`favicon`, Open Graph image, robots/sitemap/llms files if present)

## Out of scope
- Vault-protected SPA routes and their in-app content (`/pops`, `/admin`, `/jessica`, `/smarthome`, `/intercom`, `/scripts`)
- Authenticated or passphrase-protected application states
- API endpoints under `/api/**`

## Target audience
- Family caregiver / operator users of the private br(AI)n App

## Primary keywords
- No public organic-search keyword strategy identified in the source.

## Dismissed categories
- Do not propose ranking-oriented content issues for vault-protected application views unless a future scan adds public marketing or documentation pages.
- Treat standalone canonical-tag findings on the passphrase gate as low priority while the preferred remediation is to noindex or otherwise exclude that gate from search.
- Treat lack of SSR or prerendering for the passphrase gate as low priority while the gate remains a private entry page rather than a public landing page.
