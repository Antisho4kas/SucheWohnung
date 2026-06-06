# GESOBAU Source Research

Research date: 2026-06-02. Scope: public pages, `robots.txt`, sitemap URLs, and normal browser-observed network requests. No production connector was written.

## Recommendation

- Status: `implement`
- Priority: P1
- Rationale: listing search and detail pages are public, not disallowed by `robots.txt`, server-rendered enough for HTML fallback, and expose a public JSON response without observed authentication.

## Official Domains

- `https://www.gesobau.de/`
- Public tenant/service app link observed but not used for listing ingestion: `https://berlin.gesobau.de/`
- Application partner host observed on detail pages: `https://tenant.immomio.com/`

## Confirmed Search And Listing URLs

- `https://www.gesobau.de/mieten/wohnungssuche/`
- `https://www.gesobau.de/mieten/wohnungssuche/detailseite/zossener-strasse-10-03243-00016-1276-55a549d7-2fee-46b2-8500-d171fce189e0/`
- `https://www.gesobau.de/mieten/wohnungssuche/detailseite/lion-feuchtwanger-strasse-10-03239-00004-1093-532cba63-cc08-4563-80d7-aeabaf988ee2/`
- `https://www.gesobau.de/mieten/wohnungssuche/detailseite/roedernallee-10-00983-00010-1061-17b07065-18c5-4edd-ac47-116cf18d9f71/`
- `https://www.gesobau.de/mieten/wohnungssuche/detailseite/senftenberger-ring-10-00855-00003-0193-0396c9e2-5763-4abe-9863-646d2f47abd3/`
- `https://www.gesobau.de/mieten/wohnungssuche/detailseite/senftenberger-ring-10-00855-00001-0027-c503b64c-6e96-4092-9cf2-e2e0f0900205/`

## Confirmed Endpoints

Browser-observed public JSON endpoint from the search page:

```text
https://www.gesobau.de/mieten/wohnungssuche/?resultsPerPage=10000&resultsPage=0&resultAsJSON=1&befilter%5B0%5D=nutzungsart_stringS%3AWOHNEN&befilter%5B1%5D=kanal_stringM%3A%28%22Service%22+OR+%22Senioren+Kachel%22+OR+%22Bestand%22+OR+%22Studierende%22+OR+%22Neubau+Kachel%22%29
```

No separate authenticated listing API was observed. The page also renders listing content in HTML, so HTML fallback is viable.

## Robots Constraints

Robots URL: `https://www.gesobau.de/robots.txt`

Relevant content:

```txt
User-agent: *
Disallow: /typo3/
Disallow: /typo3_src/
Allow: /typo3/sysext/frontend/Resources/Public/*
Sitemap: https://www.gesobau.de/sitemap.xml
```

`/mieten/wohnungssuche/`, query-based JSON output, and detail pages are not explicitly disallowed. `/typo3/` and `/typo3_src/` are disallowed.

## Sitemap Availability

- `https://www.gesobau.de/sitemap.xml`
- `https://www.gesobau.de/sitemap.xml?sitemap=pages&cHash=7a0d0311313b6afeec53aa120c0b7447`
- `https://www.gesobau.de/sitemap.xml?page=1&sitemap=pages&cHash=4df7661c8c88f66beb96d7a18290d589`

The sitemap includes `https://www.gesobau.de/mieten/wohnungssuche/`. Current apartment detail URLs were not confirmed in sampled sitemap responses; detail discovery should come from the search page/JSON.

## Sample Listing Fields

Public search page fields observed:

- title
- district/neighborhood
- street address
- postal code/city
- warm rent
- room count
- living area
- tags such as `Servicewohnen`, `Für Studierende`, `WBS`
- image URLs
- detail URL

JSON top-level fields observed:

- `uid`
- `title`
- `detail`
- `lat`
- `lng`
- `raw`
- `image`

JSON `raw` fields observed:

- `objekt_nr_extern_stringS`
- `url`
- `objektart_stringS`
- `nutzungsart_stringS`
- `kanal_stringM`
- `adresse_stringS`
- `ort_stringS`
- `plz_stringS`
- `region_stringM`
- `location_stringM`
- `zimmer_intS`
- `wohnflaeche_floatS`
- `gesamtflaeche_floatS`
- `warmmiete_floatS`
- `sozialwohnung_boolS`
- `seniorengerecht_boolS`
- `rollstuhlgerecht_boolS`
- `barrierefrei_boolS`
- `terrasse_boolS`
- `balkonFacette_boolS`
- `wanne_boolS`
- `ebk_boolS`
- `fahrstuhl_boolS`
- `keinEg_boolS`
- `gartennutzung_boolS`
- `fuerSenioren_boolS`
- `fuerStudierende_boolS`
- `noWbs_boolS`
- `keller_boolS`
- `lat_floatS`
- `lon_floatS`
- `created`
- `changed`
- `indexed`
- `content`
- `teaser`

Detail page fields observed:

- title
- location/district
- address
- warm rent
- room count
- living area
- floor
- availability
- image gallery
- floor plan URL
- features
- WBS flag
- construction year
- object number
- description
- location description
- cost breakdown
- energy certificate fields
- Immomio application URL

Sample values observed:

- `title`: `Exklusives Wohnen - Komfort für Menschen ab 65 Jahren`
- `address`: `Zossener Straße 152, 12629 Berlin`
- `warmmiete_floatS`: `773.1`
- `zimmer_intS`: `1`
- `wohnflaeche_floatS`: `44.73`
- `objekt_nr_extern_stringS`: `10-03243-00016-1276-55a549d7-2fee-46b2-8500-d171fce189e0`
- `lat_floatS`: `52.54371`
- `lon_floatS`: `13.59482`
- Detail costs: `Kaltmiete 598,65 €`, `Betriebskosten 152,69 €`, `Heizkosten 67,10 €`, `Miete inkl. NK 773,10 €`

## Anti-Bot / JS Risks

- The confirmed JSON URL is a TYPO3/Solr-style query on `https://www.gesobau.de/mieten/wohnungssuche/`, not a documented partner API.
- `resultsPerPage=10000` was observed from the public page; using that size repeatedly could create avoidable load, so production should prefer smaller pages if supported.
- Detail pages link to Immomio application flows on `https://tenant.immomio.com/`; those flows are not listing sources and should not be automated.
- No CAPTCHA, login requirement, or client credential was confirmed for the listing search/JSON endpoint during this pass.

## Risks

- JSON endpoint uses TYPO3/Solr-like query parameters and may change with frontend implementation.
- `resultsPerPage=10000` was observed from the public page, but production should use smaller pages if supported.
- Application flow goes through Immomio; do not scrape or automate tenant/application flows.
- Some fields are embedded in rich text and require careful parsing.
- Current inventory is small and volatile, so samples may disappear.

## Implementation Notes

- Use respectful low-rate crawling.
- Prefer JSON for structured fields, with HTML detail fallback.
- Do not collect application-form data or automate `tenant.immomio.com`.
