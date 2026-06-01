import type { SourceConnector, FetchOptions, ConnectorContext, HealthStatus } from "./contract.js";
import type { RawListing, NormalizedListing } from "../domain/listing.js";

export const IMMOSCOUT_SOURCE_SLUG = "immoscout";

export class ImmoscoutConnector implements SourceConnector {
  readonly slug = "immoscout";
  readonly type = "scrape" as const;

  private ua = "SucheWohnung/1.0 (Wohnungssuche)";

  async healthCheck(): Promise<HealthStatus> {
    try { const res = await fetch("https://www.immobilienscout24.de", { method: "HEAD", headers: { "User-Agent": this.ua } }); return { healthy: res.ok }; } catch { return { healthy: false }; }
  }

  async *fetch(ctx: ConnectorContext, _opts: FetchOptions): AsyncIterable<RawListing> {
    const city = (ctx.config.city as string) ?? "Ingolstadt";
    const maxPrice = (ctx.config.maxPrice as number) ?? 800;
    const pages = (ctx.config.maxPages as number) ?? 2;

    for (let page = 1; page <= pages; page++) {
      try {
        const url = `https://www.immobilienscout24.de/Suche/de/bayern/${city.toLowerCase()}/wohnung-mieten?pagenumber=${page}&price=-${maxPrice}&sorting=2`;
        const res = await fetch(url, { headers: { "User-Agent": this.ua } });
        if (!res.ok) break;
        const html = await res.text();

        // Parse embedded listing data
        const jsonMatch = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g);
        if (jsonMatch) {
          for (const match of jsonMatch) {
            const inner = match.replace(/<[^>]*>/g, "");
            if (inner.includes('"resultlist.resultlist"')) {
              try {
                const data = JSON.parse(inner);
                const results = data?.["resultlist.resultlist"]?.resultlistEntries?.resultlistEntry ?? [];
                for (const entry of results) {
                  const attrs = entry?.resultlistRealEstate ?? entry ?? {};
                  const raw: RawListing = {
                    adid: String(attrs["@id"] ?? entry["@id"] ?? ""),
                    url: entry?.url ?? `https://www.immobilienscout24.de/expose/${attrs["@id"] ?? entry["@id"] ?? ""}`,
                    title: String(attrs.title ?? ""),
                    price: Number(attrs?.calculatedPrice?.value) || Number(attrs?.price) || undefined,
                    city: String(attrs?.address?.Description?.text ?? city),
                    area: Number(attrs?.livingSpace) || undefined,
                    rooms: Number(attrs?.numberOfRooms) || undefined,
                    postalCode: String(attrs?.address?.postCode ?? ""),
                    images: [],
                    fullDescription: "",
                    details: {},
                    published_at: null,
                    description: String(attrs?.description ?? ""),
                  };
                  if (raw.adid) yield raw;
                }
              } catch { /* skip */ }
              break;
            }
          }
        }
        await new Promise(r => setTimeout(r, 3000));
      } catch (e) { ctx.logger?.error?.(`Immoscout page ${page}: ${String(e)}`); }
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
