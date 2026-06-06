# Wohnungsboerse.net Source Readiness

Research date: 2026-06-05. Scope: implemented connector readiness, robots evidence, sitemap discovery, and dry-run gate. No live scraping or connector dry-run was run.

## Source Identity

| Field | Value |
| --- | --- |
| Source name | Wohnungsboerse.net |
| Slug | `wohnungsboerse` |
| Site URL | `https://www.wohnungsboerse.net/` |
| Source type | Marketplace / listing portal |
| Runtime status | Exported and seeded inactive; not registered in the default collect registry |

## Robots And URL Evidence

Robots URL: `https://www.wohnungsboerse.net/robots.txt`

Relevant robots rules observed on 2026-06-05:

```txt
User-agent: *
Allow: /estates/
Allow: /rentalsuits/ajax_city
Allow: /rentalsuits/
Disallow: /pages/ajax_sendbetabox
Disallow: /geocode
Disallow: /searches/index/rss:1/
Disallow: /searches/ajax_getDistricts
Disallow: /searches/ajax_save_search
Disallow: /renter_profile/
Disallow: /addPageRating/
Disallow: /ajax_addZanoxClick/
Disallow: /estates/ajax_addZanoxClick/
Disallow: /countGmaps
```

URL verification performed with HEAD/web fetch only, not listing scraping:

| URL | Status | Notes |
| --- | --- | --- |
| `https://www.wohnungsboerse.net/` | 200 | Site URL reachable. |
| `https://www.wohnungsboerse.net/robots.txt` | 200 | Robots fetched. |
| `https://www.wohnungsboerse.net/sitemap.xml` | 200 | Sitemap URL exists, although no sitemap directive was observed in robots output. |

## Sitemap URLs

- `https://www.wohnungsboerse.net/sitemap.xml` returned 200 in URL verification.
- The implemented connector currently uses public search HTML, not sitemap discovery.

## Allowed / Disallowed Endpoints

Allowed for research only, subject to legal approval and runtime guard owner approval:

- Public HTML search path `/searches/index` with normal listing query parameters.
- Public detail pages under `/immodetail/*`.
- Public estate content under `/estates/` when linked from public pages.

Disallowed or out of scope:

- `/searches/index/rss:1/` is explicitly disallowed; do not use RSS extraction.
- `/searches/ajax_getDistricts` and `/searches/ajax_save_search` are explicitly disallowed; do not use AJAX search-helper or save-search endpoints.
- `/pages/ajax_sendbetabox`, `/geocode`, `/renter_profile/`, rating/click counters, contact/inquiry/application/login flows.

## Parser Strategy

- Use public HTML search page `/searches/index` only.
- Query only normal public listing parameters such as `marketing_type=miete`, `estate_types[0]=1`, `term`, `page`, price, and rooms.
- Parse search-result cards for detail URL, ID, title, location, rent, area, rooms, badges, and images.
- Fetch public `/immodetail/*` detail pages for schema.org `Apartment` data, canonical URL, address, description, facts, and images.
- Avoid all disallowed AJAX/RSS endpoints.

## Data Fields Expected

- External ID from `/immodetail/<id>` or card class.
- Canonical detail URL.
- Title.
- Cold rent and warm rent.
- Living area.
- Room count.
- City, district, postal code, street/address when present.
- Description.
- Images.
- Attributes: district, street, address, balcony, terrace, elevator, parking, cellar, furnished, pets_allowed, new_building, provisionfrei.

## Anti-Bot / JS Risks

- Search result markup may depend on AJAX-rendered containers, but connector must only read public returned HTML.
- Robots explicitly blocks several AJAX and RSS endpoints; accidental use must be treated as a hard stop.
- Marketplace listing/contact flows can expose renter/applicant surfaces; do not automate them.
- The connector is not in the default runtime registry, so live use needs additional runtime wiring and gate review.

## Legal / ToS Risk Summary

- Public search/detail paths are not explicitly disallowed in the observed robots rules, but RSS/AJAX helpers are disallowed.
- Robots allowance is not legal permission to collect, store, or reuse listings.
- ToS/legal approval is not documented for this project.
- Production or beta activation is not approved until legal review and dry-run metrics confirm safe public HTML-only behavior.

## Recommended Rate Limit

- Research-only dry-run candidate rate: maximum 4 requests per minute, `maxPages=1`, `maxItems<=5`, and `pageDelayMs>=2000`.
- Stop immediately on 403, 429, CAPTCHA/challenge, AJAX/RSS drift, or contact/login flow exposure.

## Dry-Run Command / Config

- Command: none approved. Do not run live scraping until the source activation guard owner approves a dry-run.
- Current admin manual run is not a dry-run and requires an active, approved source; do not use it for this gate.
- Proposed low-rate config after approval:

```yaml
sourceSlug: wohnungsboerse
maxItems: 5
config:
  baseUrl: https://www.wohnungsboerse.net
  searchPath: /searches/index
  city: Berlin
  minPrice: 500
  maxPrice: 1800
  minRooms: 1
  maxRooms: 4
  maxPages: 1
  pageDelayMs: 2000
  userAgent: SucheWohnung/1.0
notifications: disabled
writeMode: dry-run-only
```

## Dry-Run Status

- Status: `blocked`
- Reason: not registered in the default runtime registry, legal approval is missing, and no source activation guard owner approval was granted for live dry-run.
- Metrics: not collected (`fetched/new/errors` unavailable).

## Activation Recommendation

- Recommendation: `disabled`
- Rationale: public HTML route exists, but robots-disallowed AJAX/RSS endpoints must be avoided, ToS/legal approval is missing, runtime wiring is absent, and dry-run evidence is missing.
