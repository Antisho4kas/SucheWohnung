# Immobilo Source Readiness

Research date: 2026-06-05. Scope: implemented connector readiness, robots evidence, sitemap discovery, and dry-run gate. No live scraping or connector dry-run was run.

## Source Identity

| Field | Value |
| --- | --- |
| Source name | Immobilo |
| Slug | `immobilo` |
| Site URL | `https://www.immobilo.de/` |
| Source type | Aggregator |
| Runtime status | Exported and seeded inactive; not registered in the default collect registry |

## Robots And URL Evidence

Robots URL: `https://www.immobilo.de/robots.txt`

Relevant robots rules observed on 2026-06-05:

```txt
Sitemap: https://www.immobilo.de/sitemap.xml
User-agent: *
Disallow: */2823228/
Disallow: /_widget/*
Disallow: /geo_location_suggest
Disallow: /search-widget/*
Allow: /*sitemap*?*
Allow: /css/*
Allow: /js/*
Allow: /images/*
Allow: /bundles/*
Allow: /fonts/*
Allow: /vendor/*
Allow: /immobilien/*
```

URL verification performed with HEAD/web fetch only, not listing scraping:

| URL | Status | Notes |
| --- | --- | --- |
| `https://www.immobilo.de/` | 200 | Site URL reachable. |
| `https://www.immobilo.de/robots.txt` | 200 | Robots fetched. |
| `https://www.immobilo.de/sitemap.xml` | 200 | Sitemap URL from robots. |
| `https://www.immobilo.de/sitemap-serp.xml` | 404 | Configured fallback name, not a verified current sitemap URL. |
| `https://www.immobilo.de/sitemap-exp.xml` | 404 | Configured fallback name, not a verified current sitemap URL. |

## Sitemap URLs

- `https://www.immobilo.de/sitemap.xml` is listed in robots and returned 200 in URL verification.
- Direct `/sitemap-serp.xml` and `/sitemap-exp.xml` returned 404 during URL verification; discovery should start from `/sitemap.xml` and follow entries whose paths match current sitemap patterns.

## Allowed / Disallowed Endpoints

Allowed for research only, subject to legal approval and runtime guard owner approval:

- `/sitemap.xml` and sitemap entries discovered from it.
- Public expose/detail pages under `/immobilien/*`.
- Public SERP pages only when discovered from sitemap entries and not blocked by robots.

Disallowed or out of scope:

- `/_widget/*`, `/search-widget/*`, `/geo_location_suggest`, and `*/2823228/`.
- Original-source redirect/contact/application/login flows.
- Any attempt to bypass upstream source restrictions through the aggregator.

## Parser Strategy

- Use sitemap index discovery from `/sitemap.xml`.
- Prefer expose/detail sitemap entries; use SERP sitemap entries only to discover expose links when allowed and low-rate.
- Fetch public `/immobilien/*` expose pages.
- Parse JSON-LD, canonical URL, meta tags, body facts, image links, original source name, and original source URL where exposed.
- Mark records with aggregator metadata and high dedupe risk.

## Data Fields Expected

- External ID from canonical `/immobilien/*` URL.
- Canonical expose URL.
- Title.
- Cold rent and warm rent.
- Living area.
- Room count.
- Postal code and city.
- Description.
- Images.
- Original source name and original URL when present.
- Attributes: aggregator flag, dedupe risk, original source metadata, balcony, terrace, elevator, parking, cellar, furnished, pets_allowed, new_building, provisionfrei.

## Anti-Bot / JS Risks

- Aggregator inventory can mirror ImmoScout24, Immowelt, Kleinanzeigen, landlord pages, or other portals; cross-source duplicate risk is high.
- Sitemap inventory may be large; avoid broad sitemap traversal and cap `maxSitemapUrls`, `maxSerpPages`, and `maxExposePages` tightly.
- Direct sitemap fallback URLs in current config returned 404; stale sitemap naming can break discovery.
- Do not use Immobilo to work around upstream source robots/ToS restrictions.

## Legal / ToS Risk Summary

- Robots allows `/immobilien/*` and lists `/sitemap.xml`, but blocks widgets/search helpers/geolocation suggest.
- Robots allowance is not legal permission to collect, store, or reuse listings.
- Aggregator reuse adds copyright/database-right and dedupe-notification risk because listings may belong to upstream portals.
- ToS/legal approval is not documented for this project.

## Recommended Rate Limit

- Research-only dry-run candidate rate: maximum 2 requests per minute, `maxItems<=3`, `maxSerpPages<=1`, `maxExposePages<=3`, and `pageDelayMs>=3000`.
- Keep source disabled until dedupe strategy and upstream-source policy are reviewed.
- Stop immediately on 403, 429, CAPTCHA/challenge, redirect loops, or high duplicate ratio.

## Dry-Run Command / Config

- Command: none approved. Do not run live scraping until the source activation guard owner approves a dry-run.
- Current admin manual run is not a dry-run and requires an active, approved source; do not use it for this gate.
- Proposed low-rate config after approval:

```yaml
sourceSlug: immobilo
maxItems: 3
config:
  baseUrl: https://www.immobilo.de
  sitemapIndexUrl: /sitemap.xml
  sitemapSerpPattern: sitemap-serp
  sitemapExpPattern: sitemap-exp
  maxSitemapUrls: 100
  maxSerpPages: 1
  maxExposePages: 3
  pageDelayMs: 3000
  aggregator: true
  dedupeRisk: high
  userAgent: SucheWohnung/1.0
notifications: disabled
writeMode: dry-run-only
```

## Dry-Run Status

- Status: `blocked`
- Reason: not registered in the default runtime registry, legal approval is missing, direct fallback sitemap URLs returned 404, aggregator dedupe policy is not approved, and no source activation guard owner approval was granted for live dry-run.
- Metrics: not collected (`fetched/new/errors` unavailable).

## Activation Recommendation

- Recommendation: `disabled`
- Rationale: public sitemap/detail route may be feasible, but aggregator dedupe/legal risk is high, runtime wiring is absent, and dry-run/legal evidence is missing.
