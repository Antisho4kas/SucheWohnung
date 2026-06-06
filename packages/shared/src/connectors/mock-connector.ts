import type { NormalizedListing, RawListing } from "../domain/listing.js";
import { BUNDESLAENDER } from "../domain/enums.js";
import type {
  ConnectorContext,
  FetchOptions,
  HealthStatus,
  SourceConnector,
} from "./contract.js";

/**
 * MockConnector (§05.7, Roadmap S1/Этап 1) — generates synthetic listings so
 * the full pipeline (ingest → validate → dedup → match → notify) can run with
 * zero real sources. Used in development and tests.
 */
const CITIES: Array<{
  city: string;
  bundesland: (typeof BUNDESLAENDER)[number];
  plz: string;
  lat: number;
  lng: number;
}> = [
  {
    city: "Berlin",
    bundesland: "Berlin",
    plz: "10115",
    lat: 52.52,
    lng: 13.405,
  },
  {
    city: "München",
    bundesland: "Bayern",
    plz: "80331",
    lat: 48.137,
    lng: 11.575,
  },
  {
    city: "Hamburg",
    bundesland: "Hamburg",
    plz: "20095",
    lat: 53.55,
    lng: 9.993,
  },
  {
    city: "Frankfurt",
    bundesland: "Hessen",
    plz: "60311",
    lat: 50.11,
    lng: 8.682,
  },
  {
    city: "Köln",
    bundesland: "Nordrhein-Westfalen",
    plz: "50667",
    lat: 50.937,
    lng: 6.96,
  },
];

export const MOCK_SOURCE_SLUG = "mock";

export class MockConnector implements SourceConnector {
  readonly slug = MOCK_SOURCE_SLUG;
  readonly type = "api" as const;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async healthCheck(_ctx: ConnectorContext): Promise<HealthStatus> {
    return { healthy: true, detail: "mock always healthy" };
  }

  async *fetch(
    ctx: ConnectorContext,
    opts: FetchOptions,
  ): AsyncIterable<RawListing> {
    const count = Math.min(opts.maxItems ?? 10, 50);
    const seed = Date.now();
    for (let i = 0; i < count; i++) {
      const loc = CITIES[i % CITIES.length]!;
      const price = 500 + ((seed + i * 137) % 1500);
      yield {
        id: `mock-${seed}-${i}`,
        url: `https://mock.suchewohnung.local/listing/${seed}-${i}`,
        title: `${loc.city} ${1 + (i % 4)}-Zi Wohnung`,
        price,
        warm_rent: price + 150,
        area: 30 + ((seed + i * 7) % 80),
        rooms: 1 + (i % 4) * 0.5 + 1,
        city: loc.city,
        bundesland: loc.bundesland,
        postal_code: loc.plz,
        lat: loc.lat,
        lng: loc.lng,
        balcony: i % 2 === 0,
        elevator: i % 3 === 0,
        parking: i % 4 === 0,
        pets_allowed: i % 5 === 0,
        provisionfrei: i % 2 === 1,
      } satisfies RawListing;
    }
  }

  map(raw: RawListing): NormalizedListing {
    const r = raw as Record<string, any>;
    return {
      sourceSlug: this.slug,
      externalId: String(r.id),
      url: String(r.url),
      title: r.title ? String(r.title) : undefined,
      dealType: "rent",
      price: typeof r.price === "number" ? r.price : undefined,
      warmRent: typeof r.warm_rent === "number" ? r.warm_rent : undefined,
      area: typeof r.area === "number" ? r.area : undefined,
      rooms: typeof r.rooms === "number" ? r.rooms : undefined,
      city: r.city ? String(r.city) : undefined,
      bundesland: r.bundesland,
      postalCode: r.postal_code ? String(r.postal_code) : undefined,
      geo:
        typeof r.lat === "number" && typeof r.lng === "number"
          ? { lat: r.lat, lng: r.lng }
          : undefined,
      attributes: {
        balcony: Boolean(r.balcony),
        elevator: Boolean(r.elevator),
        parking: Boolean(r.parking),
        pets_allowed: Boolean(r.pets_allowed),
        provisionfrei: Boolean(r.provisionfrei),
      },
      images: [],
      raw,
    };
  }
}
