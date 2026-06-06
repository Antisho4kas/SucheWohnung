# Source Onboarding Checklist

This checklist is mandatory for every new or promoted source. It applies both to a new connector and to an existing implementation that is not yet runtime-supported or production-approved.

## 1. Research Record

- Create or update `docs/source-research/<slug>.md` before writing production ingestion logic.
- Record research date, source domain, listing URLs, detail URLs, sitemap/API shapes, observed pagination, and sample fields.
- Record whether the source is a direct landlord, marketplace, aggregator, or local adapter.
- Record current recommendation: `implement`, `needs permission`, `blocked`, or `research only`.
- Link to any official API, partner program, public documentation, ToS, privacy policy, and `robots.txt` URLs.

## 2. Legal And Robots Gate

- Prefer official API or written permission over scraping.
- Fetch and review `robots.txt` for all relevant hosts immediately before implementation work.
- Check ToS for scraping, automated access, reuse, caching, and redistribution restrictions.
- Mark the source `needs permission` when useful data comes from undocumented APIs, client-exposed credentials, login/session flows, robots-disallowed paths, or application/tenant portals.
- Do not proceed to production activation when the source is `needs permission` or `blocked` without documented approval.

## 3. Technical Discovery

- Identify the cheapest safe extraction path: sitemap/static HTML first, embedded JSON/JSON-LD second, browser rendering only if required and allowed.
- Avoid fabricating query URLs where pagination includes generated tokens such as `cHash`; discover links from public pages instead.
- Separate listing search/detail pages from contact, application, tenant, login, WBS calculator, or payment flows.
- Define canonical `sourceSlug`, stable `externalId`, canonical URL, required fields, optional attributes, and image/contact handling.
- Document expected rate limits, retry behavior, backoff, and stop conditions on `403`, `429`, CAPTCHA, or challenge pages.

## 4. Implementation Gate

- Add or update a `SourceConnector` implementation with typed config validation.
- Use fixture-based tests for HTML/JSON examples and edge cases such as missing price, sale/commercial listings, malformed details, pagination, and cancellation.
- Keep network access injectable through `ctx.http`; do not hardcode global fetches or unbounded request loops.
- Ensure config rejects disallowed hosts, disallowed paths, API endpoints that should not be used, and invalid ranges before making HTTP requests.
- Keep the source inactive by default in seed/config until dry-run review is complete.

## 5. Data Quality Gate

- Verify normalized listings pass schema validation and quality-gate sanity ranges.
- Map German number/currency formats, warm/cold rent, area, rooms, postal code, city, bundesland, and `provisionfrei` consistently.
- Filter out sale, commercial, storage, parking-only, WBS-only, expired, and non-apartment records unless the product explicitly supports them.
- Treat exact address, coordinates, contact data, images, and raw payload as sensitive operational data.
- Record dedupe risk, especially for aggregator sources that mirror listings from other portals.

## 6. Dry-Run And Activation

- Run a dry-run with low request rate and no user notifications.
- Review fetched count, new/updated count, parse errors, quality rejects, duplicate ratio, HTTP status distribution, and total requests.
- Confirm no disallowed path, application flow, login flow, or contact action was requested.
- Add per-source monitoring for success rate, last success, parse errors, schema drift, and `403`/`429` spikes.
- Activate only after the source owner accepts the legal/robots gate, data quality, monitoring, and rollback plan.

## 7. Rollback Conditions

- Pause the source immediately on legal concern, robots/ToS change, sustained `403`/`429`, CAPTCHA/challenge detection, schema drift causing bad data, duplicate-notification spike, or user-impacting notification errors.
- Keep source-level pause/disable available through admin operations or direct database operation until the admin UI fully supports it.
- Document the pause reason and required re-approval steps in the source research note.
