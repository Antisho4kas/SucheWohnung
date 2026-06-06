# LEG Wohnen Source Readiness

Research date: 2026-06-05. Scope: implemented connector readiness, robots evidence, sitemap discovery, and dry-run gate. No live scraping or connector dry-run was run.

## Source Identity

| Field | Value |
| --- | --- |
| Source name | LEG Wohnen |
| Slug | `leg-wohnen` |
| Site URL | `https://www.leg-wohnen.de/` |
| Source type | Direct landlord |
| Runtime status | Registered in the default collect registry; seeded inactive |

## Robots And URL Evidence

Robots URL: `https://www.leg-wohnen.de/robots.txt`

Relevant robots rules observed on 2026-06-05:

```txt
Sitemap: https://leg-wohnen.de/sitemap.xml
User-agent: *
Disallow: /typo3/
Disallow: /typo3_src/
Allow: /typo3/sysext/frontend/Resources/Public/*
Allow: /typo3conf/ext/sg_sitepackage/Resources/Public/*
```

URL verification performed with HEAD/web fetch only, not listing scraping:

| URL | Status | Notes |
| --- | --- | --- |
| `https://www.leg-wohnen.de/` | 200 | Site URL reachable. |
| `https://www.leg-wohnen.de/robots.txt` | 200 | Robots fetched. |
| `https://leg-wohnen.de/sitemap.xml` | 200 | Sitemap URL from robots. |

## Sitemap URLs

- `https://leg-wohnen.de/sitemap.xml` is listed in robots and returned 200 in URL verification.
- Current connector starts from `/sitemap.xml`, discovers sitemap entries whose query parameter `sitemap=wohnungen`, then reads apartment detail URLs from those sitemaps.

## Allowed / Disallowed Endpoints

Allowed for beta dry-run candidate, subject to legal approval and runtime guard owner approval:

- `/sitemap.xml` and discovered sitemap entries for apartment inventory.
- Public detail pages under `/immobilien/detail/*`.

Disallowed or out of scope:

- `/typo3/` and `/typo3_src/` are explicitly disallowed.
- Contact, application, tenant-account, appointment, and form submission flows.
- Any endpoint requiring login, session, or credentials.

## Parser Strategy

- Use sitemap-first discovery instead of generating broad search queries.
- Filter discovered sitemaps to apartment inventory (`sitemap=wohnungen`).
- Fetch public detail pages under `/immobilien/detail/*`.
- Parse with Cheerio from canonical link, meta tags, detail facts, address metadata, description, availability, and gallery image links.
- Filter non-apartment pages such as parking/garage pages.

## Data Fields Expected

- External ID from `/immobilien/detail/<id>`.
- Canonical detail URL.
- Title.
- Cold rent and warm rent where present.
- Living area.
- Room count.
- City and postal code.
- Availability.
- Description.
- Image URLs.
- Attributes: availability, balcony, terrace, elevator, cellar, parking, `provisionfrei=true`.

## Anti-Bot / JS Risks

- Direct-landlord sitemap/detail route is the lowest-risk implemented real-source path found so far.
- Detail pages may include contact or application widgets; those must not be automated.
- Sitemaps may include parking or non-apartment detail pages; connector must keep filtering.
- Current connector uses public HTML and does not require browser automation.

## Legal / ToS Risk Summary

- Robots does not disallow sitemap or public detail pages used by the connector.
- Robots allowance is not legal permission to collect, store, or reuse listings.
- Direct-landlord source reduces cross-source dedupe risk and avoids marketplace account/contact surfaces.
- ToS/legal approval is still not documented; beta dry-run requires approval by source activation guard owner and legal owner.

## Recommended Rate Limit

- Beta dry-run candidate rate: maximum 6 requests per minute, `maxPages=1`, `maxItems<=5`, and `rateLimitMs>=1000`.
- Production-like polling should stay inactive until dry-run metrics and legal approval are recorded.
- Stop immediately on 403, 429, CAPTCHA/challenge, unexpected login gate, or sustained parse errors.

## Dry-Run Command / Config

- Command: none run. Live dry-run requires source activation guard owner approval first.
- Current admin manual run is not a dry-run and requires an active, approved source; do not use it for this gate.
- Proposed first dry-run config after approval:

```yaml
sourceSlug: leg-wohnen
maxItems: 5
config:
  baseUrl: https://www.leg-wohnen.de
  sitemapIndexPath: /sitemap.xml
  city: Mönchengladbach
  minRooms: 1
  maxRooms: 4
  maxPages: 1
  rateLimitMs: 1000
  userAgent: SucheWohnung/1.0
notifications: disabled
writeMode: dry-run-only
```

## Dry-Run Status

- Status: `not run`
- Reason: this source is the recommended beta candidate, but no guard-owner approval was granted in this task.
- Metrics: not collected (`fetched/new/errors` unavailable).

## Activation Recommendation

- Recommendation: `beta`
- Rationale: registered connector, direct-landlord source, sitemap/detail strategy, and robots evidence make LEG the best first beta candidate. Activation is still blocked until legal approval and low-rate dry-run evidence are recorded.
