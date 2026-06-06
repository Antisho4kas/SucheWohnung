# degewo Source Research

Research date: 2026-06-02. Scope: public pages, `robots.txt`, sitemap URLs, and normal public page reads. No production connector was written.

## Recommendation

- Status: `implement`
- Priority: P1
- Rationale: apartment search and detail pages are public, server-rendered with the structured labels listed below, and not disallowed by `robots.txt`. No separate API is needed for a first connector.

## Official Domains

- `https://www.degewo.de/`
- Tenant service portal linked from public pages but out of scope: `https://meine.degewo.de/`

## Confirmed Search And Listing URLs

- `https://www.degewo.de/immosuche`
- `https://www.degewo.de/immobiliensuche/` redirects/serves the immo search page content
- `https://www.degewo.de/immosuche/stellplatz`
- `https://www.degewo.de/immosuche/gewerbe`
- Pagination URL pattern confirmed in public HTML: `https://www.degewo.de/immosuche?tx_openimmo_immobilie%5Bpage%5D=2&tx_openimmo_immobilie%5Bsearch%5D=paginate&cHash=b297c411c7d2f679b959f8798a2cf5f9#immo-teaser-list`
- Detail URL: `https://www.degewo.de/immosuche/details/seniorenwohnung-wbs-140-zwingend-erforderlich`
- Detail URL: `https://www.degewo.de/immosuche/details/seniorenresidenz-alt-britz-barrierefreie-1-zimmer-wohnung-erst-ab-60-jahren`
- Detail URL: `https://www.degewo.de/immosuche/details/1-zimmerwohnung-in-koepenick-nachmieter-gesucht`
- Detail URL: `https://www.degewo.de/immosuche/details/seniorenfreundliche-wohnung-ab-55-anmietung-ab-sofort-moeglich`
- Detail URL: `https://www.degewo.de/immosuche/details/nachmieter-gesucht-im-neubau`

## Confirmed Endpoints

- No separate JSON/API endpoint was needed or confirmed in this pass.
- The public search page is server-rendered and exposes listing cards directly in HTML.
- The public detail page is server-rendered and exposes detail sections directly in HTML.

## Robots Constraints

Robots URL: `https://www.degewo.de/robots.txt`

Relevant content:

```txt
User-agent: *
Disallow: /typo3/
Disallow: /typo3_src/
Disallow: /fileadmin/user_upload/_temp_/importexport

Sitemap: https://www.degewo.de/sitemap.xml
```

`/immosuche`, detail URLs under `/immosuche/details/`, and the pagination query pattern are not explicitly disallowed. Avoid `/typo3/`, `/typo3_src/`, and the temporary import/export path.

## Sitemap Availability

- `https://www.degewo.de/sitemap.xml`
- `https://www.degewo.de/sitemap-type/pages/sitemap.xml`
- `https://www.degewo.de/sitemap-type/news/sitemap.xml`
- `https://www.degewo.de/sitemap-type/events/sitemap.xml`

The pages sitemap includes `https://www.degewo.de/immosuche`, but sampled sitemap data did not include current apartment detail URLs. Discover active listings from the search page/pagination.

## Sample Listing Fields

Search page fields observed at `https://www.degewo.de/immosuche`:

- result count, e.g. `54 Ergebnisse`
- tabs: `Wohnung`, `Stellplatz`, `Gewerbefläche`
- district filter
- address filter
- radius filter
- minimum rooms
- minimum area
- maximum warm rent
- equipment filters: `Dusche`, `Barrierefrei`, `Aufzug`, `Badewanne`, `Bad mit Fenster`, `Wohnberechtigungsschein vorhanden`
- sort fields: `Anzahl Zimmer`, `Warmmiete`, `Wohnfläche`
- listing card image URL
- title
- detail URL
- street and neighborhood
- tags such as `Mit WBS`, `Aufzug`, `Dusche`, `Einbauküche`
- warm rent
- rooms
- living area
- availability

Detail page fields observed at `https://www.degewo.de/immosuche/details/seniorenwohnung-wbs-140-zwingend-erforderlich`:

- title
- WBS requirement flag
- image gallery and floorplan images
- warm rent
- living area
- room count
- availability
- costs: `Nettokaltmiete`, `Betriebskosten (kalt)`, `Betriebskosten (warm)`, `Kaution`
- object details: `Zimmer`, `Wohnfläche`, `frei ab`, `Objektart`, `Etage`, `Baujahr`, `WBS-Pflicht`
- energy details: `Energieeffizienz`, `Ausweisart`, `Primärer Energieträger`
- equipment tags and equipment text
- address
- WBS quick-check widget fields
- provider/contact section

Sample values observed:

- Search count: `54 Ergebnisse`
- Title: `Seniorenwohnung-WBS 140 zwingend erforderlich`
- Search card address: `Venusstraße 28 | Altglienicke`
- Warm rent: `487,18 €`
- Rooms: `1`
- Living area: `46,98 m²`
- Availability: `sofort`
- Detail address: `Venusstraße 28, 12524 Berlin`
- Costs: `Nettokaltmiete 324,17 €`, `Betriebskosten (kalt) 102,88 €`, `Betriebskosten (warm) 60,13 €`, `Kaution drei Nettokaltmieten`
- Object details: `Objektart Wohnung`, `Etage 4 von 8`, `Baujahr 2020`, `WBS-Pflicht`
- Energy: `Energieeffizienz A`, `Ausweisart Bedarf`, `Primärer Energieträger Fernwärme`

## Anti-Bot / JS Risks

- The listing cards and detail sections were available in server-rendered HTML at `https://www.degewo.de/immosuche` and `https://www.degewo.de/immosuche/details/seniorenwohnung-wbs-140-zwingend-erforderlich`; no JavaScript-only listing API was required in this pass.
- Pagination links include TYPO3/OpenImmo parameters and `cHash`; discover pagination links from the page instead of fabricating query URLs.
- Detail pages include inquiry actions, WBS calculator UI, print/PDF links, and nearby-place widgets; those should stay out of listing ingestion.
- No CAPTCHA, login requirement, or anti-bot challenge was confirmed on search/detail reads during this pass.

## Risks

- Pagination URLs include `cHash`; they are not disallowed by degewo robots, but the values may be session/generated and should be discovered from the page rather than hardcoded.
- HTML parser must handle German currency/number formats and volatile labels.
- Detail slugs may collide or change when listings are replaced.
- Search includes non-standard senior/WBS listings; matching logic must preserve WBS and age restrictions.
- Inquiry forms and WBS calculator inputs should not be automated.

## Implementation Notes

- Use `/immosuche` and pagination links for discovery.
- Parse card fields for fast matching, then fetch detail pages for costs and constraints.
- Keep `/immosuche/stellplatz` and `/immosuche/gewerbe` out of apartment ingestion unless explicitly adding those categories.
- Do not use PDF print links or submit inquiry forms.
