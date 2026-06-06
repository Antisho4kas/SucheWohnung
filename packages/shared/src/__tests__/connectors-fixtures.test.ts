import { describe, expect, it, vi } from "vitest";
import {
  ImmoscoutConnector,
  ImmoweltConnector,
  KleinanzeigenConnector,
  WgGesuchtConnector,
} from "../index.js";
import type {
  ConnectorContext,
  HttpClientResponse,
  Logger,
} from "../connectors/contract.js";
import type { RawListing } from "../domain/listing.js";

const jsonResponse = (body: unknown, status = 200): HttpClientResponse => ({
  status,
  headers: {},
  text: async () => JSON.stringify(body),
  json: async <T>() => body as T,
});

const textResponse = (body: string, status = 200): HttpClientResponse => ({
  status,
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
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
};

describe("existing source connectors", () => {
  it("uses ctx.http/config for Kleinanzeigen search/detail and preserves mapping behavior", async () => {
    const connector = new KleinanzeigenConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url, init) => {
      expect(init?.signal).toBe(ctx.signal);
      const parsed = new URL(url);

      if (parsed.pathname.endsWith("/healthz")) {
        return jsonResponse({ ok: true });
      }

      if (parsed.pathname.endsWith("/ads")) {
        expect(parsed.searchParams.get("query")).toBe("wohnung mieten");
        expect(parsed.searchParams.get("location")).toBe("augsburg");
        expect(parsed.searchParams.get("max_price")).toBe("1200");
        expect(parsed.searchParams.get("page_count")).toBe("2");

        return jsonResponse({
          results: [
            {
              adid: "ka-1",
              url: "https://example.test/ka-1",
              title: "Helle Wohnung",
              price: "950",
              description: "Balkon und Garage",
              published_at: "2026-01-01T00:00:00.000Z",
            },
            {
              adid: "ka-cheap",
              url: "https://example.test/ka-cheap",
              title: "Too cheap",
              price: "49",
              description: null,
              published_at: null,
            },
          ],
        });
      }

      if (parsed.pathname.endsWith("/detail/ka-1")) {
        expect(parsed.searchParams.get("batch_id")).toBe("fixtures");

        return jsonResponse({
          data: {
            location: { zip: "86150", city: "Augsburg" },
            description:
              "Balkon, Aufzug, Garage, Einbauküche, Haustiere erlaubt, Neubau",
            images: [
              "https://img.example.test/1.jpg",
              "https://img.example.test/2.jpg",
            ],
            details: {
              Wohnfläche: "65,5 m²",
              Zimmer: "2,5",
            },
          },
        });
      }

      throw new Error(`unexpected url: ${url}`);
    });
    const ctx = makeCtx(
      {
        baseUrl: "https://kleinanzeigen.test/api/",
        healthPath: "/healthz",
        searchPath: "/ads",
        detailPath: "/detail/{adid}",
        query: "wohnung mieten",
        city: "augsburg",
        maxPrice: 1200,
        maxPages: 2,
        batchId: "fixtures",
      },
      get,
    );

    await expect(connector.healthCheck(ctx)).resolves.toEqual({
      healthy: true,
    });
    const items = await collect(connector.fetch(ctx, {}));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      adid: "ka-1",
      price: 950,
      city: "augsburg",
      area: 65.5,
      rooms: 2.5,
      postalCode: "86150",
    });
    expect(get).toHaveBeenCalledTimes(3);

    const mapped = connector.map(items[0]!);
    expect(mapped).toMatchObject({
      sourceSlug: "kleinanzeigen",
      externalId: "ka-1",
      price: 950,
      area: 65.5,
      rooms: 2.5,
      postalCode: "86150",
      attributes: {
        balcony: true,
        elevator: true,
        parking: true,
        furnished: true,
        pets_allowed: true,
        new_building: true,
      },
    });
    expect(mapped.images).toEqual([
      { url: "https://img.example.test/1.jpg", position: 0 },
      { url: "https://img.example.test/2.jpg", position: 1 },
    ]);
  });

  it("uses ctx.http/config for Immoscout search and preserves mapping behavior", async () => {
    const connector = new ImmoscoutConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url, init) => {
      expect(init?.signal).toBe(ctx.signal);
      const parsed = new URL(url);

      if (parsed.pathname.endsWith("/status")) {
        return jsonResponse({ ok: true });
      }

      if (parsed.pathname.endsWith("/find")) {
        expect(parsed.searchParams.get("city")).toBe("Regensburg");
        expect(parsed.searchParams.get("max_price")).toBe("1400");
        expect(parsed.searchParams.get("min_rooms")).toBe("2");
        expect(parsed.searchParams.get("pages")).toBe("3");

        return jsonResponse({
          results: [
            {
              id: "is24-1",
              url: "https://example.test/is24-1",
              title: "Altbau",
              price: 1100,
              area: 80,
              rooms: 3,
              city: "Regensburg",
              postalCode: "93047",
              street: "Maxstrasse 1",
            },
            {
              id: "is24-free",
              url: "https://example.test/free",
              title: "Bad fixture",
              price: 0,
              area: 10,
              rooms: 1,
              city: "Regensburg",
              postalCode: "93047",
              street: null,
            },
          ],
        });
      }

      throw new Error(`unexpected url: ${url}`);
    });
    const ctx = makeCtx(
      {
        baseUrl: "https://immoscout.test/api/",
        healthPath: "/status",
        searchPath: "/find",
        city: "Regensburg",
        maxPrice: 1400,
        minRooms: 2,
        maxPages: 3,
      },
      get,
    );

    await expect(connector.healthCheck(ctx)).resolves.toEqual({
      healthy: true,
    });
    const items = await collect(connector.fetch(ctx, {}));

    expect(items).toEqual([
      {
        adid: "is24-1",
        url: "https://example.test/is24-1",
        title: "Altbau",
        price: 1100,
        city: "Regensburg",
        area: 80,
        rooms: 3,
        postalCode: "93047",
        images: [],
        fullDescription: "",
        details: {},
        published_at: null,
        description: "Maxstrasse 1, 93047 Regensburg",
      },
    ]);

    const mapped = connector.map(items[0]!);
    expect(mapped).toMatchObject({
      sourceSlug: "immoscout",
      externalId: "is24-1",
      price: 1100,
      area: 80,
      rooms: 3,
      city: "Regensburg",
      postalCode: "93047",
      attributes: {},
      images: [],
    });
  });

  it("uses ctx.http/config for Immowelt HTML parser and preserves mapping behavior", async () => {
    const connector = new ImmoweltConnector();
    const html = `
      <html>
        <body>
          <script type="application/json">
            {"estateListModel":{"estates":[{"estateId":"iw-1","headline":"Maisonette","mainPrice":"790","livingArea":"55","numberOfRooms":"2","postalCode":"85049","description":"Terrasse"}]}}
          </script>
        </body>
      </html>
    `;
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url, init) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/ready") {
        expect(init).toMatchObject({ method: "HEAD", signal: ctx.signal });
        return textResponse("");
      }

      expect(url).toBe(
        "https://immowelt.test/custom/ingolstadt/rent?d=true&sd=DESC&sf=RELEVANCE&sp=1&pmax=900",
      );
      expect(init).toMatchObject({
        headers: { "User-Agent": "FixtureAgent/1.0" },
        signal: ctx.signal,
      });

      return textResponse(html);
    });
    const ctx = makeCtx(
      {
        baseUrl: "https://immowelt.test/",
        healthPath: "/ready",
        searchPath: "/custom/{city}/rent",
        city: "ingolstadt",
        maxPrice: 900,
        maxPages: 1,
        pageDelayMs: 0,
        userAgent: "FixtureAgent/1.0",
      },
      get,
    );

    await expect(connector.healthCheck(ctx)).resolves.toEqual({
      healthy: true,
    });
    const items = await collect(connector.fetch(ctx, {}));

    expect(items).toEqual([
      {
        adid: "iw-1",
        url: "https://immowelt.test/expose/iw-1",
        title: "Maisonette",
        price: 790,
        city: "ingolstadt",
        area: 55,
        rooms: 2,
        images: [],
        fullDescription: "",
        postalCode: "85049",
        details: {},
        published_at: null,
        description: "Terrasse",
      },
    ]);

    const mapped = connector.map(items[0]!);
    expect(mapped).toMatchObject({
      sourceSlug: "immowelt",
      externalId: "iw-1",
      url: "https://immowelt.test/expose/iw-1",
      price: 790,
      area: 55,
      rooms: 2,
      city: "ingolstadt",
    });
  });

  it("honors FetchOptions.maxItems before yielding extra listings", async () => {
    const kleinanzeigenGet = vi.fn<ConnectorContext["http"]["get"]>(
      async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/inserate")) {
          return jsonResponse({
            results: [
              {
                adid: "ka-1",
                url: "https://example.test/ka-1",
                title: "One",
                price: "900",
                description: null,
                published_at: null,
              },
              {
                adid: "ka-2",
                url: "https://example.test/ka-2",
                title: "Two",
                price: "950",
                description: null,
                published_at: null,
              },
            ],
          });
        }
        return jsonResponse({ data: {} });
      },
    );
    const kleinanzeigenCtx = makeCtx(
      { baseUrl: "https://kleinanzeigen.test", maxPages: 1 },
      kleinanzeigenGet,
    );

    await expect(
      collect(
        new KleinanzeigenConnector().fetch(kleinanzeigenCtx, { maxItems: 1 }),
      ),
    ).resolves.toHaveLength(1);
    expect(
      kleinanzeigenGet.mock.calls.some(([url]) => String(url).includes("ka-2")),
    ).toBe(false);

    const immoscoutGet = vi.fn<ConnectorContext["http"]["get"]>(async () =>
      jsonResponse({
        results: [
          {
            id: "is-1",
            url: "https://example.test/is-1",
            title: "One",
            price: 900,
            area: 50,
            rooms: 2,
            city: "Berlin",
            postalCode: "10115",
            street: null,
          },
          {
            id: "is-2",
            url: "https://example.test/is-2",
            title: "Two",
            price: 950,
            area: 55,
            rooms: 2,
            city: "Berlin",
            postalCode: "10115",
            street: null,
          },
        ],
      }),
    );
    const immoscoutCtx = makeCtx(
      { baseUrl: "https://immoscout.test", city: "Berlin" },
      immoscoutGet,
    );

    await expect(
      collect(new ImmoscoutConnector().fetch(immoscoutCtx, { maxItems: 1 })),
    ).resolves.toHaveLength(1);

    const immoweltHtml = `<script type="application/json">{"estateListModel":{"estates":[{"estateId":"iw-1","headline":"One","mainPrice":900,"livingArea":50,"numberOfRooms":2,"postalCode":"10115","description":""},{"estateId":"iw-2","headline":"Two","mainPrice":950,"livingArea":55,"numberOfRooms":2,"postalCode":"10115","description":""}]}}</script>`;
    const immoweltGet = vi.fn<ConnectorContext["http"]["get"]>(async () =>
      textResponse(immoweltHtml),
    );
    const immoweltCtx = makeCtx(
      {
        baseUrl: "https://immowelt.test",
        city: "berlin",
        maxPages: 1,
        pageDelayMs: 0,
      },
      immoweltGet,
    );

    await expect(
      collect(new ImmoweltConnector().fetch(immoweltCtx, { maxItems: 1 })),
    ).resolves.toHaveLength(1);

    const wgGesuchtHtml = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"RealEstateListing","identifier":"wg-1","url":"/wg-zimmer-in-Berlin.1.html","name":"WG-Zimmer","description":"1 Zimmer, 600 EUR warm","address":{"postalCode":"10115","addressLocality":"Berlin"}}},{"@type":"ListItem","item":{"@type":"RealEstateListing","identifier":"wg-2","url":"/wohnungen-in-Berlin.2.html","name":"Wohnung","description":"2 Zimmer, 900 EUR warm","address":{"postalCode":"10115","addressLocality":"Berlin"}}}]}</script>`;
    const wgGesuchtGet = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
      expect(String(url)).not.toContain("/api/");
      return textResponse(wgGesuchtHtml);
    });
    const wgGesuchtCtx = makeCtx(
      {
        baseUrl: "https://wg-gesucht.test",
        searchPath: "/search.html",
        maxPages: 1,
        pageDelayMs: 0,
      },
      wgGesuchtGet,
    );

    await expect(
      collect(new WgGesuchtConnector().fetch(wgGesuchtCtx, { maxItems: 1 })),
    ).resolves.toHaveLength(1);
  });

  it("rejects invalid connector config before issuing HTTP requests", async () => {
    const get = vi.fn<ConnectorContext["http"]["get"]>();
    const ctx = makeCtx({ baseUrl: "not-a-url", maxPages: 0 }, get);

    await expect(
      new KleinanzeigenConnector().healthCheck(ctx),
    ).resolves.toMatchObject({ healthy: false });
    await expect(
      new ImmoscoutConnector().healthCheck(ctx),
    ).resolves.toMatchObject({ healthy: false });
    await expect(
      new ImmoweltConnector().healthCheck(ctx),
    ).resolves.toMatchObject({ healthy: false });

    await expect(
      collect(new KleinanzeigenConnector().fetch(ctx, {})),
    ).resolves.toEqual([]);
    await expect(
      collect(new ImmoscoutConnector().fetch(ctx, {})),
    ).resolves.toEqual([]);
    await expect(
      collect(new ImmoweltConnector().fetch(ctx, {})),
    ).resolves.toEqual([]);
    await expect(
      collect(new WgGesuchtConnector().fetch(ctx, {})),
    ).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it("keeps configured query strings and reports invalid config fields", async () => {
    const kleinanzeigenGet = vi.fn<ConnectorContext["http"]["get"]>(
      async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/inserate")) {
          expect(parsed.searchParams.get("existing")).toBe("1");
          expect(parsed.searchParams.get("query")).toBe("wohnung mieten");
          return jsonResponse({ results: [] });
        }
        return jsonResponse({});
      },
    );
    const kleinanzeigenCtx = makeCtx(
      {
        baseUrl: "https://kleinanzeigen.test",
        searchPath: "/inserate?existing=1",
      },
      kleinanzeigenGet,
    );

    await expect(
      collect(new KleinanzeigenConnector().fetch(kleinanzeigenCtx, {})),
    ).resolves.toEqual([]);

    const immoscoutGet = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
      const parsed = new URL(url);
      expect(parsed.searchParams.get("existing")).toBe("1");
      expect(parsed.searchParams.get("city")).toBe("Berlin");
      return jsonResponse({ results: [] });
    });
    const immoscoutCtx = makeCtx(
      {
        baseUrl: "https://immoscout.test",
        searchPath: "/search?existing=1",
        city: "Berlin",
      },
      immoscoutGet,
    );

    await expect(
      collect(new ImmoscoutConnector().fetch(immoscoutCtx, {})),
    ).resolves.toEqual([]);

    await expect(
      new ImmoweltConnector().healthCheck(
        makeCtx({ searchPath: "/missing-city" }, vi.fn()),
      ),
    ).resolves.toMatchObject({
      healthy: false,
      detail: expect.stringContaining("searchPath"),
    });

    await expect(
      new WgGesuchtConnector().healthCheck(
        makeCtx({ searchPath: "/api/search" }, vi.fn()),
      ),
    ).resolves.toMatchObject({
      healthy: false,
      detail: expect.stringContaining("api"),
    });
  });

  it("rethrows cancellation errors from connector HTTP requests", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const get = vi.fn<ConnectorContext["http"]["get"]>(async () => {
      throw abortError;
    });

    await expect(
      collect(
        new KleinanzeigenConnector().fetch(
          makeCtx({ baseUrl: "https://kleinanzeigen.test" }, get),
          {},
        ),
      ),
    ).rejects.toThrow("aborted");
    await expect(
      collect(
        new ImmoscoutConnector().fetch(
          makeCtx({ baseUrl: "https://immoscout.test" }, get),
          {},
        ),
      ),
    ).rejects.toThrow("aborted");
    await expect(
      collect(
        new ImmoweltConnector().fetch(
          makeCtx(
            {
              baseUrl: "https://immowelt.test",
              maxPages: 1,
              pageDelayMs: 0,
            },
            get,
          ),
          {},
        ),
      ),
    ).rejects.toThrow("aborted");
    await expect(
      collect(
        new WgGesuchtConnector().fetch(
          makeCtx(
            {
              baseUrl: "https://wg-gesucht.test",
              maxPages: 1,
              pageDelayMs: 0,
            },
            get,
          ),
          {},
        ),
      ),
    ).rejects.toThrow("aborted");
  });

  it("passes validated request config to connector HTTP calls", async () => {
    const retry = {
      maxAttempts: 2,
      baseDelayMs: 10,
      maxDelayMs: 20,
      jitter: false,
    };
    const config = {
      baseUrl: "https://kleinanzeigen.test",
      timeoutMs: 1234,
      retry,
      headers: { "X-Source": "fixture" },
      maxPages: 1,
    };
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url, init) => {
      expect(init).toMatchObject({
        timeoutMs: 1234,
        retry,
        headers: { "X-Source": "fixture" },
      });
      if (String(url).includes("/inserate")) {
        return jsonResponse({
          results: [
            {
              adid: "ka-1",
              url: "https://example.test/ka-1",
              title: "One",
              price: "900",
              description: null,
              published_at: null,
            },
          ],
        });
      }
      return jsonResponse({ data: {} });
    });

    await expect(
      collect(new KleinanzeigenConnector().fetch(makeCtx(config, get), {})),
    ).resolves.toHaveLength(1);

    const immoweltGet = vi.fn<ConnectorContext["http"]["get"]>(
      async (_url, init) => {
        expect(init).toMatchObject({
          timeoutMs: 1234,
          retry,
          headers: { "X-Source": "fixture", "User-Agent": "FixtureAgent/2.0" },
        });
        return textResponse(
          `<script type="application/json">{"estateListModel":{"estates":[]}}</script>`,
        );
      },
    );

    await expect(
      collect(
        new ImmoweltConnector().fetch(
          makeCtx(
            {
              ...config,
              baseUrl: "https://immowelt.test",
              city: "berlin",
              pageDelayMs: 0,
              userAgent: "FixtureAgent/2.0",
            },
            immoweltGet,
          ),
          {},
        ),
      ),
    ).resolves.toEqual([]);

    const wgGesuchtGet = vi.fn<ConnectorContext["http"]["get"]>(
      async (_url, init) => {
        expect(init).toMatchObject({
          timeoutMs: 1234,
          retry,
          headers: { "X-Source": "fixture", "User-Agent": "FixtureAgent/3.0" },
        });
        return textResponse(
          `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[]}</script>`,
        );
      },
    );

    await expect(
      collect(
        new WgGesuchtConnector().fetch(
          makeCtx(
            {
              ...config,
              baseUrl: "https://wg-gesucht.test",
              searchPath: "/search.html",
              pageDelayMs: 0,
              userAgent: "FixtureAgent/3.0",
            },
            wgGesuchtGet,
          ),
          {},
        ),
      ),
    ).resolves.toEqual([]);
  });
});
