# WG-Gesucht Source Readiness

Research date: 2026-06-05. Scope: implemented connector readiness, robots evidence, sitemap discovery, and dry-run gate. No live scraping or connector dry-run was run.

## Source Identity

| Field | Value |
| --- | --- |
| Source name | WG-Gesucht |
| Slug | `wg-gesucht` |
| Site URL | `https://www.wg-gesucht.de/` |
| Source type | Marketplace / shared-flat and apartment listings |
| Runtime status | Exported and seeded inactive; not registered in the default collect registry |

## Robots And URL Evidence

Robots URL: `https://www.wg-gesucht.de/robots.txt`

Relevant robots rules observed on 2026-06-05:

```txt
User-agent: *
Allow: /.well-known/assetlinks.json
Allow: /sitemaps/
Sitemap: https://www.wg-gesucht.de/sitemaps/sitemap.xml
Disallow: /angebot-bearbeiten.html
Disallow: /gesuch-bearbeiten.html
Disallow: /eintrag-loeschen.html
Disallow: /nachricht-senden.html
Disallow: /qs.php
Disallow: /userdata.php
Disallow: /api/
Disallow: /security-information.html
Disallow: /agb.html
```

URL verification performed with HEAD/web fetch only, not listing scraping:

| URL | Status | Notes |
| --- | --- | --- |
| `https://www.wg-gesucht.de/robots.txt` | 200 | Robots fetched. |
| `https://www.wg-gesucht.de/sitemaps/sitemap.xml` | 200 | Sitemap URL from robots. |
| `https://www.wg-gesucht.de/` | 503 on HEAD | Treat as anti-bot/load-protection signal; do not infer crawl permission. |

## Sitemap URLs

- `https://www.wg-gesucht.de/sitemaps/sitemap.xml` is listed in robots and returned 200 in URL verification.
- Sitemap paths under `/sitemaps/` are allowed by robots.

## Allowed / Disallowed Endpoints

Allowed for research only, subject to legal approval and runtime guard owner approval:

- Public search/listing HTML paths such as `/wohnungen-in-<city>...html` and `/wg-zimmer-in-<city>...html` when not under a disallowed path.
- Public JSON-LD embedded in public HTML pages.
- Sitemap discovery under `/sitemaps/`.

Disallowed or out of scope:

- `/api/` is explicitly disallowed. Do not use WG-Gesucht API endpoints.
- `/nachricht-senden.html`, edit/delete pages, user data, login/account, contact, application, or message flows.
- `/agb.html` is robots-disallowed; legal review should be performed manually or through approved channels, not crawler fetches.

## Parser Strategy

- Use public search HTML only.
- Extract JSON-LD `ItemList` entries from public pages.
- Do not call `/api/`, private JSON endpoints, account pages, or message/contact flows.
- Current connector maps title, canonical URL, external ID, price, rooms, city, postal code, address, images, date, and rent type flags from JSON-LD/text.

## Data Fields Expected

- External ID from `identifier` or listing URL.
- Detail URL.
- Title/headline.
- Price or rent from JSON-LD offers or text fallback.
- Room count, city, postal code, address when present.
- Description.
- Images.
- Date posted when present.
- Attributes: `wg`, `apartment`, `sublet`, `rent_type`, balcony, terrace, elevator, parking, furnished.

## Anti-Bot / JS Risks

- Site root returned 503 for a HEAD check during this research pass.
- Public pages may use bot/load protection; no bypass is allowed.
- JSON-LD can disappear or change without API versioning.
- WG-room, sublet, and apartment inventory is mixed; parser must avoid notifying unsupported records if product scope narrows.

## Legal / ToS Risk Summary

- Robots allows sitemap paths but explicitly disallows `/api/` and several account/message/edit paths.
- Robots allowance is not legal permission to collect, store, or reuse listings.
- ToS/legal approval is not documented for this project.
- Production or beta activation is not approved until legal review confirms public search JSON-LD usage is acceptable.

## Recommended Rate Limit

- Research-only dry-run candidate rate: maximum 5 requests per minute, `maxPages=1`, `maxItems<=5`, and `pageDelayMs>=2000`.
- Stop immediately on 403, 429, CAPTCHA/challenge, or repeated 5xx.

## Dry-Run Command / Config

- Command: none approved. Do not run live scraping until the source activation guard owner approves a dry-run.
- Current admin manual run is not a dry-run and requires an active, approved source; do not use it for this gate.
- Proposed low-rate config after approval:

```yaml
sourceSlug: wg-gesucht
maxItems: 5
config:
  searchPaths:
    - /wohnungen-in-Ingolstadt.65.2.1.0.html
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
- Rationale: viable public-search research path exists, but `/api/` is disallowed, ToS/legal approval is missing, runtime wiring is absent, and dry-run evidence is missing.
