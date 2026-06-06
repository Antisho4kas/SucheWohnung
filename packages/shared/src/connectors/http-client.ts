import type {
  HttpClient,
  HttpClientRequestInit,
  HttpClientResponse,
} from "./contract.js";
import {
  ConnectorAbortError,
  ConnectorHttpError,
  ConnectorNetworkError,
  ConnectorTimeoutError,
} from "./errors.js";
import {
  isRetryableStatus,
  normalizeRetryPolicy,
  resolveRetryDelayMs,
  type RetryPolicyInput,
} from "./retry.js";

export interface FetchHeadersLike {
  forEach?(fn: (value: string, key: string) => void): void;
  get?(name: string): string | null;
}

export interface FetchResponseLike {
  readonly status: number;
  readonly ok?: boolean;
  readonly headers: FetchHeadersLike | Record<string, string>;
  text(): Promise<string>;
}

export interface FetchRequestInitLike {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export type FetchLike = (
  url: string,
  init?: FetchRequestInitLike,
) => Promise<FetchResponseLike>;

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface HttpClientOptions {
  readonly fetch?: FetchLike;
  readonly headers?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly retry?: RetryPolicyInput;
  readonly sleep?: Sleep;
  readonly now?: () => number;
  readonly random?: () => number;
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchImpl = options.fetch ?? defaultFetch;
  const baseHeaders = options.headers ?? {};
  const defaultTimeoutMs = options.timeoutMs ?? 10_000;
  const defaultRetry = normalizeRetryPolicy(options.retry);
  const sleep = options.sleep ?? sleepMs;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;

  async function request(
    method: string,
    url: string,
    init: HttpClientRequestInit = {},
  ): Promise<HttpClientResponse> {
    const policy = normalizeRetryPolicy(
      init.retry as RetryPolicyInput | undefined,
    );
    const retryPolicy = init.retry ? policy : defaultRetry;
    let lastError: unknown;

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
      const abortState = createRequestSignal(
        init.signal,
        init.timeoutMs ?? defaultTimeoutMs,
      );
      try {
        const response = wrapResponse(
          await fetchImpl(url, {
            method: init.method ?? method,
            headers: { ...baseHeaders, ...(init.headers ?? {}) },
            body: init.body,
            signal: abortState.signal,
          }),
        );

        if (
          isRetryableStatus(response.status, retryPolicy.retryStatuses) &&
          attempt < retryPolicy.maxAttempts
        ) {
          await sleep(
            resolveRetryDelayMs(
              attempt,
              retryPolicy,
              response.headers["retry-after"],
              now(),
              random,
            ),
            init.signal,
          );
          continue;
        }

        if (init.throwOnHttpError && !response.ok) {
          throw new ConnectorHttpError(
            url,
            response.status,
            await response.text(),
          );
        }

        return response;
      } catch (error) {
        const normalizedError = normalizeRequestError(error, url, abortState);
        if (normalizedError instanceof ConnectorAbortError)
          throw normalizedError;
        if (
          normalizedError instanceof ConnectorHttpError &&
          !isRetryableStatus(normalizedError.status, retryPolicy.retryStatuses)
        ) {
          throw normalizedError;
        }
        lastError = normalizedError;

        if (attempt >= retryPolicy.maxAttempts) throw normalizedError;

        await sleep(
          resolveRetryDelayMs(attempt, retryPolicy, undefined, now(), random),
          init.signal,
        );
      } finally {
        abortState.cleanup();
      }
    }

    throw lastError;
  }

  return {
    get: (url, init) => request("GET", url, init),
    post: (url, init) => request("POST", url, init),
  };
}

function defaultFetch(
  url: string,
  init?: FetchRequestInitLike,
): Promise<FetchResponseLike> {
  return fetch(url, init as RequestInit) as Promise<FetchResponseLike>;
}

function wrapResponse(response: FetchResponseLike): HttpClientResponse {
  const headers = normalizeHeaders(response.headers);
  let textPromise: Promise<string> | undefined;

  return {
    status: response.status,
    ok: response.ok ?? (response.status >= 200 && response.status < 300),
    headers,
    text: () => {
      textPromise ??= response.text();
      return textPromise;
    },
    json: async <T>() => {
      textPromise ??= response.text();
      return JSON.parse(await textPromise) as T;
    },
  };
}

function normalizeHeaders(
  headers: FetchHeadersLike | Record<string, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {};

  if ("forEach" in headers && typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
    return normalized;
  }

  for (const [key, value] of Object.entries(headers))
    normalized[key.toLowerCase()] = value;
  return normalized;
}

interface RequestSignalState {
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly timedOut: () => boolean;
  readonly callerAborted: () => boolean;
  cleanup(): void;
}

function createRequestSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): RequestSignalState {
  if (callerSignal?.aborted)
    throw new ConnectorAbortError("Connector request aborted before start");

  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;

  const onCallerAbort = () => {
    callerAborted = true;
    controller.abort();
  };
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    timeoutMs,
    timedOut: () => timedOut,
    callerAborted: () => callerAborted,
    cleanup: () => {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

function normalizeRequestError(
  error: unknown,
  url: string,
  signalState: RequestSignalState,
): Error {
  if (error instanceof ConnectorHttpError) return error;
  if (error instanceof ConnectorAbortError) return error;
  if (error instanceof ConnectorTimeoutError) return error;
  if (signalState.callerAborted())
    return new ConnectorAbortError(`HTTP request aborted: ${url}`, url, error);
  if (signalState.timedOut())
    return new ConnectorTimeoutError(url, signalState.timeoutMs, error);
  if (isAbortError(error))
    return new ConnectorAbortError(`HTTP request aborted: ${url}`, url, error);
  return new ConnectorNetworkError(url, error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted)
    return Promise.reject(new ConnectorAbortError("Connector sleep aborted"));

  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new ConnectorAbortError("Connector sleep aborted"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
