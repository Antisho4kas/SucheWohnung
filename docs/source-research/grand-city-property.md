# Grand City Property Source Research

Research date: 2026-06-02. Scope: public pages, `robots.txt`, sitemap URLs, and normal public page reads. No production connector was written.

## Recommendation

- Status: `implement`
- Priority: P1
- Rationale: public listing URLs and sitemap are available, `robots.txt` does not disallow crawling, and detail pages expose the apartment fields listed below in HTML.

## Official Domains

- Listing/source domain: `https://www.grandcityproperty.de/`
- Tenant/service portal linked from public pages, not a listing source: `https://serviceportal.grandcityproperty.de/`

## Confirmed Search And Listing URLs

- `https://www.grandcityproperty.de/wohnungssuche`
- `https://www.grandcityproperty.de/wohnung-berlin`
- `https://www.grandcityproperty.de/wohnungssuche?city=Berlin&type=&price=&rooms=&size=&cityText=St%C3%A4dte%7CBerlin%7CBerlin`
- `https://www.grandcityproperty.de/wohnungssuche/berlin/kurfurstendamm-69/9999_10707_069_0009`
- `https://www.grandcityproperty.de/wohnungssuche/berlin/prinzenallee-21/5005_00013_001_0027`
- `https://www.grandcityproperty.de/wohnungssuche/berlin/kurfurstendamm-69/expose/127357?lang=de`
- `https://www.grandcityproperty.de/wohnungssuche/berlin/prinzenallee-21/expose/135605?lang=de`

## Confirmed Endpoints

- No separate JSON/API endpoint was confirmed from public listing pages.
- Search and listing data are available in HTML via `GET https://www.grandcityproperty.de/wohnungssuche` and query-parameter variants.

## Robots Constraints

Robots URL: `https://www.grandcityproperty.de/robots.txt`

Relevant content:

```txt
User-agent: *
Disallow:
```

No disallow rule was observed for `/wohnungssuche`, listing detail pages, query search pages, or sitemap. No sitemap directive was present in robots.

## Sitemap Availability

- `https://www.grandcityproperty.de/sitemap.xml`

The sitemap directly lists many detail URLs under `/wohnungssuche/` with `lastmod`. Examples observed:

- `https://www.grandcityproperty.de/wohnungssuche/berlin/reichsstrasse-12-eschenallee-36/6021_01270_001_0025`
- `https://www.grandcityproperty.de/wohnungssuche/berlin/klandorfer-strasse-1/5037_00271_003_0158`
- `https://www.grandcityproperty.de/wohnungssuche/berlin/landsberger-allee-171--171a-/6004_00631_010_0274`
- `https://www.grandcityproperty.de/wohnungssuche/berlin/bornstedter-strasse-8/6002_00238_002_0023`
- `https://www.grandcityproperty.de/wohnungssuche/berlin/kurfurstendamm-69/9999_10707_069_0009`
- `https://www.grandcityproperty.de/wohnungssuche/berlin/wilkestrasse-2/6034_01332_001_0016`

## Sample Listing Fields

Search form fields/facets observed:

- `Stadt, Ort, Bezirk, PLZ`
- `Objekttyp`
- `Mietpreis`
- `Zimmer`
- `Wohnfläche`
- `Umkreis`
- feature filters: `Balkon`, `Einbauküche`, `Keller`, `Aufzug`, `Tageslichtbad`, `Dusche`, `Badewanne`, `Barrierearm`
- sort options: `Neueste`, `Älteste`, `Miete aufsteigend`, `Miete absteigend`
- views: grid, list, map

Search result card fields observed:

- title
- detail URL
- image URL
- address/street
- city
- cold rent per month
- area
- rooms
- floor
- feature icons/labels

Detail page fields observed:

- compact listing ID
- formatted `Objekt ID`
- title
- address
- availability
- area
- floor
- rooms
- features
- contact person/team
- cost breakdown
- additional metadata
- images
- floorplan
- 360/video availability
- expose PDF link
- description sections

Sample values observed:

- Search card from `https://www.grandcityproperty.de/wohnung-berlin`: `Kurfürstendamm 69, Berlin`, `4.111 € / pro Monat kalt`, `164 m2`, `3 Zimmer`, `5. Stock`, `EBK`, `Aufzug`, `Balkon`, `Wanne`
- Detail URL: `https://www.grandcityproperty.de/wohnungssuche/berlin/prinzenallee-21/5005_00013_001_0027`
- Compact ID: `5005000130010027`
- Title: `Moderne Neubau-Dachgeschosswohnung – 3-Zimmer-Wohnung mit Aufzug`
- Address: `Prinzenallee 21, Berlin`
- Availability: `Sofort`
- Area: `89 m2`
- Floor: `5. Stock`
- Rooms: `3 Zimmer`
- Costs: `Kaltmiete 1.639,00 €`, `Nebenkosten 189,00 €`, `Heizkosten 171,00 €`, `Gesamtmiete 1.999,00 €`, `Kaution 4.917,00 €`
- Object ID: `5005/00013/001/0027`
- `Baujahr 1900`
- `Zustand Gepflegt`
- `Wesentliche Energieträger Fernwärme`

## Anti-Bot / JS Risks

- No separate JSON/API endpoint was confirmed; implementation should rely on HTML and sitemap parsing, not hidden client APIs.
- Search/detail pages are usable as normal `GET` HTML pages; no CAPTCHA, login requirement, or anti-bot challenge was confirmed during this pass.
- Map, 360/video, expose PDF, and contact/inquiry interactions exist on detail pages but are not needed for listing ingestion.
- The sitemap is large and nationwide; use polite rates and filter by object type/location.

## Risks

- No stable public JSON API confirmed; HTML parser must tolerate CMS/frontend changes.
- `/wohnungssuche` includes apartments, commercial units, parking/garage listings, and possibly storage/other object types.
- Sitemap contains nationwide listings, not just Berlin.
- Some sitemap entries include odd placeholder-like paths such as `%city`; duplicate variants like `-001` appear.
- Listing text warns that photos may be sample photos or AI/virtually staged and details are non-binding.
- Contact forms and inquiry flows should not be automated.

## Implementation Notes

- Use sitemap for discovery and public HTML pages for extraction.
- Filter object type before apartment notification.
- Normalize German number/currency formats.
- Do not fetch disallowed or unnecessary expose PDFs unless separately assessed.
- Do not automate contact/inquiry forms.
