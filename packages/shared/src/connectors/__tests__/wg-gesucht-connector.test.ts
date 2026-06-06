import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  ConnectorContext,
  HttpClientResponse,
  Logger,
} from "../contract.js";
import { NormalizedListingSchema } from "../../domain/listing.js";
import {
  WgGesuchtConnector,
  WG_GESUCHT_SOURCE_SLUG,
} from "../wg-gesucht-connector.js";

const fixtureHtml = readFileSync(
  join(
    process.cwd(),
    "packages/shared/src/connectors/__tests__/fixtures/wg-gesucht-search.html",
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
  connector: WgGesuchtConnector,
  ctx: ConnectorContext,
) => {
  const items = [];
  for await (const item of connector.fetch(ctx, {})) items.push(item);
  return items;
};

describe("WgGesuchtConnector", () => {
  it("fetches public search pages and maps JSON-LD ItemList RealEstateListing data", async () => {
    const connector = new WgGesuchtConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url, init) => {
      expect(String(url)).not.toContain("/api/");
      expect(init).toMatchObject({
        headers: { "User-Agent": "FixtureAgent/1.0" },
        signal: ctx.signal,
      });

      const parsed = new URL(url);
      if (parsed.pathname === "/health") return textResponse("ok");

      expect(url).toBe(
        "https://www.wg-gesucht.test/public/search.html?offer_filter=1",
      );
      return textResponse(fixtureHtml);
    });
    const ctx = makeCtx(
      {
        baseUrl: "https://www.wg-gesucht.test/",
        healthPath: "/health",
        searchPath: "/public/search.html?offer_filter=1",
        maxPages: 1,
        pageDelayMs: 0,
        userAgent: "FixtureAgent/1.0",
      },
      get,
    );

    await expect(connector.healthCheck(ctx)).resolves.toEqual({
      healthy: true,
    });
    const items = await collect(connector, ctx);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      adid: "1234567",
      url: "https://www.wg-gesucht.test/wg-zimmer-in-Ingolstadt-Mitte.1234567.html",
      title: "Helles WG-Zimmer in 3er WG",
      price: 640,
      rooms: 1,
      postalCode: "85049",
      city: "Ingolstadt",
      address: "Theresienstr. 12, 85049 Ingolstadt",
      rentType: "wg_room",
      isWg: true,
    });
    expect(items[1]).toMatchObject({
      adid: "2345678",
      price: 1180,
      rooms: 2,
      postalCode: "85057",
      rentType: "apartment",
      isApartment: true,
    });
    expect(items[2]).toMatchObject({
      adid: "3456789",
      price: 710,
      rooms: 1.5,
      postalCode: "85051",
      rentType: "sublet",
      isSublet: true,
    });

    const mappedWg = connector.map(items[0]!);
    expect(() => NormalizedListingSchema.parse(mappedWg)).not.toThrow();
    expect(mappedWg).toMatchObject({
      sourceSlug: WG_GESUCHT_SOURCE_SLUG,
      externalId: "1234567",
      price: 640,
      rooms: 1,
      city: "Ingolstadt",
      postalCode: "85049",
      attributes: {
        wg: true,
        rent_type: "wg_room",
      },
    });
    expect(mappedWg.images).toEqual([
      { url: "https://img.wg-gesucht.test/1234567/1.jpg", position: 0 },
      { url: "https://img.wg-gesucht.test/1234567/2.jpg", position: 1 },
    ]);

    const mappedApartment = connector.map(items[1]!);
    expect(mappedApartment).toMatchObject({
      externalId: "2345678",
      attributes: {
        apartment: true,
        rent_type: "apartment",
      },
    });
    expect(mappedApartment.images).toEqual([
      { url: "https://img.wg-gesucht.test/2345678/main.jpg", position: 0 },
    ]);

    const mappedSublet = connector.map(items[2]!);
    expect(mappedSublet).toMatchObject({
      externalId: "3456789",
      attributes: {
        sublet: true,
        rent_type: "sublet",
      },
    });
  });

  it("honors maxItems before requesting another public search page", async () => {
    const connector = new WgGesuchtConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
      expect(String(url)).not.toContain("/api/");
      return textResponse(fixtureHtml);
    });
    const ctx = makeCtx(
      {
        baseUrl: "https://www.wg-gesucht.test",
        searchPath: "/search.html",
        maxPages: 2,
        pageDelayMs: 0,
      },
      get,
    );

    const items = [];
    for await (const item of connector.fetch(ctx, { maxItems: 1 })) {
      items.push(item);
    }

    expect(items).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("rejects /api/ endpoints in config before issuing HTTP requests", async () => {
    const connector = new WgGesuchtConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>();
    const ctx = makeCtx(
      {
        baseUrl: "https://www.wg-gesucht.test",
        healthPath: "/api/health",
        searchPath: "/api/search",
      },
      get,
    );

    await expect(connector.healthCheck(ctx)).resolves.toMatchObject({
      healthy: false,
      detail: expect.stringContaining("api"),
    });
    await expect(collect(connector, ctx)).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it("uses the public Ingolstadt default search page and derives ids from numeric detail URLs", async () => {
    const connector = new WgGesuchtConnector();
    const html = `
      <script type="application/ld+json">
        {
          "@type":"ItemList",
          "itemListElement":[{
            "@type":"ListItem",
            "item":{
              "@type":"RealEstateListing",
              "url":"/13337376.html",
              "name":"WG-Zimmer in Ingolstadt",
              "description":"1 Zimmer, 735 € warm",
              "address":{"postalCode":"85049","addressLocality":"Ingolstadt"}
            }
          }]
        }
      </script>
    `;
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
      expect(String(url)).toBe(
        "https://www.wg-gesucht.test/wohnungen-in-Ingolstadt.65.2.1.0.html",
      );
      expect(String(url)).not.toContain("/api/");
      return textResponse(html);
    });
    const ctx = makeCtx(
      {
        baseUrl: "https://www.wg-gesucht.test",
        maxPages: 1,
        pageDelayMs: 0,
      },
      get,
    );

    const items = await collect(connector, ctx);
    const mapped = connector.map(items[0]!);

    expect(items[0]).toMatchObject({
      adid: "13337376",
      url: "https://www.wg-gesucht.test/13337376.html",
      price: 735,
      rooms: 1,
      postalCode: "85049",
    });
    expect(mapped.externalId).toBe("13337376");
  });
});
