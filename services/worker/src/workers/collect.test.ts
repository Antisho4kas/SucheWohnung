import { describe, expect, it, vi } from "vitest";
import { runCollectJob, type CollectDeps } from "./collect.js";
import {
  collectHarnessSource as source,
  connectorFor,
  createCollectHarness as createDeps,
  existingListing,
  runCollectWith as runWith,
  validListing,
} from "../test/collect-harness.js";

function findRawSqlCall(
  calls: unknown[][],
  needle: string,
): [TemplateStringsArray, ...unknown[]] {
  const call = calls.find(([strings]) =>
    Array.from(strings as TemplateStringsArray)
      .join(" ")
      .includes(needle),
  );
  if (!call) throw new Error(`raw SQL call not found: ${needle}`);
  return call as [TemplateStringsArray, ...unknown[]];
}

describe("collect worker pipeline", () => {
  it("creates a new valid listing, stores images, and enqueues matching", async () => {
    const raw = validListing({
      images: [
        { url: "https://example.com/1.jpg" },
        { url: "https://example.com/2.jpg" },
      ],
    });
    const connector = connectorFor([raw]);

    const { matchQueue, state } = await runWith(connector);

    expect(connector.healthCheck).toHaveBeenCalledTimes(1);
    expect(connector.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ config: source.config }),
      {
        cursor: "cursor-1",
        maxItems: 10,
      },
    );
    expect(state.listings).toHaveLength(1);
    expect(state.listings[0]).toMatchObject({
      externalId: "ext-1",
      status: "active",
      price: 1000,
    });
    expect(state.images.map((image) => image.url)).toEqual([
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
    ]);
    expect(state.images.map((image) => image.position)).toEqual([0, 1]);
    expect(matchQueue.add).toHaveBeenCalledWith(
      "match",
      { listingId: state.listings[0]!.id, event: "created" },
      expect.objectContaining({ removeOnComplete: 5000, removeOnFail: 5000 }),
    );
    expect(state.runs[0]).toMatchObject({
      status: "success",
      itemsFetched: 1,
      itemsNew: 1,
      itemsUpdated: 0,
      errors: 0,
    });
  });

  it("persists connector-provided geo with a raw PostGIS update when creating a listing", async () => {
    const connector = connectorFor([
      validListing({ geo: { lat: 52.52, lng: 13.405 } }),
    ]);

    const { state, prisma } = await runWith(connector);

    expect(state.listings[0]!.geo).toEqual({ lat: 52.52, lng: 13.405 });
    const [strings, ...values] = findRawSqlCall(
      prisma.$executeRaw.mock.calls,
      "ST_SetSRID(ST_MakePoint",
    );
    expect(Array.from(strings).join(" ")).toContain("ST_SetSRID(ST_MakePoint");
    expect(values).toEqual([13.405, 52.52, state.listings[0]!.id]);
  });

  it("enqueues a versioned changed event for a price decrease", async () => {
    const connector = connectorFor([validListing({ price: 900 })]);
    const depsState = createDeps([existingListing()]);

    const { matchQueue, state } = await runWith(connector, depsState);

    expect(state.listings[0]).toMatchObject({ price: 900, status: "updated" });
    const priceHistory = state.histories.find(
      (history) =>
        history.field === "price" &&
        history.oldValue === 1000 &&
        history.newValue === 900,
    );
    expect(priceHistory).toBeDefined();
    expect(priceHistory?.changedAt).toBeInstanceOf(Date);
    expect(
      state.histories.some(
        (history) =>
          history.field === "status" &&
          history.oldValue === "active" &&
          history.newValue === "updated",
      ),
    ).toBe(true);
    expect(matchQueue.add).toHaveBeenCalledWith(
      "match",
      {
        listingId: state.listings[0]!.id,
        event: "changed",
        changeVersion: priceHistory!.changedAt!.toISOString(),
      },
      expect.objectContaining({ removeOnComplete: 5000, removeOnFail: 5000 }),
    );
    expect(state.runs[0]).toMatchObject({
      status: "success",
      itemsFetched: 1,
      itemsNew: 0,
      itemsUpdated: 1,
      errors: 0,
    });
  });

  it("does not enqueue rematch for a price increase", async () => {
    const connector = connectorFor([validListing({ price: 1100 })]);
    const depsState = createDeps([existingListing()]);

    const { matchQueue, state } = await runWith(connector, depsState);

    expect(state.listings[0]).toMatchObject({ price: 1100, status: "active" });
    expect(state.histories.some((history) => history.field === "price")).toBe(
      true,
    );
    expect(matchQueue.add).not.toHaveBeenCalled();
    expect(state.runs[0]).toMatchObject({ itemsUpdated: 1, errors: 0 });
  });

  it("keeps a pending created event ahead of a later price decrease", async () => {
    const connector = connectorFor([validListing({ price: 900 })]);
    const depsState = createDeps([
      existingListing({
        attributes: { balcony: true, _collect_pending_match_event: "created" },
      }),
    ]);

    const { matchQueue, state } = await runWith(connector, depsState);

    expect(state.histories.some((history) => history.field === "price")).toBe(
      true,
    );
    expect(matchQueue.add).toHaveBeenCalledWith(
      "match",
      { listingId: "listing-1", event: "created" },
      expect.objectContaining({ jobId: "match-listing-1-created" }),
    );
    expect(state.listings[0]!.attributes).toEqual({ balcony: true });
  });

  it("enqueues a changed event for a warm rent decrease", async () => {
    const connector = connectorFor([validListing({ warmRent: 1100 })]);
    const depsState = createDeps([existingListing()]);

    const { matchQueue, state } = await runWith(connector, depsState);

    const warmRentHistory = state.histories.find(
      (history) =>
        history.field === "warmRent" &&
        history.oldValue === 1200 &&
        history.newValue === 1100,
    );
    expect(warmRentHistory?.changedAt).toBeInstanceOf(Date);
    expect(matchQueue.add).toHaveBeenCalledWith(
      "match",
      {
        listingId: "listing-1",
        event: "changed",
        changeVersion: warmRentHistory!.changedAt!.toISOString(),
      },
      expect.objectContaining({ removeOnComplete: 5000, removeOnFail: 5000 }),
    );
  });

  it.each([
    ["area", { area: 60 }, 55, 60],
    ["rooms", { rooms: 3 }, 2, 3],
  ] as const)(
    "enqueues a changed event for %s corrections",
    async (field, overrides, oldValue, newValue) => {
      const connector = connectorFor([validListing(overrides)]);
      const depsState = createDeps([existingListing()]);

      const { matchQueue, state } = await runWith(connector, depsState);

      const history = state.histories.find(
        (row) =>
          row.field === field &&
          row.oldValue === oldValue &&
          row.newValue === newValue,
      );
      expect(history?.changedAt).toBeInstanceOf(Date);
      expect(matchQueue.add).toHaveBeenCalledWith(
        "match",
        {
          listingId: "listing-1",
          event: "changed",
          changeVersion: history!.changedAt!.toISOString(),
        },
        expect.objectContaining({ removeOnComplete: 5000, removeOnFail: 5000 }),
      );
    },
  );

  it("does not enqueue rematch for non-filter attribute changes", async () => {
    const connector = connectorFor([
      validListing({ attributes: { balcony: true, scrapeHash: "new" } }),
    ]);
    const depsState = createDeps([
      existingListing({ attributes: { balcony: true, scrapeHash: "old" } }),
    ]);

    const { matchQueue, state } = await runWith(connector, depsState);

    expect(
      state.histories.some((history) => history.field === "attributes"),
    ).toBe(true);
    expect(matchQueue.add).not.toHaveBeenCalled();
  });

  it("enqueues rematch for filter-relevant attribute changes", async () => {
    const connector = connectorFor([
      validListing({ attributes: { balcony: true } }),
    ]);
    const depsState = createDeps([
      existingListing({ attributes: { balcony: false } }),
    ]);

    const { matchQueue, state } = await runWith(connector, depsState);

    const attributeHistory = state.histories.find(
      (history) => history.field === "attributes",
    );
    expect(attributeHistory?.changedAt).toBeInstanceOf(Date);
    expect(matchQueue.add).toHaveBeenCalledWith(
      "match",
      {
        listingId: "listing-1",
        event: "changed",
        changeVersion: attributeHistory!.changedAt!.toISOString(),
      },
      expect.objectContaining({ removeOnComplete: 5000, removeOnFail: 5000 }),
    );
  });

  it("enqueues only one changed event for a repeated same price drop", async () => {
    const depsState = createDeps([existingListing()]);

    await runWith(connectorFor([validListing({ price: 900 })]), depsState);
    expect(depsState.matchQueue.add).toHaveBeenCalledTimes(1);
    const priceHistoryCount = depsState.state.histories.filter(
      (history) => history.field === "price",
    ).length;

    depsState.matchQueue.add.mockClear();
    await runWith(connectorFor([validListing({ price: 900 })]), depsState);

    expect(depsState.matchQueue.add).not.toHaveBeenCalled();
    expect(
      depsState.state.histories.filter((history) => history.field === "price"),
    ).toHaveLength(priceHistoryCount);
  });

  it("touches lastSeenAt without history or rematch for unchanged listings", async () => {
    const connector = connectorFor([validListing()]);
    const oldLastSeenAt = new Date("2026-01-01T00:00:00.000Z");
    const depsState = createDeps([
      existingListing({ lastSeenAt: oldLastSeenAt }),
    ]);

    const { matchQueue, state } = await runWith(connector, depsState);

    expect(state.listings[0]!.lastSeenAt.getTime()).toBeGreaterThan(
      oldLastSeenAt.getTime(),
    );
    expect(state.histories).toHaveLength(0);
    expect(matchQueue.add).not.toHaveBeenCalled();
    expect(state.runs[0]).toMatchObject({
      status: "success",
      itemsFetched: 1,
      itemsNew: 0,
      itemsUpdated: 0,
      errors: 0,
    });
  });

  it("updates changed geo, records history, and enqueues rematch", async () => {
    const connector = connectorFor([
      validListing({ geo: { lat: 52.52, lng: 13.405 } }),
    ]);
    const depsState = createDeps([
      existingListing({ geo: { lat: 52.4, lng: 13.2 } }),
    ]);

    const { matchQueue, state, prisma } = await runWith(connector, depsState);

    expect(state.listings[0]!.geo).toEqual({ lat: 52.52, lng: 13.405 });
    expect(state.listings[0]).toMatchObject({ status: "updated" });
    expect(
      state.histories.some(
        (history) =>
          history.field === "geo" &&
          JSON.stringify(history.oldValue) ===
            JSON.stringify({ lat: 52.4, lng: 13.2 }) &&
          JSON.stringify(history.newValue) ===
            JSON.stringify({ lat: 52.52, lng: 13.405 }),
      ),
    ).toBe(true);
    expect(
      prisma.$executeRaw.mock.calls.some(([strings]) =>
        Array.from(strings as TemplateStringsArray)
          .join(" ")
          .includes("ST_SetSRID(ST_MakePoint"),
      ),
    ).toBe(true);
    expect(matchQueue.add).toHaveBeenCalledWith(
      "match",
      {
        listingId: "listing-1",
        event: "changed",
        changeVersion: expect.any(String),
      },
      expect.objectContaining({ removeOnComplete: 5000, removeOnFail: 5000 }),
    );
  });

  it("preserves existing geo when an update omits geo", async () => {
    const connector = connectorFor([validListing()]);
    const depsState = createDeps([
      existingListing({ geo: { lat: 52.52, lng: 13.405 } }),
    ]);

    const { matchQueue, state, prisma } = await runWith(connector, depsState);

    expect(state.listings[0]!.geo).toEqual({ lat: 52.52, lng: 13.405 });
    expect(state.histories.some((history) => history.field === "geo")).toBe(
      false,
    );
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(matchQueue.add).not.toHaveBeenCalled();
  });

  it("persists invalid listings in quarantine instead of dropping them", async () => {
    const connector = connectorFor([validListing({ price: 5 })]);

    const { matchQueue, state } = await runWith(connector);

    expect(state.listings).toHaveLength(1);
    expect(state.listings[0]).toMatchObject({
      externalId: "ext-1",
      status: "removed",
    });
    expect(state.listings[0]!.attributes).toMatchObject({ _quarantine: true });
    expect(state.listings[0]!.attributes._quality_issues).toEqual(
      expect.arrayContaining([expect.stringContaining("price")]),
    );
    expect(matchQueue.add).not.toHaveBeenCalled();
    expect(state.runs[0]).toMatchObject({
      status: "partial",
      itemsFetched: 1,
      itemsNew: 1,
      itemsUpdated: 0,
      errors: 1,
    });
  });

  it("replaces changed images without rematch when listing fields are unchanged", async () => {
    const connector = connectorFor([
      validListing({ images: [{ url: "https://example.com/new.jpg" }] }),
    ]);
    const depsState = createDeps(
      [existingListing()],
      [
        {
          id: "image-1",
          listingId: "listing-1",
          url: "https://example.com/old.jpg",
          position: 0,
        },
      ],
    );

    const { matchQueue, state } = await runWith(connector, depsState);

    expect(state.images.map((image) => image.url)).toEqual([
      "https://example.com/new.jpg",
    ]);
    expect(state.images.map((image) => image.position)).toEqual([0]);
    expect(state.histories.some((history) => history.field === "images")).toBe(
      true,
    );
    expect(matchQueue.add).not.toHaveBeenCalled();
    expect(state.runs[0]).toMatchObject({
      status: "success",
      itemsFetched: 1,
      itemsNew: 0,
      itemsUpdated: 1,
      errors: 0,
    });
  });

  it("removes stale images when the source returns an empty image set", async () => {
    const connector = connectorFor([validListing()]);
    const depsState = createDeps(
      [existingListing()],
      [
        {
          id: "image-1",
          listingId: "listing-1",
          url: "https://example.com/old.jpg",
          position: 0,
        },
      ],
    );

    const { matchQueue, state } = await runWith(connector, depsState);

    expect(state.images).toHaveLength(0);
    expect(state.histories.some((history) => history.field === "images")).toBe(
      true,
    );
    expect(matchQueue.add).not.toHaveBeenCalled();
    expect(state.runs[0]).toMatchObject({ itemsUpdated: 1, errors: 0 });
  });

  it("quarantines raw items when connector mapping fails", async () => {
    const connector = connectorFor(
      [{ id: "raw-1", url: "https://example.com/raw-1" }],
      {
        map: vi.fn(() => {
          throw new Error("selector missing");
        }),
      },
    );

    const { matchQueue, state } = await runWith(connector);

    expect(state.listings).toHaveLength(1);
    expect(state.listings[0]).toMatchObject({ status: "removed" });
    expect(state.listings[0]!.attributes).toMatchObject({ _quarantine: true });
    expect(state.listings[0]!.attributes._quality_issues).toEqual([
      "map failed: selector missing",
    ]);
    expect(matchQueue.add).not.toHaveBeenCalled();
    expect(state.runs[0]).toMatchObject({ status: "partial", errors: 1 });
  });

  it("passes credentials only through the decrypt hook", async () => {
    const raw = validListing();
    const connector = connectorFor([raw]);
    const depsState = createDeps();
    depsState.prisma.source.findUnique.mockResolvedValueOnce({
      ...source,
      credentials: [
        { type: "api_key", encryptedSecret: { ciphertext: "abc" } },
      ],
    });
    const decryptCredential = vi.fn(async () => ({ token: "decrypted" }));
    const deps: CollectDeps = {
      prisma: depsState.prisma,
      matchQueue: depsState.matchQueue,
      connectors: { get: vi.fn(() => connector) },
      decryptCredential,
    };

    await runCollectJob({ data: { sourceSlug: source.slug } }, deps);

    expect(decryptCredential).toHaveBeenCalledWith({ ciphertext: "abc" });
    expect(connector.healthCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: { type: "api_key", secret: { token: "decrypted" } },
      }),
    );
  });

  it("persists DB changes before enqueueing match jobs", async () => {
    const connector = connectorFor([validListing()]);
    const depsState = createDeps();
    depsState.matchQueue.add.mockRejectedValueOnce(new Error("redis down"));
    const deps: CollectDeps = {
      prisma: depsState.prisma,
      matchQueue: depsState.matchQueue,
      connectors: { get: vi.fn(() => connector) },
    };

    await runCollectJob({ data: { sourceSlug: source.slug } }, deps);

    expect(depsState.state.listings).toHaveLength(1);
    expect(depsState.state.listings[0]!.attributes).toMatchObject({
      _collect_pending_match_event: "created",
    });
    expect(depsState.state.runs[0]).toMatchObject({
      status: "partial",
      itemsNew: 1,
      errors: 1,
    });
  });

  it("retries pending match events on unchanged listings and clears the marker", async () => {
    const connector = connectorFor([validListing()]);
    const depsState = createDeps([
      existingListing({
        attributes: { balcony: true, _collect_pending_match_event: "created" },
      }),
    ]);

    const { matchQueue, state } = await runWith(connector, depsState);

    expect(matchQueue.add).toHaveBeenCalledWith(
      "match",
      { listingId: "listing-1", event: "created" },
      expect.objectContaining({ removeOnComplete: 5000, removeOnFail: 5000 }),
    );
    expect(state.listings[0]!.attributes).toEqual({ balcony: true });
    expect(state.runs[0]).toMatchObject({
      status: "success",
      itemsUpdated: 0,
      errors: 0,
    });
  });

  it("reactivates unchanged expired listings and enqueues rematch", async () => {
    const connector = connectorFor([validListing()]);
    const depsState = createDeps([existingListing({ status: "expired" })]);

    const { matchQueue, state } = await runWith(connector, depsState);

    expect(state.listings[0]).toMatchObject({ status: "updated" });
    expect(
      state.histories.some(
        (history) =>
          history.field === "status" &&
          history.oldValue === "expired" &&
          history.newValue === "updated",
      ),
    ).toBe(true);
    expect(matchQueue.add).toHaveBeenCalledWith(
      "match",
      {
        listingId: "listing-1",
        event: "changed",
        changeVersion: expect.any(String),
      },
      expect.any(Object),
    );
  });

  it("fails closed when stored credentials exist without a decrypt hook", async () => {
    const connector = connectorFor([validListing()]);
    const depsState = createDeps();
    depsState.prisma.source.findUnique.mockResolvedValueOnce({
      ...source,
      credentials: [
        { type: "api_key", encryptedSecret: { ciphertext: "abc" } },
      ],
    });
    const deps: CollectDeps = {
      prisma: depsState.prisma,
      matchQueue: depsState.matchQueue,
      connectors: { get: vi.fn(() => connector) },
    };

    await expect(
      runCollectJob({ data: { sourceSlug: source.slug } }, deps),
    ).rejects.toThrow("credential decryptor");

    expect(connector.healthCheck).not.toHaveBeenCalled();
    expect(depsState.state.runs[0]).toMatchObject({
      status: "failed",
      errors: 1,
    });
  });

  it("sanitizes unsupported JSON values before persistence", async () => {
    const raw = validListing({
      attributes: { balcony: true, nested: { skip: undefined }, count: 1n },
    });
    const connector = connectorFor([raw]);

    const { state } = await runWith(connector);

    expect(state.listings[0]!.attributes).toMatchObject({
      balcony: true,
      nested: {},
      count: "1",
    });
  });

  it("does not enqueue rematch for non-significant listing changes", async () => {
    const connector = connectorFor([
      validListing({ title: "Same flat, new title" }),
    ]);
    const depsState = createDeps([existingListing()]);

    const { matchQueue, state } = await runWith(connector, depsState);

    expect(state.listings[0]).toMatchObject({
      title: "Same flat, new title",
      status: "active",
    });
    expect(state.histories.some((history) => history.field === "title")).toBe(
      true,
    );
    expect(matchQueue.add).not.toHaveBeenCalled();
    expect(state.runs[0]).toMatchObject({
      status: "success",
      itemsFetched: 1,
      itemsNew: 0,
      itemsUpdated: 1,
      errors: 0,
    });
  });

  it("fails fast on unhealthy connectors and does not fetch", async () => {
    const fetch = vi.fn(async function* () {
      yield validListing();
    });
    const connector = connectorFor([], {
      healthCheck: vi.fn(async () => ({ healthy: false, detail: "blocked" })),
      fetch,
    });
    const depsState = createDeps();
    const deps: CollectDeps = {
      prisma: depsState.prisma,
      matchQueue: depsState.matchQueue,
      connectors: { get: vi.fn(() => connector) },
    };

    await expect(
      runCollectJob({ data: { sourceSlug: source.slug } }, deps),
    ).rejects.toThrow("blocked");

    expect(fetch).not.toHaveBeenCalled();
    expect(depsState.state.runs[0]).toMatchObject({
      status: "failed",
      itemsFetched: 0,
      itemsNew: 0,
      itemsUpdated: 0,
      errors: 1,
    });
  });

  it("skips active sources that are not approved for activation", async () => {
    const connector = connectorFor([validListing()]);
    const depsState = createDeps();
    depsState.prisma.source.findUnique.mockResolvedValueOnce({
      ...source,
      config: {
        lifecycleStatus: "permission-needed",
        activationApproved: false,
      },
    });
    const deps: CollectDeps = {
      prisma: depsState.prisma,
      matchQueue: depsState.matchQueue,
      connectors: { get: vi.fn(() => connector) },
    };

    await expect(
      runCollectJob({ data: { sourceSlug: source.slug } }, deps),
    ).resolves.toBeUndefined();

    expect(connector.healthCheck).not.toHaveBeenCalled();
    expect(depsState.state.runs).toHaveLength(0);
    expect(depsState.matchQueue.add).not.toHaveBeenCalled();
  });

  it("skips active sources without a registered connector instead of throwing", async () => {
    const depsState = createDeps();
    depsState.prisma.source.findUnique.mockResolvedValueOnce({
      ...source,
      config: { lifecycleStatus: "ready", activationApproved: true },
    });
    const deps: CollectDeps = {
      prisma: depsState.prisma,
      matchQueue: depsState.matchQueue,
      connectors: { get: vi.fn(() => undefined) },
    };

    await expect(
      runCollectJob({ data: { sourceSlug: source.slug } }, deps),
    ).resolves.toBeUndefined();

    expect(depsState.state.runs).toHaveLength(0);
    expect(depsState.matchQueue.add).not.toHaveBeenCalled();
  });
});
