# TAG Wohnen Source Research

Research date: 2026-06-02. Scope: public pages, `robots.txt`, sitemaps, and normal browser-observed network requests. No production connector was written.

## Recommendation

- Status: `needs permission`
- Priority: P1 if permission is granted; P3 without permission
- Rationale: the public site exposes the structured fields listed below, but the useful API is reached with a client-exposed Basic Authorization header and the search `robots.txt` is unusually specific about allowed and disallowed query variants.

## Official Domains

- `https://www.tag-wohnen.de/`
- `https://tag-wohnen.de/`
- Listing API host observed from public page traffic: `https://immo.tag-wohnen.de/`

## Confirmed Search And Listing URLs

- `https://www.tag-wohnen.de/immosuche`
- `https://tag-wohnen.de/immosuche`
- `https://tag-wohnen.de/immosuche?filters%5Bproperty_city%5D[]=Chemnitz&size=10&view=LIST`
- `https://tag-wohnen.de/immosuche?filters%5Bproperty_city%5D[]=Salzgitter&size=10&view=LIST`
- `https://tag-wohnen.de/immosuche?filters%5Bproperty_city%5D[]=Gera&size=10&view=LIST`
- `https://tag-wohnen.de/immosuche?filters%5Bproperty_city%5D[]=Merseburg&size=10&view=LIST`
- `https://tag-wohnen.de/immosuche?filters%5Bproperty_city%5D[]=Halle%20%28Saale%29&size=10&view=LIST`
- Detail URL pattern confirmed from public search results: `https://tag-wohnen.de/immosuche/expose?object_id=3524/50571/1009`

## Confirmed Endpoints

- `https://immo.tag-wohnen.de/properties`
- `https://immo.tag-wohnen.de/properties?size=10&view=LIST`
- `https://immo.tag-wohnen.de/properties/3524%2F50571%2F1009`
- `https://immo.tag-wohnen.de/properties/3524%2F50571%2F1009/similar?size=3`

Important constraint: browser requests to `https://immo.tag-wohnen.de/` included a client-exposed `Authorization: Basic ...` header. The credential value is intentionally not recorded. Treat the API as permission-sensitive even though it is discoverable from a public page.

## Robots Constraints

Robots URL:

- `https://www.tag-wohnen.de/robots.txt`
- `https://tag-wohnen.de/robots.txt`
- `https://immo.tag-wohnen.de/robots.txt`

Relevant rules observed on the website host:

```txt
User-agent: *
disallow: /typo3/
disallow: /typo3_src/
disallow: /*fittings
disallow: /*price
disallow: /*living_space
disallow: /*rooms

allow: /typo3/sysext/frontend/Resources/Public/*
allow: /immosuche?filters[property_city][]=Aachen&rooms[max]=1&rooms[min]=1&size=10&view=LIST
```

The fetched file includes many additional explicit `allow` entries for exact city/search URLs. The relevant constraint is that it broadly disallows URLs containing `fittings`, `price`, `living_space`, and `rooms`. Crawl only plain `/immosuche` and sitemap-listed allowed search URLs unless TAG grants explicit permission for broader query crawling.

The API host `https://immo.tag-wohnen.de/robots.txt` returned only a documentation comment and no explicit disallow. Permission risk still comes from the Basic auth gate.

## Sitemap Availability

- `https://tag-wohnen.de/sitemap.xml`
- `https://tag-wohnen.de/sitemaps/pages/sitemap.xml`
- `https://tag-wohnen.de/sitemaps/immo/sitemap.xml`

The immo sitemap lists city-level search URLs, including Chemnitz, Salzgitter, Gera, Merseburg, Doebeln, Magdeburg, Neubrandenburg, Goerlitz, Schwerin, Halle, Brandenburg, and Dessau-Rosslau variants.

## Sample Listing Fields

Search endpoint fields observed:

- `title`
- `fittings`
- `clusters`
- `number_of_rooms`
- `living_space`
- `overall_space`
- `overall_warm`
- `netto_cold`
- `address`
- `id`
- `image_url`
- `image_title`
- `panorama`
- `geo_location`
- `email`
- `preservation_order`
- `extrnal_updated_at`

Search metadata and aggregations observed:

- `meta.hits`
- `meta.aggs.property_city`
- `meta.aggs.usage`
- `meta.aggs.fittings`
- `meta.price`
- `meta.living_space`
- `meta.rooms`
- `meta.viewport`

Detail endpoint fields observed:

- `id`
- `usage`
- `title`
- `street`
- `property_zip`
- `property_city`
- `property_type`
- `level`
- `year_of_construction`
- `object_state`
- `heating_cost`
- `deposit_text`
- `contact`
- `description`
- `location_description`
- `features_description`
- `additional_information`
- `available_from`
- `lat`
- `lng`
- `number_of_rooms`
- `living_space`
- `overall_warm`
- `netto_cold`
- `additional_cost`
- `privision_fees`
- `energy_*`
- `groundplans`
- `panorama`
- `pictures`

Sample values observed:

- `title`: `Neu sanierte 3-Zimmerwohnung - EG rechts`
- `address`: `Apoldaer Straße 1B, 06116 Halle (Saale)`
- `id`: `3524/50571/1009`
- `overall_warm`: `740.0`
- `netto_cold`: `514.0`
- `number_of_rooms`: `3.0`
- `living_space`: `75.57`
- `geo_location`: `51.49418,12.00654`
- `extrnal_updated_at`: `2026-06-02T17:36:49.695Z`

## Anti-Bot / JS Risks

- The public search UI depends on `https://immo.tag-wohnen.de/properties` for structured records rather than exposing all listing records in static HTML.
- The `https://immo.tag-wohnen.de/` requests observed from the public page included `Authorization: Basic ...`; the value is intentionally not recorded and must not be reused without permission.
- `https://tag-wohnen.de/robots.txt` disallows common query filters such as `/*price`, `/*living_space`, `/*rooms`, and `/*fittings`; automated query expansion is a robots risk.
- No CAPTCHA was confirmed during this pass, but the API-auth requirement is enough to mark production use as permission-gated.

## Risks

- Public page uses an API with a client-exposed Basic auth header; do not embed or reuse the observed credential without explicit permission.
- Robots rules include broad disallows for common search filter parameters.
- The API is permission-sensitive because public-page access includes an Authorization header and the API contract is not documented as a public integration interface.
- Detail data may expose contact data; minimize collection to listing metadata only.
- `object_id` values contain slashes and require URL encoding in API paths.

## Implementation Notes If Permission Is Granted

- Prefer sitemap-listed city search URLs for discovery.
- Use low-rate polling and avoid query variants disallowed by robots unless explicitly allowed.
- Do not store the public-page Basic credential in source control.
- Avoid contact/application flows.
