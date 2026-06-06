# Gewobag Source Research

Research date: 2026-06-02. Scope: public pages, `robots.txt`, sitemap URLs, and normal browser-observed network requests. No production connector was written.

## Recommendation

- Status: `implement`
- Priority: P1
- Rationale: public listing pages and a large listing sitemap are available, `robots.txt` does not disallow listing paths for general crawlers, and search/detail HTML pages expose listing fields. No stable public JSON listing API was confirmed.

## Official Domains

- `https://www.gewobag.de/`
- External storage offer linked from listing page, not a direct apartment source: `https://lagerraum.gewobag.de/`
- Job/service/social domains are out of scope.

## Confirmed Search And Listing URLs

- `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/`
- `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/wohnung/`
- `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/gewerbe/`
- Search-results URL confirmed after submitting the public apartment search form: `https://www.gewobag.de/fuer-mietinteressentinnen/suche/wohnung/?gesamtmiete_von&gesamtmiete_bis&gesamtflaeche_von&gesamtflaeche_bis&zimmer_von&zimmer_bis&sort-by`
- Apartment detail URL confirmed from the search-results page: `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/7100-70701-0501-0007/`
- Apartment detail URL confirmed from the search-results page: `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/7100-70701-0702-0216/`
- Apartment detail URL confirmed from the search-results page: `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01920-0119-0406/`
- Apartment detail URL confirmed from the search-results page: `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01108-1501-0426/`
- Parking search URL, out of apartment scope: `https://www.gewobag.de/fuer-mietinteressentinnen/suche/parken/`
- Parking detail example from sitemap, out of apartment scope: `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01032-1601-5070/`

The apartment search page confirmed `47 Angebote durchsuchen` during browser verification. The search-results page rendered apartment cards and `Mietangebot ansehen` links. The sitemap also contains many offer URLs under the same detail path namespace, but it mixes apartments with parking and other offer types.

## Confirmed Endpoints

- No separate public JSON/API listing endpoint was confirmed from normal public page load or from the public apartment search-results page.
- Browser network observation after cookie-dialog closure showed only Borlabs cookie consent endpoints, not listing API calls:
  - `https://www.gewobag.de/wp-json/borlabs-cookie/v1/consent/statistic`
  - `https://www.gewobag.de/wp-json/borlabs-cookie/v1/consent/log`
- Use sitemap and HTML pages as confirmed sources.

## Robots Constraints

Robots URL: `https://www.gewobag.de/robots.txt`

Relevant content observed:

```txt
User-Agent: Googlebot-Image
Disallow: /*.svg$
```

No general `User-agent: *` disallow rule was observed. The only fetched rule targets `Googlebot-Image` and SVG files. Listing pages under `/fuer-mietinteressentinnen/mietangebote/` are not disallowed for general crawlers by the fetched robots content.

## Sitemap Availability

- `https://www.gewobag.de/sitemap.xml`
- `https://www.gewobag.de/page-sitemap.xml`
- `https://www.gewobag.de/immobilien-sitemap.xml`
- `https://www.gewobag.de/bhkw-sitemap.xml`
- `https://www.gewobag.de/stadtteilinfo-sitemap.xml`
- `https://www.gewobag.de/service-thema-sitemap.xml`
- `https://www.gewobag.de/service-frage-sitemap.xml`
- `https://www.gewobag.de/bauprojekt-sitemap.xml`
- `https://www.gewobag.de/mieterbeirat-sitemap.xml`
- `https://www.gewobag.de/pressemitteilung-sitemap.xml`
- `https://www.gewobag.de/quartierbuero-sitemap.xml`
- `https://www.gewobag.de/service-kategorie-sitemap.xml`
- `https://www.gewobag.de/gewerbetyp-sitemap.xml`

`https://www.gewobag.de/immobilien-sitemap.xml` directly lists offer URLs under `/fuer-mietinteressentinnen/mietangebote/` with `lastmod` timestamps, including apartment and non-apartment offers.

## Sample Listing Fields

