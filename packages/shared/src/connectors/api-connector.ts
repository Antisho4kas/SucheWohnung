import type { z } from "zod";
import type {
  ConnectorContext,
  FetchOptions,
  HealthStatus,
  SourceConnector,
} from "./contract.js";
import type { NormalizedListing, RawListing } from "../domain/listing.js";
import {
  ConnectorBaseConfigSchema,
  createConnectorRequestInit,
  parseConnectorConfig,
  resolveConnectorUrl,
  type ConnectorRequestConfig,
} from "./config.js";
import { ConnectorHttpError } from "./errors.js";

export abstract class ApiConnector<
  Config extends object = z.infer<typeof ConnectorBaseConfigSchema>,
> implements SourceConnector {
  abstract readonly slug: string;
  readonly type = "api" as const;

  protected constructor(
    protected readonly configSchema: z.ZodType<Config> = ConnectorBaseConfigSchema as unknown as z.ZodType<Config>,
  ) {}

  abstract healthCheck(ctx: ConnectorContext): Promise<HealthStatus>;
  abstract fetch(
    ctx: ConnectorContext,
    opts: FetchOptions,
  ): AsyncIterable<RawListing>;
  abstract map(raw: RawListing): NormalizedListing;

  protected parseConfig(ctx: ConnectorContext): Config {
    return parseConnectorConfig(this.configSchema, ctx.config, this.slug);
  }

  protected resolveUrl(
    config: { readonly baseUrl?: string },
    pathOrUrl: string,
  ): string {
    return resolveConnectorUrl(config.baseUrl, pathOrUrl);
  }

  protected async getJson<T>(
    ctx: ConnectorContext,
    config: ConnectorRequestConfig & { readonly baseUrl?: string },
    pathOrUrl: string,
  ): Promise<T> {
    const url = this.resolveUrl(config, pathOrUrl);
    const response = await ctx.http.get(
      url,
      createConnectorRequestInit(config, ctx.signal),
    );
    if (!isHttpOk(response.status, response.ok)) {
      throw new ConnectorHttpError(url, response.status, await response.text());
    }
    return response.json<T>();
  }
}

function isHttpOk(status: number, ok: boolean | undefined): boolean {
  return ok ?? (status >= 200 && status < 300);
}
