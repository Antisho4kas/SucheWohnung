import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NormalizedListingSchema } from "../../domain/listing.js";
import type {
  ConnectorContext,
  HttpClientResponse,
  Logger,
} from "../contract.js";
import {
  WohnungsboerseConnector,
  WOHNUNGSBOERSE_SOURCE_SLUG,
} from "../wohnungsboerse-connector.js";

const fixtureHtml = readFileSync(
  join(
    process.cwd(),
    "packages/shared/src/connectors/__tests__/fixtures/wohnungsboerse-search.html",
  ),
  "utf8",
);

const detailHtml = readFileSync(
  join(
    process.cwd(),
    "packages/shared/src/connectors/__tests__/fixtures/wohnungsboerse-detail.html",
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

const collect = async (connector: WohnungsboerseConnector, ctx: ConnectorContext) => {
  const items = [];
  for await (const item of connector.fetch(ctx, {})) items.push(item);
  return items;
};

describe("WohnungsboerseConnector", () => {
  it("fetches public Berlin search pages, parses result cards, and maps NormalizedListing", async () => {
    const connector = new WohnungsboerseConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url, init) => {
      expect(String(url)).not.toMatch(/ajax|rss/iu);
      expect(init).toMatchObject({
        headers: { "User-Agent": "FixtureAgent/1.0" },
        signal: ctx.signal,
      });

      const parsed = new URL(url);
      if (parsed.pathname === "/healthz") return textResponse("ok");
      if (parsed.pathname === "/immodetail/19900186") {
        return textResponse(detailHtml);
      }
      if (parsed.pathname === "/immodetail/19900187") {
        return textResponse("not found", 404);
      }

      expect(parsed.pathname).toBe("/searches/index");
      expect(parsed.searchParams.get("existing")).toBe("1");
      expect(parsed.searchParams.get("marketing_type")).toBe("miete");
      expect(parsed.searchParams.get("estate_types[0]")).toBe("1");
      expect(parsed.searchParams.get("term")).toBe("Berlin");
      expect(parsed.searchParams.get("page")).toBe("1");
      expect(parsed.searchParams.get("minprice")).toBe("600");
      expect(parsed.searchParams.get("maxprice")).toBe("1500");
      expect(parsed.searchParams.get("minrooms")).toBe("1.5");
      expect(parsed.searchParams.get("maxrooms")).toBe("3");
      return textResponse(fixtureHtml);
    });
    const ctx = makeCtx(
      {
        healthPath: "/healthz",
        searchPath: "/searches/index?existing=1",
        city: "Berlin",
        minPrice: 600,
        maxPrice: 1500,
        minRooms: 1.5,
        maxRooms: 3,
        maxPages: 1,
        pageDelayMs: 0,
        userAgent: "FixtureAgent/1.0",
      },
      get,
    );

    expect(connector.slug).toBe(WOHNUNGSBOERSE_SOURCE_SLUG);
    expect(connector.type).toBe("scrape");
    await expect(connector.healthCheck(ctx)).resolves.toEqual({ healthy: true });
    const items = await collect(connector, ctx);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      adid: "19900186",
      url: "https://www.wohnungsboerse.net/immodetail/19900186",
      title: "Neubau, helle 3-Raum-Wohnung in ruhiger Lage",
      price: 1270,
      warmRent: 1540,
      area: 78,
      rooms: 2,
      city: "Berlin",
      postalCode: "13055",
      address: "Berkenbrücker Steig, 13055 Berlin, Alt-Hohenschönhausen",
      description: "Neubau, schöne und helle Wohnung mit Balkon, Aufzug und Keller.",
      details: {
        district: "Alt-Hohenschönhausen",
        street: "Berkenbrücker Steig",
        rentLabel: "Kaltmiete",
      },
    });
    expect(items[0]?.images).toEqual([
      "https://www.wohnungsboerse.net/assets/estates/1136x757/detail-1.jpg?id=50573935",
      "https://www.wohnungsboerse.net/assets/estates/1136x757/detail-2.jpg?id=50573936",
    ]);

    const mapped = connector.map(items[0]!);
    expect(NormalizedListingSchema.safeParse(mapped).success).toBe(true);
    expect(mapped).toMatchObject({
      sourceSlug: WOHNUNGSBOERSE_SOURCE_SLUG,
      externalId: "19900186",
      url: "https://www.wohnungsboerse.net/immodetail/19900186",
      title: "Neubau, helle 3-Raum-Wohnung in ruhiger Lage",
      price: 1270,
      warmRent: 1540,
      area: 78,
      rooms: 2,
      city: "Berlin",
      postalCode: "13055",
      dealType: "rent",
      attributes: {
        balcony: true,
        elevator: true,
        parking: true,
        cellar: true,
        district: "Alt-Hohenschönhausen",
        street: "Berkenbrücker Steig",
        address: "Berkenbrücker Steig, 13055 Berlin, Alt-Hohenschönhausen",
      },
    });
    expect(mapped.images).toEqual([
      {
        url: "https://www.wohnungsboerse.net/assets/estates/1136x757/detail-1.jpg?id=50573935",
        position: 0,
      },
      {
        url: "https://www.wohnungsboerse.net/assets/estates/1136x757/detail-2.jpg?id=50573936",
        position: 1,
      },
    ]);

    const mappedWarm = connector.map(items[1]!);
    expect(NormalizedListingSchema.safeParse(mappedWarm).success).toBe(true);
    expect(mappedWarm).toMatchObject({
      externalId: "19900187",
      warmRent: 980,
      area: 42.5,
      rooms: 1.5,
      attributes: {
        furnished: true,
        terrace: true,
        pets_allowed: true,
        district: "Mitte",
      },
    });
  });

  it("honors maxItems before requesting another public search page", async () => {
    const connector = new WohnungsboerseConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
      expect(String(url)).not.toMatch(/ajax|rss/iu);
      return textResponse(fixtureHtml);
    });
    const ctx = makeCtx(
      {
        searchPath: "/searches/index",
        city: "Berlin",
        maxPages: 2,
        pageDelayMs: 0,
      },
      get,
    );

    const items = [];
    for await (const item of connector.fetch(ctx, { maxItems: 1 })) items.push(item);

    expect(items).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(new URL(String(get.mock.calls[0]?.[0])).searchParams.get("page")).toBe("1");
    expect(new URL(String(get.mock.calls[1]?.[0])).pathname).toBe(
      "/immodetail/19900186",
    );
  });

  it("rejects invalid and disallowed ajax/rss config before HTTP requests", async () => {
    const connector = new WohnungsboerseConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>();
    const invalidCtx = makeCtx(
      { baseUrl: "http://169.254.169.254", maxPages: 0, pageDelayMs: -1 },
      get,
    );

    await expect(connector.healthCheck(invalidCtx)).resolves.toMatchObject({
      healthy: false,
    });
    await expect(collect(connector, invalidCtx)).resolves.toEqual([]);

    const disallowedCtx = makeCtx(
      {
        healthPath: "/searches/index/marketing_type:miete/rss:1/",
        searchPath: "/searches/index?rss=1",
      },
      get,
    );
    await expect(connector.healthCheck(disallowedCtx)).resolves.toMatchObject({
      healthy: false,
      detail: expect.stringContaining("ajax/rss"),
    });
    await expect(collect(connector, disallowedCtx)).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it("derives stable IDs and canonical URLs from immodetail URLs", () => {
    const mapped = new WohnungsboerseConnector().map({
      url: "https://WWW.WOHNUNGSBOERSE.NET/immodetail/19900186?utm_source=test#top",
      title: "2-Zimmer-Wohnung",
      price: 900,
      area: 65,
      rooms: 2,
      city: "Berlin",
      images: [],
    });

    expect(mapped.externalId).toBe("19900186");
    expect(mapped.url).toBe("https://www.wohnungsboerse.net/immodetail/19900186");
  });

  it("rethrows cancellation errors from HTTP requests", async () => {
    const connector = new WohnungsboerseConnector();
    const abortError = new DOMException("aborted", "AbortError");
    const get = vi.fn<ConnectorContext["http"]["get"]>(async () => {
      throw abortError;
    });

    await expect(
      collect(
        connector,
        makeCtx({}, get),
      ),
    ).rejects.toThrow("aborted");
  });
});
