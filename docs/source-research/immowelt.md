# Immowelt Source Readiness

Research date: 2026-06-05. Scope: implemented connector readiness, robots evidence, sitemap discovery, live-scraping legal status, and dry-run gate. No live scraping or connector dry-run was run.

## Source Identity

| Field | Value |
| --- | --- |
| Source name | Immowelt |
| Slug | `immowelt` |
| Site URL | `https://www.immowelt.de/` |
| Source type | Marketplace / live public-page scraper in current connector |
| Runtime status | Registered in the default collect registry; seeded inactive |

## Robots And URL Evidence

Robots URL: `https://www.immowelt.de/robots.txt`

Relevant robots rules observed on 2026-06-05:

```txt
User-agent: *
Disallow: /1_Components/
Disallow: /bin/
Disallow: /_Estate/
Disallow: /_Scripts/
Disallow: /*.axd$
Disallow: /*.ashx$
Disallow: /liste/karte
Disallow: /produktauswahl/
Disallow: /buchung/
Disallow: /erfassung/
Disallow: /suchauftrag/
Disallow: /*/GetAnbieterKontaktanfrageForm
Disallow: /expose/*/kontaktanfragegesendet
Disallow: /expose/*/karte
Disallow: /liste/getteaser
Disallow: /liste/getlistitems
Disallow: *bff/*
Disallow: */classified-search?*
Disallow: */classified-map?*
Disallow: /classifiedList/
Sitemap: https://www.immowelt.de/sitemaps/sitemap_index.xml
```

URL verification performed with HEAD/web fetch only, not listing scraping:

| URL | Status | Notes |
| --- | --- | --- |
| `https://www.immowelt.de/` | 403 on HEAD | Treat as anti-bot/access-control signal; do not infer crawl permission. |
| `https://www.immowelt.de/robots.txt` | 200 | Robots fetched. |
| `https://www.immowelt.de/sitemaps/sitemap_index.xml` | 200 | Sitemap URL from robots. |

## Sitemap URLs

- `https://www.immowelt.de/sitemaps/sitemap_index.xml` is listed in robots and returned 200 in URL verification.
- Current connector does not use sitemap discovery; it builds public list URLs.

## Allowed / Disallowed Endpoints

Allowed for research only, subject to legal approval and runtime guard owner approval:

- Public list pages matching `/liste/{city}/wohnungen/mieten` only if legal review approves and robots remain unchanged.
- Embedded JSON in returned public list-page HTML only; no private API calls.

Disallowed or out of scope:

- `/liste/getteaser`, `/liste/getlistitems`, `*bff/*`, `*/classified-search?*`, `*/classified-map?*`, `/classifiedList/`.
- Contact form endpoints, contact-sent pages, map endpoints, booking/product/application/search-agent flows, login/account flows.
- Browser automation or anti-bot bypass.

## Parser Strategy

- Current connector builds `/liste/{city}/wohnungen/mieten` with public query parameters for sort/page/max price.
- It parses embedded `<script type="application/json">` blocks and looks for `estateListModel.estates` or `searchresults.estates`.
- It maps list-level estate data and constructs `/expose/<estateId>` URLs.
- It does not fetch detail pages and must not call disallowed list APIs.

## Data Fields Expected

- Estate ID.
- Constructed expose URL.
- Headline/title.
- Main price.
- Living area.
- Room count.
- City and postal code.
- Description when included in embedded data.
- Images are currently empty in the connector.

## Anti-Bot / JS Risks

- Site root returned 403 for HEAD during this research pass.
- Current parser depends on embedded JSON shape without an official API contract.
- Robots explicitly disallows common list API/BFF/classified endpoints, so connector must stay public-page-only.
- Live scraping/legal status is not approved; do not attempt to bypass CDN, challenge, or access controls.

## Legal / ToS Risk Summary

- Public list path is not explicitly disallowed by the observed robots rules, but related list APIs/BFF/classified endpoints are disallowed.
- Robots allowance is not legal permission to collect, store, or reuse listings.
- Live scraping approval is not documented for this project.
- Base HEAD 403 and undocumented embedded-data parsing raise operational and legal risk.

## Recommended Rate Limit

- Public-site rate: `0` until legal approval and dry-run authorization exist.
- If later approved for dry-run: maximum 2 requests per minute, `maxPages=1`, `maxItems<=3`, `pageDelayMs>=5000`.
- Stop immediately on 403, 429, CAPTCHA/challenge, missing embedded data, or any redirect into disallowed endpoints.

## Dry-Run Command / Config

- Command: none approved. Do not run live scraping until the source activation guard owner approves a dry-run.
- Current admin manual run is not a dry-run and requires an active, approved source; do not use it for this gate.
- Proposed low-rate config only after explicit approval:

```yaml
sourceSlug: immowelt
maxItems: 3
config:
  baseUrl: https://www.immowelt.de
  searchPath: /liste/{city}/wohnungen/mieten
  city: ingolstadt
  maxPrice: 800
  maxPages: 1
  pageDelayMs: 5000
  userAgent: SucheWohnung/1.0
notifications: disabled
writeMode: dry-run-only
```

## Dry-Run Status

- Status: `blocked`
- Reason: live scraping legal approval is missing, site root returned 403 on HEAD, and no source activation guard owner approval was granted for live dry-run.
- Metrics: not collected (`fetched/new/errors` unavailable).

## Activation Recommendation

- Recommendation: `blocked`
- Rationale: current connector is a live public-page scraper with no legal approval or dry-run evidence, and access-control/anti-bot risk is visible. Keep disabled until legal approval, explicit dry-run approval, and parser metrics exist.
