import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BrowserPool,
  ConnectorContext,
  HttpClient,
  HttpClientResponse,
  Logger,
} from "../contract.js";
import { NormalizedListingSchema } from "../../domain/listing.js";
import { ImmobiloConnector } from "../immobilo-connector.js";

const fixture = (name: string): string =>
  readFileSync(
    join(
      process.cwd(),
      "packages/shared/src/connectors/__tests__/fixtures",
      name,
    ),
    "utf8",
  );

const textResponse = (body: string, status = 200): HttpClientResponse => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {},
  text: async () => body,
  json: async <T>() => JSON.parse(body) as T,
});

const logger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const browser: BrowserPool = {
  withPage: async <T>(fn: (page: unknown) => Promise<T>) => fn({}),
};

const makeCtx = (
  config: Record<string, unknown>,
  get: ConnectorContext["http"]["get"],
): ConnectorContext => ({
  config,
  http: {
    get,
    post: vi.fn(),
  },
  browser,
  logger: logger(),
  signal: new AbortController().signal,
});

const collect = async (connector: ImmobiloConnector, ctx: ConnectorContext) => {
  const items = [];
  for await (const item of connector.fetch(ctx, { maxItems: 10 })) {
    items.push(item);
  }
  return items;
};

const baseConfig = {
  baseUrl: "https://www.immobilo.de",
  healthPath: "/robots.txt",
  sitemapIndexUrl: null,
  sitemapSerpUrl: "/sitemap-serp.xml",
  sitemapExpUrl: "/sitemap-exp.xml",
  maxSerpPages: 10,
  maxExposePages: 10,
  pageDelayMs: 0,
  userAgent: "FixtureAgent/3.0",
  headers: { "X-Test": "immobilo" },
  timeoutMs: 1234,
  retry: {
    maxAttempts: 2,
    baseDelayMs: 10,
    maxDelayMs: 20,
    jitter: false,
    retryStatuses: [500],
  },
};

