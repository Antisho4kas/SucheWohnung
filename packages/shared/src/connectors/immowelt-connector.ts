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
import {
  ConnectorAbortError,
  ConnectorConfigError,
  stringifyError,
} from "./errors.js";

export const IMMOWELT_SOURCE_SLUG = "immowelt";

const ImmoweltConfigSchema = createConnectorConfigSchema({
  baseUrl: z
    .string()
    .url()
    .default("https://www.immowelt.de")
    .transform((url) => url.replace(/\/+$/u, "")),
  healthPath: z.string().min(1).default("/"),
  searchPath: z
    .string()
    .min(1)
    .default("/liste/{city}/wohnungen/mieten")
    .refine((path) => path.includes("{city}"), {
      message: "searchPath must include {city}",
    }),
  city: z.string().min(1).default("ingolstadt"),
  maxPrice: z.number().min(50).max(50000).default(800),
  maxPages: z.number().int().min(1).max(50).default(2),
  pageDelayMs: z.number().int().min(0).max(60000).default(2000),
  userAgent: z.string().min(1).default("SucheWohnung/1.0"),
});

type ImmoweltConfig = z.infer<typeof ImmoweltConfigSchema>;

const isSuccessful = (status: number): boolean => status >= 200 && status < 300;

const parseConfig = (ctx: ConnectorContext): ImmoweltConfig =>
  parseConnectorConfig(ImmoweltConfigSchema, ctx.config, "immowelt");

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

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ConnectorAbortError());
      return;
    }

    const cleanup = () => signal.removeEventListener("abort", abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new ConnectorAbortError());
    };
    signal.addEventListener("abort", abort, { once: true });
  });

export class ImmoweltConnector implements SourceConnector {
  readonly slug = "immowelt";
  readonly type = "scrape" as const;

  async healthCheck(ctx: ConnectorContext): Promise<HealthStatus> {
    try {
      const config = parseConfig(ctx);
      const requestInit = createConnectorRequestInit(config, ctx.signal);
      const res = await ctx.http.get(
        resolveConnectorUrl(config.baseUrl, config.healthPath),
        { ...requestInit, method: "HEAD" },
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
    let config: ImmoweltConfig;
    try {
      config = parseConfig(ctx);
    } catch (error) {
      ctx.logger.error(`Immowelt config error: ${configErrorDetail(error)}`);
      return;
    }

    const maxItems = opts.maxItems ?? Number.POSITIVE_INFINITY;
    let yielded = 0;

    for (let page = 1; page <= config.maxPages && yielded < maxItems; page++) {
      try {
        const searchUrl = new URL(
          resolveConnectorUrl(
            config.baseUrl,
            config.searchPath.replace(
              "{city}",
              encodeURIComponent(config.city),
            ),
          ),
        );
        searchUrl.searchParams.set("d", "true");
        searchUrl.searchParams.set("sd", "DESC");
        searchUrl.searchParams.set("sf", "RELEVANCE");
        searchUrl.searchParams.set("sp", String(page));
        searchUrl.searchParams.set("pmax", String(config.maxPrice));
        const res = await ctx.http.get(
          searchUrl.toString(),
          createConnectorRequestInit(config, ctx.signal),
        );
        if (!isSuccessful(res.status)) break;
        const html = await res.text();

        // Parse listing data from embedded JSON
        const jsonMatch = html.match(
          /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g,
        );
        if (jsonMatch) {
          for (const match of jsonMatch) {
            const inner = match.replace(/<[^>]*>/g, "");
            if (
              inner.includes('"estate"') ||
              inner.includes('"estateListModel"') ||
              inner.includes('"searchresults"')
            ) {
              try {
                const data = JSON.parse(inner);
                const estates =
                  data?.estateListModel?.estates ??
                  data?.searchresults?.estates ??
                  [];
                for (const estate of estates) {
                  if (yielded >= maxItems) break;
                  const raw: RawListing = {
                    adid: String(estate.estateId ?? ""),
                    url: `${config.baseUrl}/expose/${estate.estateId ?? ""}`,
                    title: String(estate.headline ?? estate.title ?? ""),
                    price: Number(estate.mainPrice) || undefined,
                    city: config.city,
                    area: Number(estate.livingArea) || undefined,
                    rooms: Number(estate.numberOfRooms) || undefined,
                    images: [],
                    fullDescription: "",
                    postalCode: String(estate.postalCode ?? ""),
                    details: {},
                    published_at: null,
                    description: String(estate.description ?? ""),
                  };
                  if (raw.adid) {
                    yield raw;
                    yielded++;
                  }
                }
              } catch {
                /* skip failed JSON parse */
              }
              break;
            }
          }
        }
        if (config.pageDelayMs > 0) await wait(config.pageDelayMs, ctx.signal);
      } catch (error) {
        if (isCancellationError(error, ctx.signal)) throw error;
        ctx.logger?.error?.(`Immowelt page ${page}: ${stringifyError(error)}`);
      }
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
