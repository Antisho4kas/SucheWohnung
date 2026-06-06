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

export const IMMOSCOUT_SOURCE_SLUG = "immoscout";

const ImmoscoutConfigSchema = createConnectorConfigSchema({
  baseUrl: z
    .string()
    .url()
    .default("http://localhost:8001")
    .transform((url) => url.replace(/\/+$/u, "")),
  healthPath: z.string().min(1).default("/health"),
  searchPath: z.string().min(1).default("/search"),
  city: z.string().min(1).default("Ingolstadt"),
  maxPrice: z.number().min(50).max(50000).default(800),
  minRooms: z.number().min(0.5).max(20).default(1.5),
  maxPages: z.number().int().min(1).max(50).default(2),
});

type ImmoscoutConfig = z.infer<typeof ImmoscoutConfigSchema>;

const isSuccessful = (status: number): boolean => status >= 200 && status < 300;

const parseConfig = (ctx: ConnectorContext): ImmoscoutConfig =>
  parseConnectorConfig(ImmoscoutConfigSchema, ctx.config, "immoscout");

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

export class ImmoscoutConnector implements SourceConnector {
  readonly slug = "immoscout";
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
    let config: ImmoscoutConfig;
    try {
      config = parseConfig(ctx);
    } catch (error) {
      ctx.logger.error(`Immoscout config error: ${configErrorDetail(error)}`);
      return;
    }

    try {
      const requestInit = createConnectorRequestInit(config, ctx.signal);
      const searchUrl = new URL(
        resolveConnectorUrl(config.baseUrl, config.searchPath),
      );
      searchUrl.searchParams.set("city", config.city);
      searchUrl.searchParams.set("max_price", String(config.maxPrice));
      searchUrl.searchParams.set("min_rooms", String(config.minRooms));
      searchUrl.searchParams.set("pages", String(config.maxPages));

      const res = await ctx.http.get(searchUrl.toString(), requestInit);
      if (!isSuccessful(res.status)) {
        ctx.logger.error(`Immoscout API returned ${res.status}`);
        return;
      }

      const data = (await res.json()) as { results?: ImmoscoutItem[] };
      const maxItems = opts.maxItems ?? Number.POSITIVE_INFINITY;
      let yielded = 0;

      for (const item of data.results ?? []) {
        if (yielded >= maxItems) break;
        const raw: RawListing = {
          adid: item.id,
          url: item.url,
          title: item.title ?? "",
          price: item.price ?? undefined,
          city: item.city ?? config.city,
          area: item.area ?? undefined,
          rooms: item.rooms ?? undefined,
          postalCode: item.postalCode ?? "",
          images: [],
          fullDescription: "",
          details: {},
          published_at: null,
          description: item.street
            ? `${item.street}, ${item.postalCode} ${item.city}`
            : "",
        };
        const p = raw.price as number | undefined;
        if (p && p >= 50) {
          yield raw;
          yielded++;
        }
      }
    } catch (error) {
      if (isCancellationError(error, ctx.signal)) throw error;
      ctx.logger?.error?.(`Immoscout fetch error: ${String(error)}`);
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
