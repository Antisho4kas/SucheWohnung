import { describe, expect, it, vi } from "vitest";
import {
  KleinanzeigenConnector,
  deriveKleinanzeigenSearchAreas,
  type ProfileForAreas,
} from "../index.js";
import type {
  ConnectorContext,
  HttpClientResponse,
  Logger,
} from "../contract.js";
import type { RawListing } from "../../domain/listing.js";

const jsonResponse = (body: unknown, status = 200): HttpClientResponse => ({
  status,
  headers: {},
  text: async () => JSON.stringify(body),
  json: async <T>() => body as T,
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
  http: { get, post: vi.fn() },
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

const profile = (filters: ProfileForAreas["filters"]): ProfileForAreas => ({
  filters,
});

describe("deriveKleinanzeigenSearchAreas", () => {
  it("maps city + radius + max price into a search area", () => {
    const areas = deriveKleinanzeigenSearchAreas([
      profile([
        { key: "city", operator: "eq", value: "Ingolstadt" },
        {
          key: "location",
          operator: "within",
          value: { lat: 48.7665, lng: 11.4258, radius_km: 50 },
        },
        { key: "price", operator: "lte", value: 850 },
        { key: "rooms", operator: "gte", value: 1.5 },
      ]),
    ]);

    expect(areas).toEqual([
      {
        location: "Ingolstadt",
        radiusKm: 50,
        maxPrice: 850,
        lat: 48.7665,
        lng: 11.4258,
      },
    ]);
  });

  it("supports a city-only profile (no radius/price)", () => {
    const areas = deriveKleinanzeigenSearchAreas([
      profile([{ key: "city", operator: "eq", value: "Berlin" }]),
    ]);
    expect(areas).toEqual([{ location: "Berlin" }]);
  });

  it("skips profiles without a city filter (cannot drive a marketplace search)", () => {
    const areas = deriveKleinanzeigenSearchAreas([
      profile([
        {
          key: "location",
          operator: "within",
          value: { lat: 48.1, lng: 11.5, radius_km: 10 },
        },
      ]),
    ]);
    expect(areas).toEqual([]);
  });

  it("de-duplicates identical areas and respects the cap", () => {
    const dup = profile([
      { key: "city", operator: "eq", value: "Ingolstadt" },
      { key: "price", operator: "lte", value: 850 },
    ]);
    expect(deriveKleinanzeigenSearchAreas([dup, dup])).toHaveLength(1);

    const many = Array.from({ length: 5 }, (_, i) =>
      profile([{ key: "city", operator: "eq", value: `City${i}` }]),
    );
    expect(deriveKleinanzeigenSearchAreas(many, 3)).toHaveLength(3);
  });
});

describe("KleinanzeigenConnector profile-driven multi-area fetch", () => {
  it("crawls one search per area, tags city, stamps geo, and sends radius", async () => {
    const seenSearches: Array<{
      location: string | null;
      radius: string | null;
      maxPrice: string | null;
    }> = [];

    const connector = new KleinanzeigenConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/inserate")) {
        const location = parsed.searchParams.get("location");
        seenSearches.push({
          location,
          radius: parsed.searchParams.get("radius"),
          maxPrice: parsed.searchParams.get("max_price"),
        });
        const adid = location === "Ingolstadt" ? "ing-1" : "pfa-1";
        return jsonResponse({
          results: [
            {
              adid,
              url: `https://example.test/${adid}`,
              title: "Wohnung",
              price: "800",
              description: "Balkon",
              published_at: null,
            },
          ],
        });
      }
      // detail
      return jsonResponse({
        data: { location: { zip: "85049" }, details: { Zimmer: "2" } },
      });
    });

    const ctx = makeCtx(
      {
        baseUrl: "http://kleinanzeigen-api:8000",
        healthPath: "/",
        searchPath: "/inserate",
        detailPath: "/inserat/{adid}",
        query: "wohnung mieten",
        maxPages: 1,
        itemsPerArea: 25,
        searchAreas: [
          {
            location: "Ingolstadt",
            radiusKm: 50,
            maxPrice: 850,
            lat: 48.7665,
            lng: 11.4258,
          },
          {
            location: "Pfaffenhofen an der Ilm",
            radiusKm: 25,
            maxPrice: 850,
            lat: 48.5314,
            lng: 11.5113,
          },
        ],
      },
      get,
    );

    const items = await collect(connector.fetch(ctx, {}));

    expect(items).toHaveLength(2);
    expect(seenSearches).toEqual([
      { location: "Ingolstadt", radius: "50", maxPrice: "850" },
      { location: "Pfaffenhofen an der Ilm", radius: "25", maxPrice: "850" },
    ]);

    const ingolstadt = items.find((i) => i.adid === "ing-1")!;
    expect(ingolstadt.city).toBe("Ingolstadt");
    expect(ingolstadt.geo).toEqual({ lat: 48.7665, lng: 11.4258 });

    const mapped = connector.map(ingolstadt);
    expect(mapped.geo).toEqual({ lat: 48.7665, lng: 11.4258 });
    expect(mapped.city).toBe("Ingolstadt");
    expect(mapped.rooms).toBe(2);
  });

  it("caps results per area with itemsPerArea", async () => {
    const connector = new KleinanzeigenConnector();
    const get = vi.fn<ConnectorContext["http"]["get"]>(async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/inserate")) {
        return jsonResponse({
          results: Array.from({ length: 5 }, (_, i) => ({
            adid: `a-${i}`,
            url: `https://example.test/a-${i}`,
            title: "Wohnung",
            price: "700",
            description: null,
            published_at: null,
          })),
        });
      }
      return jsonResponse({ data: { details: {} } });
    });

    const ctx = makeCtx(
      {
        baseUrl: "http://kleinanzeigen-api:8000",
        searchPath: "/inserate",
        detailPath: "/inserat/{adid}",
        maxPages: 1,
        itemsPerArea: 2,
        searchAreas: [{ location: "Ingolstadt", maxPrice: 850 }],
      },
      get,
    );

    const items = await collect(connector.fetch(ctx, {}));
    expect(items).toHaveLength(2);
  });
});
