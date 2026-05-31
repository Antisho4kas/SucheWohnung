import type { NormalizedListing, RawListing } from "../domain/listing.js";

/**
 * SourceConnector contract (§09.2). The core knows ONLY this interface and the
 * metadata in the `sources` table — never source-specific details. A new source
 * = a new class implementing this contract + a row in `sources` (§09.1, §18.5).
 */

export type ConnectorType = "api" | "scrape";

export interface HealthStatus {
  readonly healthy: boolean;
  readonly detail?: string;
}

export interface FetchOptions {
  /** Incremental cursor / pagination token from the previous run. */
  readonly cursor?: string;
  /** Only fetch items updated since this time (incremental mode, §9.4). */
  readonly updatedSince?: Date;
  /** Soft cap on number of items for a single run. */
  readonly maxItems?: number;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface HttpClientResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export interface HttpClient {
  get(url: string, init?: Record<string, unknown>): Promise<HttpClientResponse>;
  post(url: string, init?: Record<string, unknown>): Promise<HttpClientResponse>;
}

/** Lazily-created Playwright browser pool (§09.5). */
export interface BrowserPool {
  withPage<T>(fn: (page: unknown) => Promise<T>): Promise<T>;
}

export interface DecryptedCredentials {
  readonly type: string;
  readonly secret: Record<string, unknown>;
}

export interface ConnectorContext {
  readonly config: Record<string, unknown>;
  readonly credentials?: DecryptedCredentials;
  readonly http: HttpClient;
  readonly browser: BrowserPool;
  readonly logger: Logger;
  readonly signal: AbortSignal;
}

export interface SourceConnector {
  readonly slug: string;
  readonly type: ConnectorType;
  healthCheck(ctx: ConnectorContext): Promise<HealthStatus>;
  fetch(ctx: ConnectorContext, opts: FetchOptions): AsyncIterable<RawListing>;
  map(raw: RawListing): NormalizedListing;
}

/** Connector registry — autoscan/explicit registration target (§09.2). */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, SourceConnector>();

  register(connector: SourceConnector): void {
    if (this.connectors.has(connector.slug)) {
      throw new Error(`Connector already registered: ${connector.slug}`);
    }
    this.connectors.set(connector.slug, connector);
  }

  get(slug: string): SourceConnector | undefined {
    return this.connectors.get(slug);
  }

  list(): SourceConnector[] {
    return [...this.connectors.values()];
  }
}
