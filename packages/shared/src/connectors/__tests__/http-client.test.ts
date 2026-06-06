import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConnectorAbortError,
  ConnectorHttpError,
  ConnectorTimeoutError,
} from "../errors.js";
import { createHttpClient } from "../http-client.js";

function makeResponse(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      forEach(fn: (value: string, key: string) => void) {
        for (const [key, value] of Object.entries(normalizedHeaders))
          fn(value, key);
      },
      get(name: string) {
        return normalizedHeaders[name.toLowerCase()] ?? null;
      },
    },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

function abortingFetch() {
  return vi.fn((_url: unknown, init?: { signal?: AbortSignal }) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        { once: true },
      );
    });
  });
}

describe("shared connector HttpClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the injected fetch implementation instead of global fetch", async () => {
    const globalFetch = vi.fn(() => {
      throw new Error("global fetch should not be used");
    });
    vi.stubGlobal("fetch", globalFetch);
    const fetchImpl = vi.fn(async () => makeResponse('{"ok":true}'));
    const client = createHttpClient({ fetch: fetchImpl });

    const response = await client.get("https://example.com/listings");

    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("retries network errors with exponential backoff", async () => {
    const delays: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket closed"))
      .mockResolvedValueOnce(makeResponse('{"ok":true}'));
    const client = createHttpClient({
      fetch: fetchImpl,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 25,
        maxDelayMs: 100,
        jitter: false,
      },
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    const response = await client.get("https://example.com/listings");

    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([25]);
  });

  it("honors Retry-After on retryable HTTP responses", async () => {
    const delays: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(makeResponse("", 429, { "Retry-After": "3" }))
      .mockResolvedValueOnce(makeResponse('{"ok":true}'));
    const client = createHttpClient({
      fetch: fetchImpl,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 25,
        maxDelayMs: 5000,
        jitter: false,
      },
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    const response = await client.get("https://example.com/listings");

    expect(response.ok).toBe(true);
    expect(delays).toEqual([3000]);
  });

  it("throws a typed timeout error when request timeout aborts fetch", async () => {
    const fetchImpl = abortingFetch();
    const client = createHttpClient({
      fetch: fetchImpl,
      timeoutMs: 5,
      retry: { maxAttempts: 1, jitter: false },
    });

    await expect(client.get("https://example.com/slow")).rejects.toBeInstanceOf(
      ConnectorTimeoutError,
    );
  });

  it("throws a typed abort error when caller signal is aborted", async () => {
    const fetchImpl = abortingFetch();
    const client = createHttpClient({
      fetch: fetchImpl,
      retry: { maxAttempts: 1, jitter: false },
    });
    const controller = new AbortController();

    const request = client.get("https://example.com/slow", {
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toBeInstanceOf(ConnectorAbortError);
  });

  it("can throw typed HTTP status errors after retries are exhausted", async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse('{"error":"missing"}', 404),
    );
    const client = createHttpClient({
      fetch: fetchImpl,
      retry: { maxAttempts: 1 },
    });

    await expect(
      client.get("https://example.com/missing", { throwOnHttpError: true }),
    ).rejects.toMatchObject({ status: 404, name: "ConnectorHttpError" });
    await expect(
      client.get("https://example.com/missing", { throwOnHttpError: true }),
    ).rejects.toBeInstanceOf(ConnectorHttpError);
  });
});
