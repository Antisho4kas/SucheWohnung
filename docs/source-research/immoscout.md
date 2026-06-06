# ImmoScout24 Source Readiness

Research date: 2026-06-05. Scope: implemented connector readiness, robots evidence, local/private-adapter clarification, and dry-run gate. No live scraping or connector dry-run was run.

## Source Identity

| Field | Value |
| --- | --- |
| Source name | ImmoScout24 / Immobilienscout24 |
| Slug | `immoscout` |
| Site URL | `https://www.immobilienscout24.de/` |
| Source type | Marketplace / local adapter scaffold in current connector |
| Runtime status | Registered in the default collect registry; seeded inactive |

## Robots And URL Evidence

Robots URL: `https://www.immobilienscout24.de/robots.txt`

Relevant robots rules observed on 2026-06-05:

```txt
User-agent: *
Disallow: /published-downloads/
Disallow: /published-images/
Disallow: /error/
Disallow: /errors/
Disallow: /marktplatz/
Disallow: /de/scoutmanager/
Disallow: /meinkonto/
Disallow: /adresse/
Disallow: /merkzettel/
Disallow: /*.pdf$
Disallow: /immobilienpreise/api/
Disallow: /*?*geocodes=
Sitemap: https://www.immobilienscout24.de/wissen/sitemap.xml
Sitemap: https://www.immobilienscout24.de/Suche/sitemap/activeExposes.xml
Sitemap: https://www.immobilienscout24.de/Suche/sitemap/notEmptyPageSearches.xml
Sitemap: https://www.immobilienscout24.de/immobilienpreise/sitemap.xml
Sitemap: https://www.immobilienscout24.de/regional/de/sitemap.xml
```

URL verification performed with HEAD/web fetch only, not listing scraping:

| URL | Status | Notes |
| --- | --- | --- |
| `https://www.immobilienscout24.de/` | 200 | Site URL reachable. |
| `https://www.immobilienscout24.de/robots.txt` | 200 | Robots fetched. |
| `https://www.immobilienscout24.de/Suche/sitemap/activeExposes.xml` | 200 | Listing sitemap URL from robots. |
| `https://www.immobilienscout24.de/Suche/sitemap/notEmptyPageSearches.xml` | 200 | Search-page sitemap URL from robots. |

## Sitemap URLs

- `https://www.immobilienscout24.de/Suche/sitemap/activeExposes.xml`
- `https://www.immobilienscout24.de/Suche/sitemap/notEmptyPageSearches.xml`
- Other robots-listed sitemaps exist for knowledge/regional/price content but are not listing-ingestion candidates.
- Current connector does not use public ImmoScout24 sitemaps.

## Allowed / Disallowed Endpoints

Allowed in current code only as a private/local adapter contract, not as public-site approval:

- Local adapter `baseUrl`, default `http://localhost:8001`.
- Local adapter `/health`.
- Local adapter `/search` JSON endpoint.

Disallowed or out of scope for public `immobilienscout24.de` activation:

- Account, scout manager, saved list, address, downloads/images, PDFs, price APIs, geocode-query URLs, contact/application/login flows.
- Any private REST API, browser automation, or Playwright wrapper without official API/partner permission and source-specific legal review.

## Parser Strategy

- Current connector is a local/private adapter scaffold.
- It sends `city`, `max_price`, `min_rooms`, and `pages` to the local adapter `/search` endpoint.
- It maps adapter JSON results to normalized listings.
- It does not parse public ImmoScout24 HTML or sitemaps.

## Data Fields Expected

- Adapter `id`.
- Source URL returned by adapter.
- Title.
- Price.
- Living area.
- Room count.
- City and postal code.
- Street text only as adapter-provided description.
- Images are currently empty in the connector.

## Anti-Bot / JS Risks

- ImmoScout24 is a large marketplace with account, application, contact, and API surfaces; do not automate those flows.
- Official API or partner feed should be preferred over scraping or browser automation.
- A local Playwright/API wrapper is not legal evidence; it must document its own permission, robots behavior, request paths, and rate limits before activation.
- Public sitemaps returning 200 do not approve collecting or reusing listing data.

## Legal / ToS Risk Summary

- Current connector is acceptable only as a local/private adapter scaffold for development or separately approved feed integration.
- Public-site live scraping is not approved by this documentation.
- ToS/API permission evidence is not documented for this project.
- Any official API use must be documented with credentials handling, quotas, and allowed data fields before activation.

## Recommended Rate Limit

- Public-site rate: `0` until official API/partner/private feed approval exists.
- Local approved adapter/dev fixture rate: maximum 5 requests per minute and `maxItems<=5`, or stricter official API quota if applicable.

## Dry-Run Command / Config

- Command: none approved for public-site dry-run. Do not run public live scraping.
- Local adapter fixture/dev runs are not legal evidence for public-site activation.
- Proposed local-adapter-only config after approval of the adapter source:

```yaml
sourceSlug: immoscout
maxItems: 5
config:
  baseUrl: http://localhost:8001
  healthPath: /health
  searchPath: /search
  city: Ingolstadt
  maxPrice: 800
  minRooms: 1.5
  maxPages: 1
notifications: disabled
writeMode: dry-run-only
```

## Dry-Run Status

- Status: `blocked`
- Reason: public-site legal/API approval is missing; current connector is a local/private adapter scaffold and no source activation guard owner approval was granted for live dry-run.
- Metrics: not collected (`fetched/new/errors` unavailable).

## Activation Recommendation

- Recommendation: `blocked`
- Rationale: public-site activation is not supported by current evidence. Keep disabled unless official API/partner/private adapter permission is documented and approved separately.
