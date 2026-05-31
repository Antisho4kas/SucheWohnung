import type { SourceConnector, FetchOptions, ConnectorContext, HealthStatus } from "./contract.js";
import type { RawListing, NormalizedListing } from "../domain/listing.js";

export const KLEINANZEIGEN_SOURCE_SLUG = "kleinanzeigen";

const API_BASE = process.env.KLEINANZEIGEN_API_URL ?? "http://kleinanzeigen-api:8000";

export class KleinanzeigenConnector implements SourceConnector {
  readonly slug = "kleinanzeigen";
  readonly type = "scrape" as const;

  private buildUrl(city: string, minPrice: number, maxPrice: number, minArea: number, maxArea: number, minRooms: number): string {
    let url = `https://www.kleinanzeigen.de/s-wohnung-mieten/${city}/wohnung-mieten/${city}`;
    if (maxPrice > 0) url += `/preis:${minPrice}:${maxPrice}`;
    if (minArea > 0) url += `/wohnflaeche:${minArea}:${maxArea}`;
    if (minRooms > 0) url += `/zimmer:${minRooms}:`;
    return url;
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) return { healthy: true };
      return { healthy: false, detail: `HTTP ${res.status}` };
    } catch (e) {
      return { healthy: false, detail: String(e) };
    }
  }

  async *fetch(ctx: ConnectorContext, _opts: FetchOptions): AsyncIterable<RawListing> {
    const city = (ctx.config.city as string) ?? "berlin";
    const minPrice = (ctx.config.minPrice as number) ?? 0;
    const maxPrice = (ctx.config.maxPrice as number) ?? 2000;
    const minArea = (ctx.config.minArea as number) ?? 10;
    const maxArea = (ctx.config.maxArea as number) ?? 500;
    const minRooms = (ctx.config.minRooms as number) ?? 1;
    const pages = (ctx.config.maxPages as number) ?? 3;

    const url = this.buildUrl(city, minPrice, maxPrice, minArea, maxArea, minRooms);

    try {
      const body = JSON.stringify({ url, max_pages: pages });
      const res = await fetch(`${API_BASE}/inserate-by-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        ctx.logger?.error?.(`Kleinanzeigen API returned ${res.status}`);
        return;
      }

      const data = (await res.json()) as { results?: KleinanzeigenResult[] };
      const results = data.results ?? [];

      for (const item of results) {
        yield this.mapToRaw(item, city);
      }
    } catch (e) {
      ctx.logger?.error?.(`Kleinanzeigen fetch error: ${String(e)}`);
    }
  }

  private mapToRaw(item: KleinanzeigenResult, city: string): RawListing {
    return {
      adid: item.adid,
      url: item.url,
      title: item.title ?? "",
      price: item.price ? Number(item.price) : undefined,
      description: item.description ?? "",
      city,
      published_at: item.published_at,
    };
  }

  map(raw: RawListing): NormalizedListing {
    const title = (raw.title as string) ?? "";
    const price = typeof raw.price === "number" ? raw.price : parseFloat(String(raw.price ?? "0")) || undefined;
    const url = (raw.url as string) ?? "";
    const adid = (raw.adid as string) ?? "";

    return {
      sourceSlug: this.slug,
      externalId: adid,
      url,
      title: title || undefined,
      price,
      city: (raw.city as string) ?? undefined,
      dealType: "rent",
      attributes: {},
      images: [],
      raw,
    };
  }
}

interface KleinanzeigenResult {
  adid: string;
  url: string;
  title: string | null;
  price: string | null;
  description: string | null;
  published_at: string | null;
}
