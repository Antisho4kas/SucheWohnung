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
});

type KleinanzeigenConfig = z.infer<typeof KleinanzeigenConfigSchema>;

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

    try {
      const requestInit = createConnectorRequestInit(config, ctx.signal);
      const searchUrl = new URL(
        resolveConnectorUrl(config.baseUrl, config.searchPath),
      );
      searchUrl.searchParams.set("query", config.query);
      searchUrl.searchParams.set("location", config.city);
      searchUrl.searchParams.set("max_price", String(config.maxPrice));
      searchUrl.searchParams.set("page_count", String(config.maxPages));

      const res = await ctx.http.get(searchUrl.toString(), requestInit);
      if (!isSuccessful(res.status)) return;
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

      const maxItems = opts.maxItems ?? Number.POSITIVE_INFINITY;
      let yielded = 0;

      for (const item of data.results ?? []) {
        const priceNum = item.price ? Number(item.price) : 0;
        if (priceNum < 50) continue;
        if (yielded >= maxItems) break;

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
          city: config.city,
          published_at: item.published_at,
          area: detail.area,
          rooms: detail.rooms,
          images: detail.images ?? [],
          fullDescription: detail.fullDescription ?? "",
          postalCode: detail.postalCode ?? "",
          details: detail.details ?? {},
        };
        yield raw;
        yielded++;
      }
    } catch (error) {
      if (isCancellationError(error, ctx.signal)) throw error;
      ctx.logger?.error?.(`Kleinanzeigen fetch error: ${String(error)}`);
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
    };
  }
}
