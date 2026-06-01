import type { SourceConnector, FetchOptions, ConnectorContext, HealthStatus } from "./contract.js";
import type { RawListing, NormalizedListing } from "../domain/listing.js";

export const KLEINANZEIGEN_SOURCE_SLUG = "kleinanzeigen";

const API_BASE = process.env.KLEINANZEIGEN_API_URL ?? "http://localhost:8000";

export class KleinanzeigenConnector implements SourceConnector {
  readonly slug = "kleinanzeigen";
  readonly type = "scrape" as const;

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
    const maxPrice = (ctx.config.maxPrice as number) ?? 2000;
    const pages = (ctx.config.maxPages as number) ?? 3;

    const params = new URLSearchParams({
      query: `wohnung mieten`,
      location: city,
      max_price: String(maxPrice),
      page_count: String(pages),
    });

    try {
      const res = await fetch(`${API_BASE}/inserate?${params.toString()}`);

      if (!res.ok) {
        ctx.logger?.error?.(`Kleinanzeigen API returned ${res.status}`);
        return;
      }

      const data = (await res.json()) as { results?: KleinanzeigenResult[] };
      const results = data.results ?? [];

      for (const item of results) {
        const priceNum = item.price ? Number(item.price) : 0;
        if (priceNum < 50) continue;
        yield this.mapToRaw(item, city);
      }
    } catch (e) {
      ctx.logger?.error?.(`Kleinanzeigen fetch error: ${String(e)}`);
    }
  }

  private mapToRaw(item: KleinanzeigenResult, city: string): RawListing {
    const priceNum = item.price ? Number(item.price) : 0;
    return {
      adid: item.adid,
      url: item.url,
      title: item.title ?? "",
      price: priceNum >= 50 ? priceNum : undefined,
      description: item.description ?? "",
      city,
      published_at: item.published_at,
    };
  }

  map(raw: RawListing): NormalizedListing {
    const title = (raw.title as string) ?? "";
    const priceVal = raw.price as number | undefined;
    const price = priceVal != null && priceVal >= 50 ? priceVal : undefined;
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
