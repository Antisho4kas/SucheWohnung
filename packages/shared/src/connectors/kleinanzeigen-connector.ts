import type {
  SourceConnector,
  FetchOptions,
  ConnectorContext,
  HealthStatus,
} from "./contract.js";
import type { RawListing, NormalizedListing } from "../domain/listing.js";
import { z } from "zod";
import {
  createConnectorRequestInit,
  createConnectorConfigSchema,
  parseConnectorConfig,
  resolveConnectorUrl,
} from "./config.js";
import { ConnectorAbortError, ConnectorConfigError } from "./errors.js";

export const KLEINANZEIGEN_SOURCE_SLUG = "kleinanzeigen";

/**
 * A single profile-derived search area. The ebay-kleinanzeigen adapter performs
 * the geographic radius filtering at the source (location string + radius km),
 * so each area maps directly onto one adapter `/inserate` query. `lat`/`lng`
 * (the area centre) are stamped onto every collected listing so that
 * radius (`location within`) profile filters evaluate as matched downstream.
 */
const SearchAreaSchema = z.object({
  location: z.string().min(1),
  radiusKm: z.number().int().min(0).max(200).optional(),
  maxPrice: z.number().min(50).max(50000).optional(),
  query: z.string().min(1).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type KleinanzeigenSearchArea = z.infer<typeof SearchAreaSchema>;

const KleinanzeigenConfigSchema = createConnectorConfigSchema({
  baseUrl: z
    .string()
    .url()
    .default("http://localhost:8000")
    .transform((url) => url.replace(/\/+$/u, "")),
  healthPath: z.string().min(1).default("/health"),
  searchPath: z.string().min(1).default("/inserate"),
  detailPath: z
    .string()
    .min(1)
    .default("/inserat/{adid}")
    .refine((path) => path.includes("{adid}"), {
      message: "detailPath must include {adid}",
    }),
  query: z.string().min(1).default("wohnung mieten"),
  city: z.string().min(1).default("ingolstadt"),
  maxPrice: z.number().min(50).max(50000).default(800),
  maxPages: z.number().int().min(1).max(50).default(1),
  batchId: z.string().min(1).default("suchewohnung"),
  // Optional default radius (km) applied to the fallback single-city search.
  radiusKm: z.number().int().min(0).max(200).optional(),
  // Profile-driven search areas. When present and non-empty, the connector
  // crawls each area instead of the single `city`. Capped by `maxAreas`.
  searchAreas: z.array(SearchAreaSchema).optional(),
  maxAreas: z.number().int().min(1).max(50).default(10),
  // Per-area item cap used in multi-area (profile-driven) mode.
  itemsPerArea: z.number().int().min(1).max(200).default(25),
});

type KleinanzeigenConfig = z.infer<typeof KleinanzeigenConfigSchema>;

/**
 * Profile filter (subset) used to derive kleinanzeigen search areas.
 */
export type ProfileFilterLite = {
  key: string;
  operator: string;
  value: unknown;
};

export type ProfileForAreas = { filters: ProfileFilterLite[] };

/**
 * Derive de-duplicated kleinanzeigen search areas from active search profiles.
 *
 * Mapping (per profile):
 *  - `city` (eq)         -> adapter `location` string (required; profiles
 *                            without a city filter cannot drive a marketplace
 *                            search and are skipped).
 *  - `location` (within) -> radius km + area centre lat/lng.
 *  - `price` (lte)       -> adapter `max_price`.
 *
 * Areas are de-duplicated by (location|radius|maxPrice) and capped to `maxAreas`.
 */
export function deriveKleinanzeigenSearchAreas(
  profiles: readonly ProfileForAreas[],
  maxAreas = 10,
): KleinanzeigenSearchArea[] {
  const byKey = new Map<string, KleinanzeigenSearchArea>();

  for (const profile of profiles) {
    const cityFilter = profile.filters.find(
      (f) => f.key === "city" && f.operator === "eq",
    );
    const location =
      typeof cityFilter?.value === "string" ? cityFilter.value.trim() : "";
    if (!location) continue;

    const geoFilter = profile.filters.find(
      (f) => f.key === "location" && f.operator === "within",
    );
    const geo =
      geoFilter && typeof geoFilter.value === "object" && geoFilter.value
        ? (geoFilter.value as {
            lat?: number;
            lng?: number;
            radius_km?: number;
          })
        : undefined;
    const radiusKm =
      typeof geo?.radius_km === "number" && geo.radius_km > 0
        ? Math.round(geo.radius_km)
        : undefined;
    const lat = typeof geo?.lat === "number" ? geo.lat : undefined;
    const lng = typeof geo?.lng === "number" ? geo.lng : undefined;

    const priceFilter = profile.filters.find(
      (f) => f.key === "price" && f.operator === "lte",
    );
    const maxPrice =
      typeof priceFilter?.value === "number" && priceFilter.value >= 50
        ? Math.min(priceFilter.value, 50000)
        : undefined;

    const key = `${location.toLowerCase()}|${radiusKm ?? ""}|${maxPrice ?? ""}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      location,
      ...(radiusKm !== undefined ? { radiusKm } : {}),
      ...(maxPrice !== undefined ? { maxPrice } : {}),
      ...(lat !== undefined ? { lat } : {}),
      ...(lng !== undefined ? { lng } : {}),
    });
    if (byKey.size >= maxAreas) break;
  }

  return [...byKey.values()];
}

const isSuccessful = (status: number): boolean => status >= 200 && status < 300;

const parseConfig = (ctx: ConnectorContext): KleinanzeigenConfig =>
  parseConnectorConfig(KleinanzeigenConfigSchema, ctx.config, "kleinanzeigen");

const configErrorDetail = (error: unknown): string =>
  error instanceof ConnectorConfigError && error.issues
    ? error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")
    : error instanceof z.ZodError
      ? error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")
      : String(error);

const isCancellationError = (error: unknown, signal: AbortSignal): boolean =>
  signal.aborted ||
  error instanceof ConnectorAbortError ||
  (error instanceof Error && error.name === "AbortError");

export class KleinanzeigenConnector implements SourceConnector {
  readonly slug = "kleinanzeigen";
  readonly type = "scrape" as const;

  async healthCheck(ctx: ConnectorContext): Promise<HealthStatus> {
    try {
      const config = parseConfig(ctx);
      const requestInit = createConnectorRequestInit(config, ctx.signal);
      const res = await ctx.http.get(
        resolveConnectorUrl(config.baseUrl, config.healthPath),
        requestInit,
      );
      return { healthy: isSuccessful(res.status) };
    } catch (error) {
      if (isCancellationError(error, ctx.signal)) throw error;
      return { healthy: false, detail: configErrorDetail(error) };
    }
  }

  async *fetch(
    ctx: ConnectorContext,
    opts: FetchOptions,
  ): AsyncIterable<RawListing> {
    let config: KleinanzeigenConfig;
    try {
      config = parseConfig(ctx);
    } catch (error) {
      ctx.logger.error(
        `Kleinanzeigen config error: ${configErrorDetail(error)}`,
      );
      return;
    }

    const requestInit = createConnectorRequestInit(config, ctx.signal);
    const globalMax = opts.maxItems ?? Number.POSITIVE_INFINITY;

    // Profile-driven mode: crawl each derived search area. Fallback: single city.
    const multiArea = (config.searchAreas?.length ?? 0) > 0;
    const areas: KleinanzeigenSearchArea[] = multiArea
      ? config.searchAreas!.slice(0, config.maxAreas)
      : [
          {
            location: config.city,
            ...(config.radiusKm !== undefined
              ? { radiusKm: config.radiusKm }
              : {}),
            maxPrice: config.maxPrice,
            query: config.query,
          },
        ];
    // In multi-area mode the budget is per-area (itemsPerArea); the single
    // global `maxItems` is intentionally not applied as a cross-area total so
    // each profile area is crawled independently (overall bound is
    // maxAreas * itemsPerArea). In single-area mode the global cap applies.
    const perAreaMax = multiArea ? config.itemsPerArea : globalMax;
    const totalCap = multiArea ? Number.POSITIVE_INFINITY : globalMax;

    let totalYielded = 0;
    for (const area of areas) {
      if (totalYielded >= totalCap) break;
      let areaYielded = 0;
      try {
        const searchUrl = new URL(
          resolveConnectorUrl(config.baseUrl, config.searchPath),
        );
        searchUrl.searchParams.set("query", area.query ?? config.query);
        searchUrl.searchParams.set("location", area.location);
        searchUrl.searchParams.set(
          "max_price",
          String(area.maxPrice ?? config.maxPrice),
        );
        searchUrl.searchParams.set("page_count", String(config.maxPages));
        const areaRadius = area.radiusKm ?? config.radiusKm;
        if (typeof areaRadius === "number" && areaRadius > 0) {
          searchUrl.searchParams.set("radius", String(areaRadius));
        }

        const res = await ctx.http.get(searchUrl.toString(), requestInit);
        if (!isSuccessful(res.status)) continue;
        const data = (await res.json()) as {
          results?: {
            adid: string;
            url: string;
            title: string | null;
            price: string | null;
            description: string | null;
            published_at: string | null;
          }[];
        };

        for (const item of data.results ?? []) {
          const priceNum = item.price ? Number(item.price) : 0;
          if (priceNum < 50) continue;
          if (areaYielded >= perAreaMax) break;
          if (totalYielded >= totalCap) break;

          // Fetch listing details for area/rooms/images
          const detail: {
            area?: number;
            rooms?: number;
            images?: string[];
            fullDescription?: string;
            postalCode?: string;
            details?: Record<string, string>;
          } = {};
          try {
            const detailPath = config.detailPath.replace(
              "{adid}",
              encodeURIComponent(item.adid),
            );
            const detailUrl = new URL(
              resolveConnectorUrl(config.baseUrl, detailPath),
            );
            detailUrl.searchParams.set("batch_id", config.batchId);
            const detailRes = await ctx.http.get(
              detailUrl.toString(),
              requestInit,
            );
            if (isSuccessful(detailRes.status)) {
              const d = (await detailRes.json()) as {
                data?: {
                  price?: { amount?: string };
                  location?: { zip?: string; city?: string };
                  description?: string;
                  images?: string[];
                  details?: Record<string, string>;
                };
              };
              const dd = d.data;
              if (dd) {
                // Parse area from details (e.g. "Wohnfläche: 65 m²")
                const flaeche =
                  dd.details?.["Wohnfläche"] ??
                  dd.details?.["Wohnflaeche"] ??
                  dd.details?.["Fläche"];
                detail.area = flaeche
                  ? parseFloat(
                      String(flaeche)
                        .replace(/[^0-9.,]/g, "")
                        .replace(",", "."),
                    ) || undefined
                  : undefined;
                const zimmer =
                  dd.details?.["Zimmer"] ?? dd.details?.["Zimmeranzahl"];
                detail.rooms = zimmer
                  ? parseFloat(
                      String(zimmer)
                        .replace(/[^0-9.,]/g, "")
                        .replace(",", "."),
                    ) || undefined
                  : undefined;
                detail.images = dd.images ?? [];
                detail.fullDescription = dd.description ?? "";
                detail.postalCode = dd.location?.zip ?? "";
                detail.details = dd.details ?? {};
              }
            }
          } catch (error) {
            if (isCancellationError(error, ctx.signal)) throw error;
            /* skip detail fetch errors */
          }

          const raw: RawListing = {
            adid: item.adid,
            url: item.url,
            title: item.title ?? "",
            price: priceNum,
            description: item.description ?? "",
            city: area.location,
            published_at: item.published_at,
            area: detail.area,
            rooms: detail.rooms,
            images: detail.images ?? [],
            fullDescription: detail.fullDescription ?? "",
            postalCode: detail.postalCode ?? "",
            details: detail.details ?? {},
            // Stamp the area centre so radius (`location within`) profile
            // filters evaluate as matched for listings collected for this area.
            ...(typeof area.lat === "number" && typeof area.lng === "number"
              ? { geo: { lat: area.lat, lng: area.lng } }
              : {}),
          };
          yield raw;
          areaYielded++;
          totalYielded++;
        }
      } catch (error) {
        if (isCancellationError(error, ctx.signal)) throw error;
        ctx.logger?.error?.(
          `Kleinanzeigen fetch error for "${area.location}": ${String(error)}`,
        );
      }
    }
  }

  map(raw: RawListing): NormalizedListing {
    const title = (raw.title as string) ?? "";
    const priceVal = raw.price as number | undefined;
    const price = priceVal != null && priceVal >= 50 ? priceVal : undefined;
    const url = (raw.url as string) ?? "";
    const adid = (raw.adid as string) ?? "";
    const areaVal = raw.area as number | undefined;
    const roomsVal = raw.rooms as number | undefined;
    const desc =
      (raw.fullDescription as string) || (raw.description as string) || "";
    const images = (raw.images as string[]) ?? [];
    const postalCode = (raw.postalCode as string) || undefined;
    const details = (raw.details as Record<string, string>) ?? {};
    const rawGeo = raw.geo as { lat?: number; lng?: number } | undefined;
    const geo =
      rawGeo &&
      typeof rawGeo.lat === "number" &&
      typeof rawGeo.lng === "number"
        ? { lat: rawGeo.lat, lng: rawGeo.lng }
        : undefined;

    const attributes: Record<string, boolean | undefined> = {};
    if (desc) {
      attributes.balcony = /balkon/i.test(desc) || undefined;
      attributes.elevator = /aufzug|lift|fahrstuhl/i.test(desc) || undefined;
      attributes.parking =
        /stellplatz|garage|tiefgarage/i.test(desc) || undefined;
      attributes.furnished =
        /möbliert|einbauküche|ebk/i.test(desc) || undefined;
      attributes.pets_allowed =
        /haustier|hunde|katzen/i.test(desc) || undefined;
      attributes.new_building = /neubau|erstbezug/i.test(desc) || undefined;
    }

    return {
      sourceSlug: this.slug,
      externalId: adid,
      url,
      title: title || undefined,
      price,
      area: areaVal,
      rooms: roomsVal,
      city: (raw.city as string) ?? undefined,
      dealType: "rent",
      attributes,
      images: images.map((img, i) => ({ url: img, position: i })),
      raw: { ...raw, fullDescription: desc, details },
      postalCode,
      ...(geo ? { geo } : {}),
    };
  }
}