Apartment search page fields/facets observed at `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/wohnung/`:

- search result count, e.g. `47 Angebote durchsuchen`
- district/subdistrict selectors
- `Gesamtmiete (€)` min/max
- `Gesamtfläche (m²)` min/max
- `Anzahl Zimmer` min/max
- `Wohnungstyp`: `Barrierefrei`, `Senioren`, `Studenten`, `WBS`, `mit WBS`, `ohne WBS`, `Erdgeschoss`, `Rollstuhlgerecht`
- `Gebäudeart`: `Altbau`, `Neubau`
- `Ausstattung`: `Aufzug`, `Keller`, `Balkon/Loggia/Wintergarten`, `Garten/-mitnutzung`, `Einbauküche`, `Badewanne`, `Dusche`, `Gäste-WC`
- search-agent email form fields, which should remain out of scope

Search-results card fields observed at `https://www.gewobag.de/fuer-mietinteressentinnen/suche/wohnung/?gesamtmiete_von&gesamtmiete_bis&gesamtflaeche_von&gesamtflaeche_bis&zimmer_von&zimmer_bis&sort-by`:

- district, e.g. `Schöneberg`
- address, e.g. `Badensche Str. 55, 10825 Berlin/Tempelhof-Schöneberg`
- title, e.g. `Wohnen am Volkspark`
- rooms and area, e.g. `2 Zimmer | 64,41 m²`
- availability, e.g. `01.06.2026`
- total rent, e.g. `ab 707,62€`
- feature text, e.g. `Badewanne`, `Balkon/Terasse`, `Fernheizung/Zentralheizung`
- detail link text `Mietangebot ansehen`

Detail page fields observed at `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/7100-70701-0501-0007/`:

- title
- rent fields, e.g. `Gesamtmiete`
- address
- availability, e.g. `Frei ab`
- object number, e.g. `Objektnummer`
- object description
- location description
- miscellaneous/legal notes
- provider/landlord company
- contact section

Sample apartment values observed:

- Search-results URL: `https://www.gewobag.de/fuer-mietinteressentinnen/suche/wohnung/?gesamtmiete_von&gesamtmiete_bis&gesamtflaeche_von&gesamtflaeche_bis&zimmer_von&zimmer_bis&sort-by`
- Detail URL: `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/7100-70701-0501-0007/`
- Title: `Wohnen am Volkspark`
- Search card address: `Badensche Str. 55, 10825 Berlin/Tempelhof-Schöneberg`
- Search card area: `2 Zimmer | 64,41 m²`
- Search card rent: `ab 707,62€`
- Detail page rent: `Gesamtmiete Auf Anfrage`
- Detail page description mentions a large balcony and `Wannenbad`.

## Anti-Bot / JS Risks

- Initial page load of `https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/wohnung/` did not render apartment cards until the public search form was submitted.
- Browser verification encountered a cookie-consent dialog; after closing it, only Borlabs consent endpoints were observed, not a listing JSON endpoint.
- The usable apartment results page is generated through the public search form at `/fuer-mietinteressentinnen/suche/wohnung/`; avoid automating search-agent or inquiry forms.
- Google Maps placeholders appear on detail pages and require consent to load third-party content; maps are not needed for listing ingestion.

## Risks

- No stable public JSON endpoint was confirmed; HTML parser must tolerate WordPress/theme changes.
- The `immobilien-sitemap.xml` contains mixed offer types, including apartments, parking, and commercial listings; downstream ingestion must filter object type.
- Search-agent and inquiry forms collect personal data; do not automate them.
- Some pages include Google Maps, Immoviewer, YouTube, or external storage services; these are not required for listing ingestion.
- Offer inventory is volatile; sitemap entries may be stale or redirected.

## Implementation Notes

- Use `immobilien-sitemap.xml` for discovery and HTML detail pages for extraction.
- Filter out non-apartment objects by page headings/sections before generating apartment notifications.
- Do not post inquiry or search-agent forms.
- Store only listing metadata needed for matching and notification.
