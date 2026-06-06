import { describe, expect, it, vi } from "vitest";
import { LegWohnenConnector } from "../leg-wohnen-connector.js";
import type {
  ConnectorContext,
  HttpClientResponse,
  Logger,
} from "../contract.js";
import type { RawListing } from "../../domain/listing.js";
import {
  legParkingDetailHtml,
  legSecondWohnungDetailHtml,
  legSitemapIndexXml,
  legTwoWohnungenSitemapXml,
  legWohnungDetailHtml,
  legWohnungenSitemapXml,
} from "./fixtures/leg-wohnen-fixtures.js";

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

const makeCtx = (
  config: Record<string, unknown>,
  get: ConnectorContext["http"]["get"],
): ConnectorContext => ({
  config,
  http: {
    get,
    post: vi.fn(),
  },
  browser: { withPage: async <T>(fn: (page: unknown) => Promise<T>) => fn({}) },
  logger: logger(),
  signal: new AbortController().signal,
});

const collect = async (
  iterable: AsyncIterable<RawListing>,
): Promise<RawListing[]> => {
  const items: RawListing[] = [];
  for await (const item of iterable) items.push(item);
  return items;
};

describe("LEG Wohnen connector", () => {
  it("discovers sitemap=wohnungen URLs and maps apartment detail fields", async () => {
    const connector = new LegWohnenConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url, init) => {
      expect(init?.signal).toBe(ctx.signal);
      const parsed = new URL(url);

      if (parsed.pathname === "/healthz") {
        expect(init).toMatchObject({ method: "HEAD" });
        return textResponse("");
      }

      expect(init).toMatchObject({
        headers: { "User-Agent": "FixtureAgent/3.0" },
        timeoutMs: 1234,
      });

      if (parsed.pathname === "/sitemap.xml")
        return textResponse(legSitemapIndexXml);
      if (parsed.searchParams.get("sitemap") === "wohnungen") {
        expect(parsed.searchParams.get("cHash")).toBe("wohnungen");
        return textResponse(legWohnungenSitemapXml);
      }
      if (parsed.pathname === "/immobilien/detail/2914-11-M") {
        return textResponse(legWohnungDetailHtml);
      }
      if (parsed.pathname === "/immobilien/detail/5237-60026-M") {
        return textResponse(legParkingDetailHtml);
      }

      throw new Error(`unexpected url: ${url}`);
    });
    const ctx = makeCtx(
      {
        baseUrl: "https://www.leg-wohnen.de/",
        healthPath: "/healthz",
        sitemapIndexPath: "/sitemap.xml",
        city: "Mönchengladbach",
        minRooms: 2,
        maxRooms: 3,
        maxPages: 1,
        rateLimitMs: 0,
        timeoutMs: 1234,
        userAgent: "FixtureAgent/3.0",
      },
      get,
    );

    await expect(connector.healthCheck(ctx)).resolves.toEqual({
      healthy: true,
    });
    const items = await collect(connector.fetch(ctx, {}));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      adid: "2914-11-M",
      url: "https://www.leg-wohnen.de/immobilien/detail/2914-11-M",
      title: "2-Zimmer-Wohnung mit Balkon in Mönchengladbach-Mülfort mieten",
      price: 559,
      warmRent: 729,
      area: 57.58,
      rooms: 2,
      city: "Mönchengladbach",
      postalCode: "41238",
      availability: "ab 01.08.2026",
    });

    const mapped = connector.map(items[0]!);
    expect(mapped).toMatchObject({
      sourceSlug: "leg-wohnen",
      externalId: "2914-11-M",
      url: "https://www.leg-wohnen.de/immobilien/detail/2914-11-M",
      title: "2-Zimmer-Wohnung mit Balkon in Mönchengladbach-Mülfort mieten",
      price: 559,
      warmRent: 729,
      area: 57.58,
      rooms: 2,
      city: "Mönchengladbach",
      postalCode: "41238",
      attributes: {
        availability: "ab 01.08.2026",
        balcony: true,
        elevator: true,
        cellar: true,
        provisionfrei: true,
      },
    });
    expect(mapped.images).toEqual([
      {
        url: "https://www.leg-wohnen.de/uploads/tx_sgestatecore/media/2914-11-M-1.jpg",
        position: 0,
      },
      { url: "https://img.leg-wohnen.test/2914-11-M-2.jpg", position: 1 },
    ]);
  });

  it("derives a stable externalId from canonical detail URLs", () => {
    const mapped = new LegWohnenConnector().map({
      url: "https://WWW.LEG-WOHNEN.DE/immobilien/detail/2914-11-M/?utm_source=test#top",
      title: "2-Zimmer-Wohnung",
      price: 559,
      area: 57.58,
      rooms: 2,
      city: "Mönchengladbach",
      postalCode: "41238",
      availability: "sofort",
      images: [],
    });

    expect(mapped.externalId).toBe("2914-11-M");
    expect(mapped.url).toBe(
      "https://www.leg-wohnen.de/immobilien/detail/2914-11-M",
    );
    expect(mapped.attributes).toMatchObject({ availability: "sofort" });
  });

  it("rejects external request URLs before issuing HTTP requests", async () => {
    const get = vi.fn<ConnectorContext["http"]["get"]>();
    const connector = new LegWohnenConnector();

    await expect(
      connector.healthCheck(
        makeCtx(
          {
            baseUrl: "https://www.leg-wohnen.de",
            healthPath: "https://evil.example/health",
          },
          get,
        ),
      ),
    ).resolves.toMatchObject({ healthy: false });
    await expect(
      collect(
        connector.fetch(
          makeCtx(
            {
              baseUrl: "https://www.leg-wohnen.de",
              sitemapUrls: ["https://evil.example/sitemap.xml"],
            },
            get,
          ),
          {},
        ),
      ),
    ).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it("ignores external detail URLs from sitemap documents", async () => {
    const connector = new LegWohnenConnector();
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://evil.example/immobilien/detail/evil-1</loc></url>
        <url><loc>https://www.leg-wohnen.de/immobilien/detail/2914-11-M</loc></url>
      </urlset>`;
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("sitemap") === "wohnungen") {
        return textResponse(sitemap);
      }
      if (parsed.pathname === "/immobilien/detail/2914-11-M") {
        return textResponse(legWohnungDetailHtml);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const items = await collect(
      connector.fetch(
        makeCtx(
          {
            baseUrl: "https://www.leg-wohnen.de",
            sitemapUrls: [
              "https://www.leg-wohnen.de/?sitemap=wohnungen&type=1533906435&cHash=wohnungen",
            ],
            rateLimitMs: 0,
          },
          get,
        ),
        {},
      ),
    );

    expect(items).toHaveLength(1);
    expect(
      get.mock.calls.some(([url]) => String(url).includes("evil.example")),
    ).toBe(false);
  });

  it("honors maxItems before fetching extra detail pages", async () => {
    const connector = new LegWohnenConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
      const parsed = new URL(url);

      if (parsed.searchParams.get("sitemap") === "wohnungen") {
        return textResponse(legTwoWohnungenSitemapXml);
      }
      if (parsed.pathname === "/immobilien/detail/2914-11-M") {
        return textResponse(legWohnungDetailHtml);
      }
      if (parsed.pathname === "/immobilien/detail/2914-12-M") {
        return textResponse(legSecondWohnungDetailHtml);
      }

      throw new Error(`unexpected url: ${url}`);
    });

    const items = await collect(
      connector.fetch(
        makeCtx(
          {
            baseUrl: "https://www.leg-wohnen.de",
            sitemapUrls: [
              "https://www.leg-wohnen.de/?sitemap=wohnungen&type=1533906435&cHash=wohnungen",
            ],
            rateLimitMs: 0,
          },
          get,
        ),
        { maxItems: 1 },
      ),
    );

    expect(items).toHaveLength(1);
    expect(
      get.mock.calls.some(([url]) =>
        String(url).includes("/immobilien/detail/2914-12-M"),
      ),
    ).toBe(false);
  });

  it("applies rateLimitMs after skipped detail pages", async () => {
    vi.useFakeTimers();
    try {
      const connector = new LegWohnenConnector();
      const parkingFirstSitemap = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://www.leg-wohnen.de/immobilien/detail/5237-60026-M</loc></url>
          <url><loc>https://www.leg-wohnen.de/immobilien/detail/2914-11-M</loc></url>
        </urlset>`;
      const get = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
        const parsed = new URL(url);

        if (parsed.searchParams.get("sitemap") === "wohnungen") {
          return textResponse(parkingFirstSitemap);
        }
        if (parsed.pathname === "/immobilien/detail/5237-60026-M") {
          return textResponse(legParkingDetailHtml);
        }
        if (parsed.pathname === "/immobilien/detail/2914-11-M") {
          return textResponse(legWohnungDetailHtml);
        }

        throw new Error(`unexpected url: ${url}`);
      });

      const promise = collect(
        connector.fetch(
          makeCtx(
            {
              baseUrl: "https://www.leg-wohnen.de",
              sitemapUrls: [
                "https://www.leg-wohnen.de/?sitemap=wohnungen&type=1533906435&cHash=wohnungen",
              ],
              city: "Mönchengladbach",
              rateLimitMs: 50,
            },
            get,
          ),
          { maxItems: 1 },
        ),
      );

      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(
        get.mock.calls.some(([url]) =>
          String(url).includes("/immobilien/detail/5237-60026-M"),
        ),
      ).toBe(true);
      expect(
        get.mock.calls.some(([url]) =>
          String(url).includes("/immobilien/detail/2914-11-M"),
        ),
      ).toBe(false);

      await vi.advanceTimersByTimeAsync(50);
      await expect(promise).resolves.toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips listings missing a configured city", async () => {
    const connector = new LegWohnenConnector();
    const missingCityHtml = legWohnungDetailHtml.replace(
      '<meta itemprop="addressLocality" content="Mönchengladbach" />',
      "",
    );
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("sitemap") === "wohnungen") {
        return textResponse(
          legTwoWohnungenSitemapXml.replace("2914-12-M", "2914-11-M"),
        );
      }
      if (parsed.pathname === "/immobilien/detail/2914-11-M") {
        return textResponse(missingCityHtml);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    await expect(
      collect(
        connector.fetch(
          makeCtx(
            {
              baseUrl: "https://www.leg-wohnen.de",
              sitemapUrls: [
                "https://www.leg-wohnen.de/?sitemap=wohnungen&type=1533906435&cHash=wohnungen",
              ],
              city: "Mönchengladbach",
              rateLimitMs: 0,
            },
            get,
          ),
          {},
        ),
      ),
    ).resolves.toEqual([]);
  });

  it("rejects invalid config before issuing HTTP requests", async () => {
    const get = vi.fn<ConnectorContext["http"]["get"]>();
    const ctx = makeCtx(
      { baseUrl: "not-a-url", maxPages: 0, rateLimitMs: -1 },
      get,
    );
    const connector = new LegWohnenConnector();

    await expect(connector.healthCheck(ctx)).resolves.toMatchObject({
      healthy: false,
    });
    await expect(collect(connector.fetch(ctx, {}))).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it("rethrows cancellation errors from HTTP requests", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const get = vi.fn<ConnectorContext["http"]["get"]>(async () => {
      throw abortError;
    });

    await expect(
      collect(
        new LegWohnenConnector().fetch(
          makeCtx({ baseUrl: "https://www.leg-wohnen.de" }, get),
          {},
        ),
      ),
    ).rejects.toThrow("aborted");
  });
});
