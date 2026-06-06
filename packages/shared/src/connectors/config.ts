import { z } from "zod";
import type { HttpClientRequestInit } from "./contract.js";
import { ConnectorConfigError } from "./errors.js";
import {
  DEFAULT_RETRY_POLICY,
  DEFAULT_RETRY_STATUSES,
  type RetryPolicyInput,
} from "./retry.js";

export const ConnectorRetryConfigSchema = z
  .object({
    maxAttempts: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(DEFAULT_RETRY_POLICY.maxAttempts),
    baseDelayMs: z
      .number()
      .int()
      .nonnegative()
      .max(300_000)
      .default(DEFAULT_RETRY_POLICY.baseDelayMs),
    maxDelayMs: z
      .number()
      .int()
      .nonnegative()
      .max(900_000)
      .default(DEFAULT_RETRY_POLICY.maxDelayMs),
    jitter: z.boolean().default(DEFAULT_RETRY_POLICY.jitter),
    retryStatuses: z
      .array(z.number().int().min(100).max(599))
      .default([...DEFAULT_RETRY_STATUSES]),
  })
  .default({});

export const ConnectorBaseConfigSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    timeoutMs: z.number().int().positive().max(900_000).default(10_000),
    headers: z.record(z.string()).default({}),
    userAgent: z.string().min(1).optional(),
    retry: ConnectorRetryConfigSchema,
  })
  .passthrough();

export type ConnectorBaseConfig = z.infer<typeof ConnectorBaseConfigSchema>;

export interface ConnectorRequestConfig {
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
  readonly userAgent?: string;
  readonly retry?: RetryPolicyInput;
}

export function createConnectorConfigSchema<Shape extends z.ZodRawShape>(
  shape: Shape,
) {
  return ConnectorBaseConfigSchema.extend(shape);
}

export function parseConnectorConfig<Schema extends z.ZodTypeAny>(
  schema: Schema,
  rawConfig: unknown,
  connectorSlug: string,
): z.infer<Schema> {
  const parsed = schema.safeParse(rawConfig ?? {});
  if (!parsed.success)
    throw new ConnectorConfigError(connectorSlug, parsed.error);
  return parsed.data;
}

export function resolveConnectorUrl(
  baseUrl: string | undefined,
  pathOrUrl: string,
): string {
  if (/^https?:\/\//iu.test(pathOrUrl)) return pathOrUrl;
  if (!baseUrl) return pathOrUrl;

  return new URL(pathOrUrl, ensureTrailingSlash(baseUrl)).toString();
}

export function appendSearchParams(
  url: string,
  params: URLSearchParams,
): string {
  const resolved = new URL(url);
  for (const [key, value] of params) resolved.searchParams.set(key, value);
  return resolved.toString();
}

export function createConnectorRequestInit(
  config: ConnectorRequestConfig,
  signal: AbortSignal,
  extraHeaders: Record<string, string> = {},
): HttpClientRequestInit {
  const headers = {
    ...(config.headers ?? {}),
    ...(config.userAgent ? { "User-Agent": config.userAgent } : {}),
    ...extraHeaders,
  };

  return {
    signal,
    timeoutMs: config.timeoutMs,
    retry: config.retry,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
