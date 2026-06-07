# Kleinanzeigen Source Readiness

Research date: 2026-06-05. Scope: implemented connector readiness, robots evidence, local-adapter clarification, and dry-run gate. No live scraping or connector dry-run was run.

## Source Identity

| Field | Value |
| --- | --- |
| Source name | Kleinanzeigen |
| Slug | `kleinanzeigen` |
| Site URL | `https://www.kleinanzeigen.de/` |
| Source type | Marketplace / local adapter scaffold in current connector |
| Runtime status | Registered in the default collect registry; seeded inactive |

## Robots And URL Evidence

Robots URL: `https://www.kleinanzeigen.de/robots.txt`

Relevant robots rules observed on 2026-06-05:

```txt
User-agent: *
Disallow: /account/index.html
Disallow: /ad/
Disallow: /classified/latest/
Disallow: /messages/
Disallow: /s-feed.rss
Disallow: /s-suchanfrage.html
Disallow: /m-einloggen.html
Disallow: /search
Disallow: /*/sortierung:*
Disallow: /*/preis:*
Disallow: /*.json
Disallow: /api
Sitemap: https://www.kleinanzeigen.de/sitemap_index.xml
```

URL verification performed with HEAD/web fetch only, not listing scraping:

| URL | Status | Notes |
| --- | --- | --- |
| `https://www.kleinanzeigen.de/` | 200 | Site URL reachable. |
| `https://www.kleinanzeigen.de/robots.txt` | 200 | Robots fetched. |
| `https://www.kleinanzeigen.de/sitemap_index.xml` | 200 | Sitemap URL from robots. |

## Sitemap URLs

- `https://www.kleinanzeigen.de/sitemap_index.xml` is listed in robots and returned 200 in URL verification.
- Current connector does not use the public Kleinanzeigen sitemap.

## Allowed / Disallowed Endpoints

Allowed in current code only as a private/local adapter contract, not as public-site approval:

- Local adapter `baseUrl`, default `http://localhost:8000`.
- Local adapter `/health`.
- Local adapter `/inserate` JSON endpoint.
- Local adapter `/inserat/{adid}` JSON endpoint.

Disallowed or out of scope for public `kleinanzeigen.de` activation:

- `/api`, `/*.json`, `/search`, `/ad/`, `/classified/latest/`, `/messages/`, `/s-feed.rss`, saved search, login/account, posting/editing, contact/message, payment, or user flows.
- Public live scraping from `kleinanzeigen.de` using the local adapter shape is not documented or approved.

## Parser Strategy

- Current connector is a local adapter/private network scaffold.
- It sends search parameters to the local adapter (`query`, `location`, `max_price`, `page_count`).
- It reads adapter JSON search results and then adapter JSON details for area, rooms, images, postal code, description, and details.
- It does not parse public Kleinanzeigen HTML and does not have legal evidence for live public-site crawling.

## Data Fields Expected

- Adapter `adid`.
- Source URL returned by adapter.
- Title.
- Price.
- Description and full description.
- City and postal code.
- Living area.
- Room count.
- Images.
- Details map.
- Attributes from description: balcony, elevator, parking, furnished, pets_allowed, new_building.

## Anti-Bot / JS Risks

- Public Kleinanzeigen robots rules are restrictive for search, API, JSON, messages, account, and many filtered result paths.
- Any local adapter that fetches the public site must have its own legal/robots evidence and must not hide disallowed public-site access behind localhost.
- Marketplace contact/message flows are explicitly out of scope.
- Current connector can be used safely only against a controlled local fixture/mock adapter or a separately approved partner/private feed.

## Legal / ToS Risk Summary

- Public-site live scraping is not approved.
- The local adapter scaffold is allowed only for local development, fixture testing, or a separately approved private/partner feed.
- Robots allowance for the sitemap does not grant permission to crawl search/API/contact paths.
- ToS/legal approval is not documented for public-site ingestion.

## Recommended Rate Limit

- Public-site rate: `0` until explicit permission or official/partner feed approval exists.
- Local adapter/dev fixture rate: keep low for parity with production safety, maximum 10 requests per minute and `maxItems<=5`.

## Dry-Run Command / Config

- Command: none approved for public-site dry-run. Do not run public live scraping.
- Local adapter fixture/dev runs are not legal evidence for public-site activation.
- Proposed local-adapter-only config after approval of the adapter source:

```yaml
sourceSlug: kleinanzeigen
maxItems: 5
config:
  baseUrl: http://localhost:8000
  healthPath: /health
  searchPath: /inserate
  detailPath: /inserat/{adid}
  query: wohnung mieten
  city: berlin
  maxPrice: 2000
  maxPages: 1
notifications: disabled
writeMode: dry-run-only
```

## Dry-Run Status

- Status: `blocked`
- Reason: public-site legal/robots approval is missing; current connector is a local adapter scaffold and no source activation guard owner approval was granted for live dry-run.
- Metrics: not collected (`fetched/new/errors` unavailable).

## Activation Recommendation

- Recommendation: `ready` (operator-approved primary beta source, 2026-06-07).
- Rationale: listings are read from the self-hosted `ebay-kleinanzeigen-api` adapter
  (DanielWTE/ebay-kleinanzeigen-api) over the private compose network
  (`http://kleinanzeigen-api:8000`), not by direct public-site HTML scraping from this
  app. The operator has approved this adapter as a primary beta source and accepts the
  associated legal/ToS responsibility for running the adapter. Keep the request rate low
  (`rateLimitRpm<=10`, small `maxPages`).
