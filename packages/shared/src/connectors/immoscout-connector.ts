import type { SourceConnector, FetchOptions, ConnectorContext, HealthStatus } from "./contract.js";
import type { RawListing, NormalizedListing } from "../domain/listing.js";

export const IMMOSCOUT_SOURCE_SLUG = "immoscout";

const API_BASE = process.env.IMMOSCOUT_API_URL ?? "http://localhost:8001";

export class ImmoscoutConnector implements SourceConnector {
  readonly slug = "immoscout";
  readonly type = "scrape" as const;

  async healthCheck(): Promise<HealthStatus> {
    try { const res = await fetch(`${API_BASE}/health`); return { healthy: res.ok }; } catch { return { healthy: false }; }
  }

  async *fetch(ctx: ConnectorContext, _opts: FetchOptions): AsyncIterable<RawListing> {
    const city = (ctx.config.city as string) ?? "Ingolstadt";
    const maxPrice = (ctx.config.maxPrice as number) ?? 800;
    const minRooms = (ctx.config.minRooms as number) ?? 1.5;
    const pages = (ctx.config.maxPages as number) ?? 2;

    const params = new URLSearchParams({ city, max_price: String(maxPrice), min_rooms: String(minRooms), pages: String(pages) });

    try {
      const res = await fetch(`${API_BASE}/search?${params.toString()}`);
      if (!res.ok) { ctx.logger?.error?.(`Immoscout API returned ${res.status}`); return; }

      const data = (await res.json()) as { results?: ImmoscoutItem[] };
      for (const item of data.results ?? []) {
        const raw: RawListing = {
          adid: item.id,
          url: item.url,
          title: item.title ?? "",
          price: item.price ?? undefined,
          city: item.city ?? city,
          area: item.area ?? undefined,
          rooms: item.rooms ?? undefined,
          postalCode: item.postalCode ?? "",
          images: [],
          fullDescription: "",
          details: {},
          published_at: null,
          description: item.street ? `${item.street}, ${item.postalCode} ${item.city}` : "",
        };
        const p = raw.price as number | undefined;
        if (p && p >= 50) yield raw;
      }
    } catch (e) { ctx.logger?.error?.(`Immoscout fetch error: ${String(e)}`); }
  }

  map(raw: RawListing): NormalizedListing {
    return {
      sourceSlug: this.slug,
      externalId: String(raw.adid ?? ""),
      url: String(raw.url ?? ""),
      title: (raw.title as string) || undefined,
      price: typeof raw.price === "number" ? raw.price : undefined,
      area: typeof raw.area === "number" ? raw.area : undefined,
      rooms: typeof raw.rooms === "number" ? raw.rooms : undefined,
      city: (raw.city as string) ?? undefined,
      postalCode: (raw.postalCode as string) || undefined,
      dealType: "rent",
      attributes: {},
      images: [],
      raw,
    };
  }
}

interface ImmoscoutItem {
  id: string;
  url: string;
  title: string | null;
  price: number | null;
  area: number | null;
  rooms: number | null;
  city: string | null;
  postalCode: string | null;
  street: string | null;
}
