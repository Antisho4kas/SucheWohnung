export const legSitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://www.leg-wohnen.de/?sitemap=pages&amp;type=1533906435&amp;cHash=pages</loc>
  </sitemap>
  <sitemap>
    <loc>https://www.leg-wohnen.de/?sitemap=wohnungen&amp;type=1533906435&amp;cHash=wohnungen</loc>
  </sitemap>
  <sitemap>
    <loc>https://www.leg-wohnen.de/?page=1&amp;sitemap=wohnungen&amp;type=1533906435&amp;cHash=wohnungen-page-1</loc>
  </sitemap>
</sitemapindex>`;

export const legWohnungenSitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.leg-wohnen.de/immobilien/detail/2914-11-M</loc>
    <lastmod>2026-05-12T20:17:25+02:00</lastmod>
  </url>
  <url>
    <loc>https://www.leg-wohnen.de/immobilien/detail/5237-60026-M</loc>
    <lastmod>2026-06-02T03:16:03+02:00</lastmod>
  </url>
</urlset>`;

export const legTwoWohnungenSitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.leg-wohnen.de/immobilien/detail/2914-11-M</loc></url>
  <url><loc>https://www.leg-wohnen.de/immobilien/detail/2914-12-M</loc></url>
</urlset>`;

export const legWohnungDetailHtml = `<!DOCTYPE html>
<html lang="de">
  <head>
    <title>2-Zimmer-Wohnung in Mönchengladbach-Mülfort mieten - 57.6 m²</title>
    <meta name="description" content="2-Zimmer-Wohnung in Mönchengladbach-Mülfort mieten - 57.6 m². Jetzt Besichtigung anfragen.">
    <meta property="og:title" content="2-Zimmer-Wohnung in Mönchengladbach-Mülfort mieten - 57.6 m²">
    <link rel="canonical" href="https://www.leg-wohnen.de/immobilien/detail/2914-11-M?utm_source=fixture">
  </head>
  <body>
    <main>
      <section class="sg-estate sg-estate-base">
        <!-- wohnung -->
        <div itemscope itemtype="https://schema.org/Apartment" class="sg-estate-detail sg-estate-has-map">
          <div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
            <meta itemprop="addressLocality" content="Mönchengladbach" />
            <meta itemprop="postalCode" content="41238" />
            <meta itemprop="addressCountry" content="DE" />
            <meta itemprop="streetAddress" content="Bruchstraße 88" />
          </div>
          <meta itemprop="floorSize" content="57,58 MTK" />
          <h1 class="sg-estate-detail-headline text-center">2-Zimmer-Wohnung mit Balkon in Mönchengladbach-Mülfort mieten</h1>
          <h2 class="sg-estate-detail-subheadline text-center">57,6&nbsp;m&sup2; für 559,00 € kalt</h2>
          <div class="sge-gallery js-sge-gallery">
            <a href="/uploads/tx_sgestatecore/media/2914-11-M-1.jpg" data-fancybox="fancybox-470549"><img src="/uploads/tx_sgestatecore/media/2914-11-M-1.jpg" itemprop="photo" /></a>
            <a href="https://img.leg-wohnen.test/2914-11-M-2.jpg" data-fancybox="fancybox-470549"><img src="https://img.leg-wohnen.test/2914-11-M-2.jpg" itemprop="photo" /></a>
          </div>
          <dl class="sg-estate-keyfacts">
            <dt>Kaltmiete</dt><dd>559,00 €</dd>
            <dt>Warmmiete</dt><dd>729,00 €</dd>
            <dt>Zimmer</dt><dd>2</dd>
            <dt>Wohnfläche</dt><dd>57,58 m²</dd>
            <dt>Bezugsfrei ab</dt><dd>01.08.2026</dd>
          </dl>
          <div class="sg-estate-detail-description">Helle Wohnung mit Balkon, Aufzug und Keller.</div>
          <a class="chat-cta chat-prefill" href="#" data-chat-msg="2914-11-M">Anfragen per Telegram</a>
        </div>
      </section>
    </main>
  </body>
</html>`;

export const legSecondWohnungDetailHtml = legWohnungDetailHtml
  .replaceAll("2914-11-M", "2914-12-M")
  .replace("559,00 € kalt", "650,00 € kalt")
  .replace("559,00 €", "650,00 €")
  .replace("729,00 €", "820,00 €");

export const legParkingDetailHtml = `<!DOCTYPE html>
<html lang="de">
  <head>
    <title>Stellplatz in Landau ab sofort frei!</title>
    <link rel="canonical" href="https://www.leg-wohnen.de/immobilien/detail/5237-60026-M">
  </head>
  <body>
    <main>
      <section class="sg-estate sg-estate-base">
        <!-- parken -->
        <div itemscope itemtype="https://schema.org/Apartment" class="sg-estate-detail sg-estate-has-map">
          <div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
            <meta itemprop="addressLocality" content="Landau in der Pfalz" />
            <meta itemprop="postalCode" content="76829" />
          </div>
          <h1 class="sg-estate-detail-headline">Schon wieder vor dem Haus nichts frei? Kein Problem! Stellplatz in Landau ab sofort frei!</h1>
          <dl><dt>Miete</dt><dd>35,00 €</dd></dl>
          <a class="chat-cta chat-prefill" href="#" data-chat-msg="5237-60026-M">Anfragen per Telegram</a>
        </div>
      </section>
    </main>
  </body>
</html>`;
