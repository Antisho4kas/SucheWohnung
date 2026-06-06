import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BrowserPool,
  ConnectorContext,
  HttpClient,
  HttpClientResponse,
} from "../contract.js";
import { KleinanzeigenConnector } from "../kleinanzeigen-connector.js";
import { ImmoscoutConnector } from "../immoscout-connector.js";
import { ImmoweltConnector } from "../immowelt-connector.js";
import { MockConnector } from "../mock-connector.js";

function makeResponse(body: unknown, status = 200): HttpClientResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);

  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {},
    text: async () => text,
    json: async <T>() => JSON.parse(text) as T,
  };
}

const browser: BrowserPool = {
  withPage: async <T>(fn: (page: unknown) => Promise<T>) => fn({}),
};

function makeContext(
  config: Record<string, unknown>,
  http: HttpClient,
): ConnectorContext {
  return {
    config,
    http,
    browser,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    signal: new AbortController().signal,
  };
}

async function collect(
  connector: { fetch: ConnectorContext["http"] extends never ? never : any },
  ctx: ConnectorContext,
) {
  const values = [];
  for await (const raw of connector.fetch(ctx, { maxItems: 5 }))
    values.push(raw);
  return values;
}

describe("source connector SDK contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("MockConnector still satisfies the connector contract", async () => {
    const connector = new MockConnector();
    const ctx = makeContext(
      {},
      {
        get: async () => makeResponse({}),
        post: async () => makeResponse({}),
      },
    );

    const raw = await collect(connector, ctx);
    const mapped = connector.map(raw[0]!);

    expect(raw).toHaveLength(5);
    expect(mapped.sourceSlug).toBe("mock");
    expect(mapped.externalId).toBeTruthy();
  });

  it("KleinanzeigenConnector fetches through ctx.http, not global fetch", async () => {
    const globalFetch = vi.fn(() => {
      throw new Error("global fetch should not be used");
    });
    vi.stubGlobal("fetch", globalFetch);
    const calls: string[] = [];
    const http: HttpClient = {
      get: async (url) => {
        calls.push(url);
        if (url.includes("/inserate?")) {
          return makeResponse({
            results: [
              {
                adid: "ka-1",
                url: "https://example.com/ka-1",
                title: "Flat",
                price: "900",
                description: "Short",
                published_at: null,
              },
            ],
          });
        }
        return makeResponse({
          data: {
            location: { zip: "10115" },
            description: "Balkon und Aufzug",
            images: ["https://example.com/image.jpg"],
            details: { Wohnfläche: "65 m²", Zimmer: "2" },
          },
        });
      },
      post: async () => makeResponse({}),
    };
    const connector = new KleinanzeigenConnector();
    const ctx = makeContext(
      { baseUrl: "https://connector.local", city: "berlin", maxPages: 1 },
      http,
    );

    const raw = await collect(connector, ctx);
    const mapped = connector.map(raw[0]!);

    expect(globalFetch).not.toHaveBeenCalled();
    expect(calls[0]).toContain("https://connector.local/inserate?");
    expect(raw).toHaveLength(1);
    expect(mapped.externalId).toBe("ka-1");
    expect(mapped.area).toBe(65);
  });

  it("ImmoscoutConnector fetches through ctx.http with typed config", async () => {
    const http: HttpClient = {
      get: async () =>
        makeResponse({
          results: [
            {
              id: "is-1",
              url: "https://example.com/is-1",
              title: "Flat",
              price: 1000,
              area: 70,
              rooms: 2,
              city: "Berlin",
              postalCode: "10115",
              street: "Main Street",
            },
          ],
        }),
      post: async () => makeResponse({}),
    };
    const connector = new ImmoscoutConnector();
    const ctx = makeContext(
      { baseUrl: "https://connector.local", city: "Berlin" },
      http,
    );

    const raw = await collect(connector, ctx);
    const mapped = connector.map(raw[0]!);

    expect(raw).toHaveLength(1);
    expect(mapped.externalId).toBe("is-1");
    expect(mapped.price).toBe(1000);
  });

  it("ImmoweltConnector fetches HTML through ctx.http", async () => {
    const html = `<script type="application/json">{"estateListModel":{"estates":[{"estateId":"iw-1","headline":"Flat","mainPrice":950,"livingArea":55,"numberOfRooms":2,"postalCode":"10115","description":"Nice"}]}}</script>`;
    const http: HttpClient = {
      get: async () => makeResponse(html),
      post: async () => makeResponse({}),
    };
    const connector = new ImmoweltConnector();
    const ctx = makeContext(
      {
        baseUrl: "https://www.immowelt.example",
        city: "berlin",
        maxPages: 1,
        pageDelayMs: 0,
      },
      http,
    );

    const raw = await collect(connector, ctx);
    const mapped = connector.map(raw[0]!);

    expect(raw).toHaveLength(1);
    expect(mapped.externalId).toBe("iw-1");
    expect(mapped.price).toBe(950);
  });
});