describe("ImmobiloConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses sitemap-serp and sitemap-exp URLs, parses expose pages, and normalizes metadata", async () => {
    const connector = new ImmobiloConnector();
    const globalFetch = vi.fn(() => {
      throw new Error("global fetch should not be used");
    });
    vi.stubGlobal("fetch", globalFetch);
    const calls: string[] = [];
    const get = vi.fn<HttpClient["get"]>(async (url, init) => {
      calls.push(url);
      expect(init).toMatchObject({
        signal: ctx.signal,
        timeoutMs: 1234,
        retry: baseConfig.retry,
        headers: { "X-Test": "immobilo", "User-Agent": "FixtureAgent/3.0" },
      });
      const parsed = new URL(url);
      if (parsed.pathname === "/robots.txt") return textResponse("ok");
      if (parsed.pathname === "/sitemap-serp.xml") {
        return textResponse(fixture("immobilo-sitemap-serp.xml"));
      }
      if (parsed.pathname === "/sitemap-exp.xml") {
        return textResponse(fixture("immobilo-sitemap-exp.xml"));
      }
      if (parsed.pathname === "/mieten/ingolstadt") {
        return textResponse(fixture("immobilo-serp.html"));
      }
      if (parsed.pathname === "/immobilien/helle-3-zimmer-wohnung-GVJKHL") {
        return textResponse(fixture("immobilo-expose-full.html"));
      }
      if (parsed.pathname === "/immobilien/ruhiges-apartment-IM456") {
        return textResponse(fixture("immobilo-expose-secondary.html"));
      }
      if (parsed.pathname === "/immobilien/maisonette-aus-serp-IM789") {
        return textResponse(fixture("immobilo-expose-serp-only.html"));
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const ctx = makeCtx(baseConfig, get);

    await expect(connector.healthCheck(ctx)).resolves.toEqual({
      healthy: true,
    });
    const raw = await collect(connector, ctx);
    const mapped = raw.map((item) => connector.map(item));

    expect(connector.slug).toBe("immobilo");
    expect(connector.type).toBe("scrape");
    expect(raw).toHaveLength(3);
    expect(globalFetch).not.toHaveBeenCalled();
    expect(
      calls.filter(
        (url) =>
          new URL(url).pathname === "/immobilien/helle-3-zimmer-wohnung-GVJKHL",
      ),
    ).toHaveLength(1);
    expect(calls).not.toContain("https://www.immobilo.de/kaufen/ingolstadt");
    expect(calls).not.toContain("https://www.immobilo.de/ratgeber");
    expect(calls.some((url) => new URL(url).hostname === "evil.example")).toBe(
      false,
    );

    expect(mapped[0]).toMatchObject({
      sourceSlug: "immobilo",
      externalId: "GVJKHL",
      url: "https://www.immobilo.de/immobilien/helle-3-zimmer-wohnung-GVJKHL",
      title: "Helle 3-Zimmer-Wohnung mit Balkon",
      price: 1250.5,
      area: 85.5,
      rooms: 3.5,
      postalCode: "85049",
      city: "Ingolstadt",
      attributes: {
        aggregator: true,
        dedupe_risk: "high",
        original_source_name: "PartnerPortal",
        original_url: "http://partner.example/listing/original-777",
        balcony: true,
        elevator: true,
        parking: true,
        cellar: true,
        furnished: true,
        pets_allowed: true,
        provisionfrei: true,
      },
      images: [
        { url: "https://img.immobilo.test/1.jpg", position: 0 },
        { url: "https://img.immobilo.test/2.jpg", position: 1 },
      ],
    });
    expect(mapped[0]?.raw).toMatchObject({
      sourceMetadata: {
        sourceSlug: "immobilo",
        aggregator: true,
        dedupeRisk: "high",
        discoveredVia: "sitemap-exp",
        originalUrl: "http://partner.example/listing/original-777",
        originalSourceName: "PartnerPortal",
        canonicalUrl:
          "https://www.immobilo.de/immobilien/helle-3-zimmer-wohnung-GVJKHL",
      },
    });
    for (const listing of mapped) {
      expect(NormalizedListingSchema.safeParse(listing).success).toBe(true);
    }
    expect(mapped[2]).toMatchObject({
      externalId: "IM789",
      price: 1250,
      area: 70,
      rooms: 2,
      postalCode: "85055",
    });
  });

  it("honors maxItems before requesting extra expose pages", async () => {
    const connector = new ImmobiloConnector();
    const calls: string[] = [];
    const get = vi.fn<HttpClient["get"]>(async (url) => {
      calls.push(url);
      const parsed = new URL(url);
      if (parsed.pathname === "/sitemap-serp.xml") {
        return textResponse(fixture("immobilo-sitemap-serp.xml"));
      }
      if (parsed.pathname === "/sitemap-exp.xml") {
        return textResponse(fixture("immobilo-sitemap-exp.xml"));
      }
      if (parsed.pathname === "/mieten/ingolstadt") {
        return textResponse(fixture("immobilo-serp.html"));
      }
      if (parsed.pathname === "/immobilien/helle-3-zimmer-wohnung-GVJKHL") {
        return textResponse(fixture("immobilo-expose-full.html"));
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const ctx = makeCtx(baseConfig, get);

    const raw = [];
    for await (const item of connector.fetch(ctx, { maxItems: 1 }))
      raw.push(item);

    expect(raw).toHaveLength(1);
    expect(
      calls.filter((url) => new URL(url).pathname.startsWith("/immobilien/")),
    ).toEqual([
      "https://www.immobilo.de/immobilien/helle-3-zimmer-wohnung-GVJKHL",
    ]);
    expect(calls).not.toContain("https://www.immobilo.de/mieten/ingolstadt");
  });

  it("follows sitemap indexes and continues after stale expose pages", async () => {
    const connector = new ImmobiloConnector();
    const calls: string[] = [];
    const get = vi.fn<HttpClient["get"]>(async (url) => {
      calls.push(url);
      const parsed = new URL(url);
      if (parsed.pathname === "/sitemap.xml") {
        return textResponse(fixture("immobilo-sitemap-index.xml"));
      }
      if (parsed.pathname === "/sitemap-exp-0.xml") {
        return textResponse(fixture("immobilo-sitemap-exp.xml"));
      }
      if (parsed.pathname === "/sitemap-serp-l-mt-0.xml") {
        return textResponse(fixture("immobilo-sitemap-serp.xml"));
      }
      if (parsed.pathname === "/mieten/ingolstadt") {
        return textResponse(fixture("immobilo-serp.html"));
      }
      if (parsed.pathname === "/immobilien/helle-3-zimmer-wohnung-GVJKHL") {
        return textResponse("not found", 404);
      }
      if (parsed.pathname === "/immobilien/ruhiges-apartment-IM456") {
        return textResponse(fixture("immobilo-expose-secondary.html"));
      }
      if (parsed.pathname === "/immobilien/maisonette-aus-serp-IM789") {
        return textResponse(fixture("immobilo-expose-serp-only.html"));
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const ctx = makeCtx(
      { ...baseConfig, sitemapIndexUrl: "/sitemap.xml" },
      get,
    );

    const raw = await collect(connector, ctx);
    const mapped = raw.map((item) => connector.map(item));

    expect(mapped.map((listing) => listing.externalId)).toEqual([
      "IM456",
      "IM789",
    ]);
    expect(calls.some((url) => new URL(url).hostname === "evil.example")).toBe(
      false,
    );
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Skipping Immobilo expose"),
      {
        url: "https://www.immobilo.de/immobilien/helle-3-zimmer-wohnung-GVJKHL",
      },
    );
  });

  it("caps sitemap-index discovery when maxItems is reached", async () => {
    const connector = new ImmobiloConnector();
    const calls: string[] = [];
    const get = vi.fn<HttpClient["get"]>(async (url) => {
      calls.push(url);
      const parsed = new URL(url);
      if (parsed.pathname === "/sitemap.xml") {
        return textResponse(fixture("immobilo-sitemap-index.xml"));
      }
      if (parsed.pathname === "/sitemap-exp-0.xml") {
        return textResponse(fixture("immobilo-sitemap-exp.xml"));
      }
      if (parsed.pathname === "/immobilien/helle-3-zimmer-wohnung-GVJKHL") {
        return textResponse(fixture("immobilo-expose-full.html"));
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const ctx = makeCtx(
      { ...baseConfig, sitemapIndexUrl: "/sitemap.xml" },
      get,
    );
    const raw = [];

    for await (const item of connector.fetch(ctx, { maxItems: 1 }))
      raw.push(item);

    expect(raw).toHaveLength(1);
    expect(calls).not.toContain(
      "https://www.immobilo.de/sitemap-serp-l-mt-0.xml",
    );
  });

  it("drops unsafe external URLs and does not classify navigation text as sale", async () => {
    const connector = new ImmobiloConnector();
    const get = vi.fn<HttpClient["get"]>(async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/sitemap-serp.xml")
        return textResponse("<urlset />");
      if (parsed.pathname === "/sitemap-exp.xml") {
        return textResponse(`<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://www.immobilo.de/immobilien/mietwohnung-mit-nav-IMNAV</loc></url>
          </urlset>`);
      }
      if (parsed.pathname === "/immobilien/mietwohnung-mit-nav-IMNAV") {
        return textResponse(`<!doctype html><html lang="de"><head>
          <link rel="canonical" href="https://www.immobilo.de/immobilien/mietwohnung-mit-nav-IMNAV" />
          <meta property="og:title" content="Mietwohnung mit Balkon" />
          <meta property="og:description" content="Helle Wohnung." />
          <meta property="og:image" content="javascript:alert(1)" />
          <script type="application/ld+json">{
            "@type":"Apartment",
            "offers":{"price":"900","url":"javascript:alert(1)"},
            "address":{"postalCode":"85049","addressLocality":"Ingolstadt"},
            "image":"javascript:alert(1)"
          }</script></head><body>
          <nav>Kaufen Gewerbe Büro</nav>
          <article data-testid="expose"><h1>Mietwohnung mit Balkon</h1><dl><dt>Kaltmiete</dt><dd>900 €</dd><dt>Wohnfläche</dt><dd>55 m²</dd><dt>Zimmer</dt><dd>2</dd></dl></article>
        </body></html>`);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const raw = await collect(connector, makeCtx(baseConfig, get));
    const mapped = connector.map(raw[0]!);

    expect(mapped.externalId).toBe("IMNAV");
    expect(mapped.attributes).not.toHaveProperty("original_url");
    expect(mapped.raw).not.toMatchObject({
      sourceMetadata: { originalUrl: expect.any(String) },
    });
    expect(mapped.images).toEqual([]);
  });

  it("validates config before issuing HTTP requests", async () => {
    const get = vi.fn<HttpClient["get"]>();
    const connector = new ImmobiloConnector();
    const ctx = makeCtx(
      { baseUrl: "not-a-url", sitemapSerpUrl: "", sitemapExpUrl: "" },
      get,
    );

    await expect(connector.healthCheck(ctx)).resolves.toMatchObject({
      healthy: false,
    });
    await expect(collect(connector, ctx)).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it("skips sale and commercial expose pages instead of mapping them as rentals", async () => {
    const connector = new ImmobiloConnector();
    const get = vi.fn<HttpClient["get"]>(async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/sitemap-serp.xml") {
        return textResponse("<urlset />");
      }
      if (parsed.pathname === "/sitemap-exp.xml") {
        return textResponse(`<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://www.immobilo.de/immobilien/eigentumswohnung-kaufen-SALE123</loc></url>
            <url><loc>https://www.immobilo.de/immobilien/ruhiges-apartment-IM456</loc></url>
          </urlset>`);
      }
      if (parsed.pathname === "/immobilien/eigentumswohnung-kaufen-SALE123") {
        return textResponse(fixture("immobilo-expose-sale.html"));
      }
      if (parsed.pathname === "/immobilien/ruhiges-apartment-IM456") {
        return textResponse(fixture("immobilo-expose-secondary.html"));
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const raw = await collect(connector, makeCtx(baseConfig, get));

    expect(raw.map((item) => connector.map(item).externalId)).toEqual([
      "IM456",
    ]);
  });

  it("rethrows cancellation errors from HTTP requests", async () => {
    const connector = new ImmobiloConnector();
    const abortError = new DOMException("aborted", "AbortError");
    const get = vi.fn<HttpClient["get"]>(async () => {
      throw abortError;
    });

    await expect(collect(connector, makeCtx(baseConfig, get))).rejects.toThrow(
      "aborted",
    );
  });
});
