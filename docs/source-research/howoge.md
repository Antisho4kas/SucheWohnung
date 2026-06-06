# HOWOGE Source Research

Research date: 2026-06-02. Scope: public pages, `robots.txt`, sitemap URLs, and normal browser-observed network requests. No production connector was written.

## Recommendation

- Status: `needs permission`
- Priority: P2 gated
- Rationale: the apartment search page is public, but normal page-load traffic confirmed a JSON/list endpoint containing `tx_howrealestate_json_list`, and `robots.txt` disallows `/*?tx_howrealestate_json_list`. Public HTML/sitemap alone is insufficient for reliable apartment records.

## Official Domains

- Listing/source domain: `https://www.howoge.de/`
- Official linked subdomains observed: `https://unternehmen.howoge.de/`, `https://karriere.howoge.de/`, `https://ir.howoge.de/`, `https://nachhaltigkeit.howoge.de/`

## Confirmed Search And Listing URLs

- `https://www.howoge.de/immobiliensuche/wohnungssuche.html`
- Related project/list page: `https://www.howoge.de/immobiliensuche/neubauprojekte.html`
- Generic detail/template URL from sitemap, not confirmed as an active listing: `https://www.howoge.de/immobiliensuche/wohnungssuche/detail.html`

Confirmed project URLs visible from public pages:

- `https://www.howoge.de/immobiliensuche/neubauprojekte/anne-frank-strasse.html`
- `https://www.howoge.de/immobiliensuche/neubauprojekte/gartenstadt-karlshorst.html`
- `https://www.howoge.de/immobiliensuche/neubauprojekte/dachaufstockung-genslerstrasse.html`
- `https://www.howoge.de/immobiliensuche/neubauprojekte/havelufer-quartier.html`
- `https://www.howoge.de/immobiliensuche/neubauprojekte/huronseestrasse-28-34.html`
- `https://www.howoge.de/immobiliensuche/neubauprojekte/lueckstrasse.html`
- `https://www.howoge.de/immobiliensuche/neubauprojekte/plonzstrasse.html`
- `https://www.howoge.de/immobiliensuche/neubauprojekte/sewanstrasse-256-a-c.html`
- `https://www.howoge.de/immobiliensuche/neubauprojekte/sewanstrasse-38-40.html`
- `https://www.howoge.de/immobiliensuche/neubauprojekte/studenthouse-eichbuschallee.html`
- `https://www.howoge.de/immobiliensuche/neubauprojekte/wiecker-strasse.html`

## Confirmed Endpoints

Normal public page load of `https://www.howoge.de/immobiliensuche/wohnungssuche.html` triggered:

```text
POST https://www.howoge.de/?type=999&tx_howrealestate_json_list[action]=immoList
```

The response body was not used for source research because `https://www.howoge.de/robots.txt` contains `Disallow: /*?tx_howrealestate_json_list`.

## Robots Constraints

Robots URL: `https://www.howoge.de/robots.txt`

Relevant content:

```txt
User-Agent: *
Allow: /

Disallow: /typo3/
Disallow: /typo3conf/
Allow: /typo3conf/ext/
Allow: /typo3temp/

Disallow: /*?id=*
Disallow: /*cHash
Disallow: /*tx_powermail_pi1
Disallow: /*tx_form_formframework

Disallow: /?type=999&tx_howsite_json_list[action]=immoList
Disallow: /*?tx_howrealestate_json_list
Disallow: /*?tx_howbuildingprojects_json_list
Disallow: /*?tx_howfaq_json_list
Disallow: /*?tx_hownews_json_list

Sitemap: http://www.howoge.de/sitemap.xml
```

The observed listing endpoint uses `?type=999&tx_howrealestate_json_list[action]=immoList`. Even though the exact query order is not literally the same as the rule, the `tx_howrealestate_json_list` disallow should be treated as intentionally covering this feed.

## Sitemap Availability

- `https://www.howoge.de/sitemap.xml`
- `https://www.howoge.de/sitemap.xml?sitemap=pages&cHash=f5ccb2d2b1c8f16086595cff0c41e86f`
- `https://www.howoge.de/sitemap.xml?sitemap=news&cHash=12d1caa53dde4061c345dc7d93385431`
- `https://www.howoge.de/sitemap.xml?sitemap=events&cHash=a92c94694a91eb90364aea6b9175b704`

Robots declares `Sitemap: http://www.howoge.de/sitemap.xml`; HTTPS works. Child sitemap URLs include `cHash`, while robots disallows `/*cHash`; use the root declared sitemap cautiously and avoid crawling child `cHash` URLs unless permission clarifies.

## Sample Listing Fields

Search shell/facets observed on public pages:

- `Kieze`
- `Zimmer`
- `WBS erforderlich`
- Kieze include `Brandenburg`, `Charlottenburg-Wilmersdorf`, `Friedrichshain-Kreuzberg`, `Marzahn-Hellersdorf`, `Mitte`, `Neukölln`, `Lichtenberg`, `Pankow`, `Reinickendorf`, `Spandau`, `Steglitz-Zehlendorf`, `Tempelhof-Schöneberg`, `Treptow-Köpenick`
- Room filters include `Alle`, `ab 1`, `ab 2`, `ab 3`, `ab 4`
- WBS values include `egal`, `ja`, `nein`
- Homepage showed `Jetzt Wohnungen finden 102`

No individual active apartment listing fields were confirmed from compliant HTML alone. Normal page-load traffic confirmed that the apartment search page requested the JSON list endpoint above for records.

## Anti-Bot / JS Risks

- The useful listing feed is a `POST` endpoint on `https://www.howoge.de/?type=999&tx_howrealestate_json_list[action]=immoList`, not static HTML.
- `https://www.howoge.de/robots.txt` explicitly disallows `/*?tx_howrealestate_json_list`, so using that feed in production requires permission.
- The root sitemap is declared, but child sitemap URLs include `cHash`, while robots disallows `/*cHash`; avoid crawling those child URLs unless permission clarifies.
- No CAPTCHA was confirmed, but the robots-restricted JS/JSON feed is the blocker.

## Risks

- Main listing data requires a JSON endpoint that matches a robots-disallowed parameter pattern.
- Public HTML has limited listing value without the JSON feed.
- TYPO3 and `cHash` rules create crawler-policy ambiguity around sitemap children.
- Forms and validation pages should not be automated.
- Building without permission would create compliance risk.

## Implementation Notes If Permission Is Granted

- Ask HOWOGE for explicit permission to use the `tx_howrealestate_json_list` endpoint.
- If permission is granted, implement low-rate polling and avoid form endpoints.
- Without permission, skip production ingestion and keep only a watch item.
