import type { SourceConnector, FetchOptions, ConnectorContext, HealthStatus } from "./contract.js";
import type { RawListing, NormalizedListing } from "../domain/listing.js";

export const IMMOWELT_SOURCE_SLUG = "immowelt";

export class ImmoweltConnector implements SourceConnector {
  readonly slug = "immowelt";
  readonly type = "scrape" as const;

  async healthCheck(): Promise<HealthStatus> {
    try { const res = await fetch("https://www.immowelt.de", { method: "HEAD" }); return { healthy: res.ok }; } catch { return { healthy: false }; }
  }

  async *fetch(ctx: ConnectorContext, _opts: FetchOptions): AsyncIterable<RawListing> {
    const city = (ctx.config.city as string) ?? "ingolstadt";
    const maxPrice = (ctx.config.maxPrice as number) ?? 800;
    const pages = (ctx.config.maxPages as number) ?? 2;

    for (let page = 1; page <= pages; page++) {
      try {
        const url = `https://www.immowelt.de/liste/${city}/wohnungen/mieten?d=true&sd=DESC&sf=RELEVANCE&sp=${page}&pmax=${maxPrice}`;
        const res = await fetch(url, { headers: { "User-Agent": "SucheWohnung/1.0" } });
        if (!res.ok) break;
        const html = await res.text();

        // Parse listing data from embedded JSON
        const jsonMatch = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g);
        if (jsonMatch) {
          for (const match of jsonMatch) {
            const inner = match.replace(/<[^>]*>/g, "");
            if (inner.includes('"estate"') || inner.includes('"searchresults"')) {
              try {
                const data = JSON.parse(inner);
                const estates = data?.estateListModel?.estates ?? data?.searchresults?.estates ?? [];
                for (const estate of estates) {
                  const raw: RawListing = {
                    adid: String(estate.estateId ?? ""),
                    url: `https://www.immowelt.de/expose/${estate.estateId ?? ""}`,
                    title: String(estate.headline ?? estate.title ?? ""),
                    price: Number(estate.mainPrice) || undefined,
                    city: city,
                    area: Number(estate.livingArea) || undefined,
                    rooms: Number(estate.numberOfRooms) || undefined,
                    images: [],
                    fullDescription: "",
                    postalCode: String(estate.postalCode ?? ""),
                    details: {},
                    published_at: null,
                    description: String(estate.description ?? ""),
                  };
                  if (raw.adid) yield raw;
                }
              } catch { /* skip failed JSON parse */ }
              break;
            }
          }
        }
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) { ctx.logger?.error?.(`Immowelt page ${page}: ${String(e)}`); }
    }
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
      dealType: "rent",
      attributes: {},
      images: [],
      raw,
    };
  }
}
