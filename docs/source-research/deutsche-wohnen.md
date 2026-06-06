# Deutsche Wohnen Source Research

Research date: 2026-06-02. Scope: public pages, `robots.txt`, sitemap URLs, and normal public JSON responses available without login. No production connector was written.

## Recommendation

- Status: `needs permission`
- Priority: P1 for Berlin, P2 after Vonovia if national coverage is the main goal
- Rationale: a public JSON listing endpoint returned Berlin apartment records and no `robots.txt` disallow was observed, but the endpoint is undocumented and should be permission-gated before production aggregation.

## Official Domains

- Primary listing/customer domain: `https://www.deutsche-wohnen.com/`
- Investor relations domain linked from site: `https://ir.deutsche-wohnen.com`
- Parent/corporate domain linked from site: `https://www.vonovia.com/`
- Listing image CDN observed: `https://cdn.expose.vonovia.de/`

## Confirmed Search And Listing URLs

- `https://www.deutsche-wohnen.com/mieten/zuhause-mieten`
- `https://www.deutsche-wohnen.com/mieten/mietangebote`
- `https://www.deutsche-wohnen.com/mieten/mietangebote?rentType=miete&city=Berlin&lift=0&parking=0&cellar=0&immoType=wohnung&minRooms=Beliebig&floor=Beliebig&bathtub=0&bathwindow=0&bathshower=0&furnished=0&kitchenEBK=0&toiletSeparate=0&disabilityAccess=egal&seniorFriendly=0&balcony=egal&garden=0&subsidizedHousingPermit=egal&scroll=true`

## Confirmed Endpoints

Listing search JSON for Berlin apartments:

```text
https://www.deutsche-wohnen.com/api/deuwo-real-estate/list?rentType=miete&city=Berlin&lift=0&parking=0&cellar=0&immoType=wohnung&minRooms=Beliebig&floor=Beliebig&bathtub=0&bathwindow=0&bathshower=0&furnished=0&kitchenEBK=0&toiletSeparate=0&disabilityAccess=egal&seniorFriendly=0&balcony=egal&garden=0&subsidizedHousingPermit=egal
```

Observed response included `paging.info.count: 27` and `paging.info.limit: 15`.

Geo query variant:

```text
https://www.deutsche-wohnen.com/api/deuwo-real-estate/list?rentType=miete&bathtub=0&bathwindow=0&bathshower=0&furnished=0&kitchenEBK=0&toiletSeparate=0&disabilityAccess=egal&seniorFriendly=0&lift=0&parking=0&cellar=0&balcony=egal&garden=0&subsidizedHousingPermit=egal&immoType=wohnung&latitude=52.52&longitude=13.405&geoLocation=1&perimeter=1000&orderBy=price_asc
```

Health check:

- `https://www.deutsche-wohnen.com/api/HealthCheck`

The listing page HTML exposed `data-api-real-estate-list="/api/deuwo-real-estate/list"`. The analogous Vonovia path on this domain, `https://www.deutsche-wohnen.com/api/real-estate/list`, returned `404`; do not use it for Deutsche Wohnen.

## Robots Constraints

Robots URL: `https://www.deutsche-wohnen.com/robots.txt`

Relevant content:

```txt
User-agent: *
Sitemap: https://www.deutsche-wohnen.com/sitemap.xml
```

No `Disallow` lines were present in the fetched robots file. No restriction was observed for `/mieten/mietangebote` or `/api/deuwo-real-estate/list`. The listing search HTML contained `meta name="robots" content="noindex, follow"`, which is indexing guidance rather than a crawl block.

## Sitemap Availability

- `https://www.deutsche-wohnen.com/sitemap.xml`
- `https://www.deutsche-wohnen.com/sitemap-1.xml`
- `https://www.deutsche-wohnen.com/sitemap-estate-expose.xml`
- `https://www.deutsche-wohnen.com/sitemap-images.xml`
- `https://www.deutsche-wohnen.com/sitemap-videos.xml`

`https://www.deutsche-wohnen.com/sitemap-estate-expose.xml` was public but returned an empty `<urlset>` during research.

## Sample Listing Fields

Observed response shape from the confirmed `https://www.deutsche-wohnen.com/api/deuwo-real-estate/list` queries listed above:

- `paging.info.count`
- `paging.info.limit`
- `results[].wrk_id`
- `results[].titel`
- `results[].strasse`
- `results[].plz`
- `results[].ort`
- `results[].preis`
- `results[].groesse`
- `results[].anzahl_zimmer`
- `results[].preview_img_url`
- `results[].imageUrls`
- `results[].slug`
- `results[].vermarktungsart_kauf`
- `results[].vermarktungsart_miete`
- `results[].is_on_favlist`
- `results[].object_viewed`
- `results[].tour_link_360`
- `results[].has_grundriss`
- `results[].lat`
- `results[].lng`

Sample values observed:

- `wrk_id`: `1465170044`
- `titel`: `Wohnen ab 55 Jahren: Seniorenwohnung im Dachgeschoss mit Wintergarten`
- `strasse`: `Am Rohrgarten 89`
- `plz`: `14163`
- `ort`: `Berlin OT Zehlendorf`
- `preis`: `833.88`
- `groesse`: `61.36`
- `anzahl_zimmer`: `2`
- `slug`: `wohnen-ab-55-jahren-seniorenwohnung-im-dachgeschoss-mit-wintergarten-89-1465170044`
- `has_grundriss`: `true`
- `lat`: `52.4264588`
- `lng`: `13.2264512`
- `preview_img_url`: `https://cdn.expose.vonovia.de/VNA-06d4069f-243f-4736-b643-283ac3313cee.jpg?width=324&crop=4:3`

## Anti-Bot / JS Risks

- Listing data is served by the confirmed `https://www.deutsche-wohnen.com/api/deuwo-real-estate/list` queries listed above, an undocumented JSON endpoint exposed through the public page HTML as `data-api-real-estate-list="/api/deuwo-real-estate/list"`.
- No CAPTCHA, login requirement, or client credential was confirmed for the list endpoint during this pass.
- The search page contained `meta name="robots" content="noindex, follow"`; this is not a robots block, but it is a signal not to index the search page.
- The estate-expose sitemap was empty during research, so listing discovery depends on the JSON endpoint rather than sitemap detail URLs.

## Risks

- Endpoint is public but undocumented and may change with the frontend platform.
- Search page is marked `noindex, follow`; not a crawl block, but indicates search-engine indexing is not desired.
- Robots has no disallows, but that is not explicit permission for production aggregation.
- Scope is Berlin-heavy; useful for Berlin coverage but lower national breadth than Vonovia.
- Listing data includes exact addresses, coordinates, and shared CDN images.
- No listing detail endpoint or pagination contract was confirmed beyond the default `limit: 15` list response.
- Contact forms and applicant flows should remain out of scope.

## Implementation Notes If Permission Is Granted

- Implement as a separate Deutsche Wohnen source using `/api/deuwo-real-estate/list`, not Vonovia's `/api/real-estate/list` path.
- Use low-rate polling and monitor schema drift.
- Avoid contact/application flows and PDFs.
