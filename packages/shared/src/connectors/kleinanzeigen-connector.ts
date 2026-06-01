import type { SourceConnector, FetchOptions, ConnectorContext, HealthStatus } from "./contract.js";
import type { RawListing, NormalizedListing } from "../domain/listing.js";

export const KLEINANZEIGEN_SOURCE_SLUG = "kleinanzeigen";

const API_BASE = process.env.KLEINANZEIGEN_API_URL ?? "http://localhost:8000";

export class KleinanzeigenConnector implements SourceConnector {
  readonly slug = "kleinanzeigen";
  readonly type = "scrape" as const;

  async healthCheck(): Promise<HealthStatus> {
    try { const res = await fetch(`${API_BASE}/health`); if (res.ok) return { healthy: true }; return { healthy: false }; } catch { return { healthy: false }; }
  }

  async *fetch(ctx: ConnectorContext, _opts: FetchOptions): AsyncIterable<RawListing> {
    const city = (ctx.config.city as string) ?? "ingolstadt";
    const maxPrice = (ctx.config.maxPrice as number) ?? 800;
    const pages = (ctx.config.maxPages as number) ?? 1;

    const params = new URLSearchParams({ query: "wohnung mieten", location: city, max_price: String(maxPrice), page_count: String(pages) });

    try {
      const res = await fetch(`${API_BASE}/inserate?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { results?: { adid: string; url: string; title: string | null; price: string | null; description: string | null; published_at: string | null }[] };
      
      for (const item of data.results ?? []) {
        const priceNum = item.price ? Number(item.price) : 0;
        if (priceNum < 50) continue;

        // Fetch listing details for area/rooms/images
        const detail: { area?: number; rooms?: number; images?: string[]; fullDescription?: string; postalCode?: string; details?: Record<string, string> } = {};
        try {
          const detailRes = await fetch(`${API_BASE}/inserat/${item.adid}?batch_id=suchewohnung`);
          if (detailRes.ok) {
            const d = (await detailRes.json()) as { data?: { price?: { amount?: string }; location?: { zip?: string; city?: string }; description?: string; images?: string[]; details?: Record<string, string> } };
            const dd = d.data;
            if (dd) {
              // Parse area from details (e.g. "Wohnfläche: 65 m²")
              const flaeche = dd.details?.["Wohnfläche"] ?? dd.details?.["Wohnflaeche"] ?? dd.details?.["Fläche"];
              detail.area = flaeche ? parseFloat(String(flaeche).replace(/[^0-9.,]/g, "").replace(",", ".")) || undefined : undefined;
              const zimmer = dd.details?.["Zimmer"] ?? dd.details?.["Zimmeranzahl"];
              detail.rooms = zimmer ? parseFloat(String(zimmer).replace(/[^0-9.,]/g, "").replace(",", ".")) || undefined : undefined;
              detail.images = dd.images ?? [];
              detail.fullDescription = dd.description ?? "";
              detail.postalCode = dd.location?.zip ?? "";
              detail.details = dd.details ?? {};
            }
          }
        } catch { /* skip detail fetch errors */ }

        const raw: RawListing = {
          adid: item.adid, url: item.url, title: item.title ?? "", price: priceNum,
          description: item.description ?? "", city,
          published_at: item.published_at,
          area: detail.area, rooms: detail.rooms, images: detail.images ?? [],
          fullDescription: detail.fullDescription ?? "", postalCode: detail.postalCode ?? "",
          details: detail.details ?? {},
        };
        yield raw;
      }
    } catch (e) { ctx.logger?.error?.(`Kleinanzeigen fetch error: ${String(e)}`); }
  }

  map(raw: RawListing): NormalizedListing {
    const title = (raw.title as string) ?? "";
    const priceVal = raw.price as number | undefined;
    const price = priceVal != null && priceVal >= 50 ? priceVal : undefined;
    const url = (raw.url as string) ?? "";
    const adid = (raw.adid as string) ?? "";
    const areaVal = raw.area as number | undefined;
    const roomsVal = raw.rooms as number | undefined;
    const desc = (raw.fullDescription as string) || (raw.description as string) || "";
    const images = (raw.images as string[]) ?? [];
    const postalCode = (raw.postalCode as string) || undefined;
    const details = (raw.details as Record<string, string>) ?? {};

    const attributes: Record<string, boolean | undefined> = {};
    if (desc) {
      attributes.balcony = /balkon/i.test(desc) || undefined;
      attributes.elevator = /aufzug|lift|fahrstuhl/i.test(desc) || undefined;
      attributes.parking = /stellplatz|garage|tiefgarage/i.test(desc) || undefined;
      attributes.furnished = /möbliert|einbauküche|ebk/i.test(desc) || undefined;
      attributes.pets_allowed = /haustier|hunde|katzen/i.test(desc) || undefined;
      attributes.new_building = /neubau|erstbezug/i.test(desc) || undefined;
    }

    return {
      sourceSlug: this.slug, externalId: adid, url, title: title || undefined,
      price, area: areaVal, rooms: roomsVal,
      city: (raw.city as string) ?? undefined, dealType: "rent",
      attributes, images: images.map((img, i) => ({ url: img, position: i })),
      raw: { ...raw, fullDescription: desc, details }, postalCode,
    };
  }
}
