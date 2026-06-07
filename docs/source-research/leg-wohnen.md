# LEG Wohnen Source Readiness

Research date: 2026-06-05. Dry-run executed 2026-06-07 (low-rate, isolated staging DB). Scope: implemented connector readiness, robots evidence, sitemap discovery, dry-run gate, and a completed low-rate real-source dry-run with a critical parser bug found and fixed.

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

- Runner: `services/worker/src/dry-run.ts` (built to `dist/dry-run.js`). It reuses the
  tested `runCollectJob` with a NO-OP match queue (so `match`/`notify` are never
  enqueued and no notification can be produced), writes only to an isolated
  database whose name must contain `dryrun`, and runs N times to check dedup.
- Executed 2026-06-07 on the staging VPS against isolated DB `suchewohnung_dryrun`
  (schema cloned from the live schema; PostGIS via `template_postgis`). The live
  `suchewohnung` database and the running collect/match/notify workers were not
  touched.
- Config used:

```yaml
sourceSlug: leg-wohnen
config:
  baseUrl: https://www.leg-wohnen.de
  sitemapIndexPath: /sitemap.xml
  city: Wilhelmshaven      # first apartment available near the front of the wohnungen sitemap
  maxPages: 1
  itemsPerRun: 1
  rateLimitMs: 1000
  userAgent: SucheWohnung/1.0
notifications: disabled    # enforced structurally via no-op match queue
writeMode: isolated-dry-run-db
runs: 2                    # second run verifies dedup
```

## Dry-Run Status

- Status: `completed` (2026-06-07, low-rate, isolated DB).
- Endpoints requested: `/sitemap.xml`, one `?sitemap=wohnungen` sitemap, and public
  `/immobilien/detail/*` pages. All returned HTTP 200. No login, contact,
  application, or form endpoints were requested.
- Metrics:
  - Run 1: status `success`, itemsFetched 1, itemsNew 1, itemsUpdated 0, errors 0.
  - Run 2: status `success`, itemsFetched 1, itemsNew 0, itemsUpdated 1, errors 0.
  - No duplicate flood: total listings in DB stayed at 1 across both runs.
- Sample listing (passed quality gate, `status=active`):
  - externalId `5117-1022-M`, url `/immobilien/detail/5117-1022-M`
  - title "2-Zimmer-Wohnung in Wilhelmshaven-Heppens mieten"
  - city Wilhelmshaven, postalCode 26384, rooms 2, area 65.88 m²
  - cold rent (price) 415 €, warmRent not present on this listing
  - images 10, attributes `{ provisionfrei: true }`

## Critical Parser Bug Found And Fixed During Dry-Run

- Symptom: the connector collected 0 listings from the live site and scanned
  hundreds of detail pages without yielding.
- Root cause: `isNonApartmentPage` tested the whole page HTML for
  `/immobilien/(stellplaetze-garagen|parken)`. The site's global navigation links
  to those parking categories on every page, so every detail page (including real
  apartments) was misclassified as a parking page and dropped. Fixture tests
  passed because the fixtures had no site navigation.
- Fix: parking is now detected from the listing's own title/body and the
  page-scoped `<!-- parken -->` marker; the whole-HTML category-path match was
  removed. A regression test (apartment page carrying parking-category nav links)
  was added. All connector tests pass.

## Known Limitations / Follow-ups

- The wohnungen sitemap mixes apartments and parking listings across all of
  Germany (1000 entries per sitemap page). With an exact single-city filter and
  `maxPages=1`, the connector performs a linear scan and may fetch many
  non-matching detail pages before finding matches for a sparse city. Before broad
  activation, add a per-run scan budget and/or city-scoped discovery to bound
  request volume.
- warmRent coverage varies per listing (cold rent is present; warm rent may be
  absent).

## Activation Recommendation

- Recommendation: `beta` once the parser fix is merged, with a bounded scan budget
  and legal/ToS sign-off still required before enabling in production.
- Rationale: with the fix, the connector collects valid, quality-gated apartment
  listings from public sitemap/detail pages at low rate, dedup holds across runs,
  and no disallowed endpoints are touched. Activation remains gated on documented
  legal/ToS approval and a scan-volume safeguard.
