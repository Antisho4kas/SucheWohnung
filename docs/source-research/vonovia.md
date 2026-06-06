# Vonovia Source Research

Research date: 2026-06-02. Scope: public pages, `robots.txt`, sitemap URLs, and normal public JSON responses available without login. No production connector was written.

## Recommendation

- Status: `needs permission`
- Priority: P1
- Rationale: a public JSON listing endpoint returned apartment records and no `robots.txt` disallow was observed for the list endpoint, but the API is undocumented and production aggregation should get explicit permission.

## Official Domains

- Primary listing/customer domain: `https://www.vonovia.de/`
- Corporate domain linked from site: `https://www.vonovia.com/`
- Listing image CDN observed: `https://cdn.expose.vonovia.de/`
- API host referenced by robots for disallowed PDFs: `https://expose.api.vonovia.de/`

## Confirmed Search And Listing URLs

- `https://www.vonovia.de/zuhause-finden`
- `https://www.vonovia.de/zuhause-finden/immobilien?rentType=miete&bathtub=0&bathwindow=0&bathshower=0&furnished=0&kitchenEBK=0&toiletSeparate=0&disabilityAccess=egal&seniorFriendly=0&lift=0&parking=0&cellar=0&balcony=egal&garden=0&subsidizedHousingPermit=egal&immoType=wohnung&latitude=51.5&longitude=10&geoLocation=1&perimeter=1000&orderBy=price_asc`
- Sample expose URL observed from page links: `https://www.vonovia.de/zuhause-finden/immobilien/schoen-hier-zu-wohnen-87-1249760017`

## Confirmed Endpoints

Listing search JSON for apartments:

```text
https://www.vonovia.de/api/real-estate/list?rentType=miete&bathtub=0&bathwindow=0&bathshower=0&furnished=0&kitchenEBK=0&toiletSeparate=0&disabilityAccess=egal&seniorFriendly=0&lift=0&parking=0&cellar=0&balcony=egal&garden=0&subsidizedHousingPermit=egal&immoType=wohnung&latitude=51.5&longitude=10&geoLocation=1&perimeter=1000&orderBy=price_asc
```

Observed response included `paging.info.count: 1745` and `paging.info.limit: 15`.

Health check observed from page network resources:

- `https://www.vonovia.de/api/HealthCheck`

## Robots Constraints

Robots URL: `https://www.vonovia.de/robots.txt`

Relevant content:

```txt
User-agent: *
Sitemap: https://www.vonovia.de/sitemap.xml
Allow: https://www.vonovia.de/
Disallow: https://expose.api.vonovia.de/api/v1/Public/Pdf/*
```

No disallow rule was observed for `https://www.vonovia.de/zuhause-finden`, `https://www.vonovia.de/zuhause-finden/immobilien`, or `https://www.vonovia.de/api/real-estate/list`. The absolute-URL style in robots is unusual; treat the PDF pattern conservatively as off-limits.

## Sitemap Availability

- `https://www.vonovia.de/sitemap.xml`
- `https://www.vonovia.de/sitemap-1.xml`
- `https://www.vonovia.de/sitemap-2.xml`
- `https://www.vonovia.de/sitemap-3.xml`
- `https://www.vonovia.de/sitemap-4.xml`
- `https://www.vonovia.de/sitemap-custom.xml`
- `https://www.vonovia.de/sitemap-estate-expose.xml`
- `https://www.vonovia.de/sitemap-images.xml`
- `https://www.vonovia.de/sitemap-videos.xml`

`https://www.vonovia.de/sitemap-estate-expose.xml` was public but returned an empty `<urlset>` during research.

## Sample Listing Fields

Observed response shape from the confirmed `https://www.vonovia.de/api/real-estate/list` query listed above:

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

Sample listing values observed:

- `wrk_id`: `1249760017`
- `titel`: `Schön hier zu wohnen.`
- `strasse`: `Hahnemannstr. 20`
- `plz`: `70191`
- `ort`: `Stuttgart OT Nord`
- `preis`: `219`
- `groesse`: `0`
- `anzahl_zimmer`: `1`
- `slug`: `schoen-hier-zu-wohnen-87-1249760017`
- `lat`: `48.8099363`
- `lng`: `9.1837144`
- `preview_img_url`: `https://cdn.expose.vonovia.de/CAMP-Gruenstrom_v5.jpg?width=324&crop=4:3`

## Anti-Bot / JS Risks

- Listing data is served by the confirmed `https://www.vonovia.de/api/real-estate/list` query listed above, an undocumented JSON endpoint used by the public frontend.
- No CAPTCHA, login requirement, or client credential was confirmed for the list endpoint during this pass.
- `https://www.vonovia.de/robots.txt` explicitly disallows `https://expose.api.vonovia.de/api/v1/Public/Pdf/*`; avoid PDF/expose API crawling.
- The estate-expose sitemap was empty during research, so listing discovery depends on the JSON endpoint rather than sitemap detail URLs.

## Risks

- JSON endpoint is public but undocumented; schema and availability can change without notice.
- Robots does not block the list endpoint, but robots allowance is not legal/contractual permission.
- PDF paths under `https://expose.api.vonovia.de/api/v1/Public/Pdf/*` are explicitly disallowed.
- Listing data includes exact addresses and coordinates; handle retention and notification content carefully.
- Pagination beyond default `limit: 15` was not confirmed.
- Contact forms and applicant flows are out of scope.

## Implementation Notes If Permission Is Granted

- Use the public list endpoint at a low rate.
- Avoid PDF and contact/application endpoints.
- Monitor schema drift for `results[]` fields.
- Treat exact address/coordinate data as sensitive operational data.
