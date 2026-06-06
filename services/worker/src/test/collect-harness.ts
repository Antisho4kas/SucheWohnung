import { vi } from "vitest";
import type { GeoPoint, SourceConnector } from "@suchewohnung/shared";
import { runCollectJob, type CollectDeps } from "../workers/collect.js";
import { createQueueMock } from "./bullmq-harness.js";

export type ImageRow = {
  id: string;
  listingId: string;
  url: string;
  position: number;
  storageKey?: string | null;
};

export type ListingRow = {
  id: string;
  sourceId: string;
  externalId: string;
  fingerprint: string;
  url: string;
  title?: string | null;
  price?: number | null;
  warmRent?: number | null;
  area?: number | null;
  rooms?: number | null;
  city?: string | null;
  bundesland?: string | null;
  postalCode?: string | null;
  geo?: GeoPoint | null;
  attributes: Record<string, unknown>;
  status: "active" | "updated" | "expired" | "removed";
  firstSeenAt: Date;
  lastSeenAt: Date;
  raw?: unknown;
};

export type HistoryRow = {
  listingId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedAt?: Date;
};

export type SourceRunRow = {
  id: string;
  sourceId: string;
  status: string;
  itemsFetched: number;
  itemsNew: number;
  itemsUpdated: number;
  errors: number;
  finishedAt?: Date | null;
};

export const collectHarnessSource = {
  id: "source-1",
  slug: "test-source",
  isActive: true,
  config: {
    itemsPerRun: 10,
    city: "Berlin",
    lifecycleStatus: "ready",
    activationApproved: true,
  },
  credentials: [],
};

export function validListing(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    sourceSlug: collectHarnessSource.slug,
    externalId: "ext-1",
    url: "https://example.com/listing/ext-1",
    title: "Nice flat",
    price: 1000,
    warmRent: 1200,
    area: 55,
    rooms: 2,
    city: "Berlin",
    postalCode: "10115",
    attributes: { balcony: true },
    images: [],
    raw: { provider: "fixture" },
    ...overrides,
  };
}

export function existingListing(
  overrides: Partial<ListingRow> = {},
): ListingRow {
  return {
    id: "listing-1",
    sourceId: collectHarnessSource.id,
    externalId: "ext-1",
    fingerprint: "existing-fingerprint",
    url: "https://example.com/listing/ext-1",
    title: "Nice flat",
    price: 1000,
    warmRent: 1200,
    area: 55,
    rooms: 2,
    city: "Berlin",
    bundesland: null,
    postalCode: "10115",
    attributes: { balcony: true },
    status: "active",
    firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    raw: { provider: "old" },
    ...overrides,
  };
}

export function connectorFor(
  rawItems: Record<string, unknown>[],
  overrides: Partial<SourceConnector> = {},
): SourceConnector {
  return {
    slug: collectHarnessSource.slug,
    type: "api",
    healthCheck: vi.fn(async () => ({ healthy: true })),
    fetch: vi.fn(async function* (_ctx, _opts) {
      for (const item of rawItems) {
        yield item;
      }
    }),
    map: vi.fn((raw) => raw as any),
    ...overrides,
  };
}

export function createCollectHarness(
  initialListings: ListingRow[] = [],
  initialImages: ImageRow[] = [],
) {
  const state = {
    listings: [...initialListings],
    images: [...initialImages],
    histories: [] as HistoryRow[],
    runs: [] as SourceRunRow[],
  };

  function withImages(listing: ListingRow | undefined | null) {
    if (!listing) return null;
    return {
      ...listing,
      images: state.images
        .filter((image) => image.listingId === listing.id)
        .sort((a, b) => a.position - b.position),
    };
  }

  const prisma: any = {
    source: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
        return where.slug === collectHarnessSource.slug
          ? collectHarnessSource
          : null;
      }),
    },
    sourceRun: {
      create: vi.fn(async ({ data }: { data: Partial<SourceRunRow> }) => {
        const run: SourceRunRow = {
          id: `run-${state.runs.length + 1}`,
          sourceId: String(data.sourceId),
          status: String(data.status),
          itemsFetched: 0,
          itemsNew: 0,
          itemsUpdated: 0,
          errors: 0,
          finishedAt: null,
          ...data,
        };
        state.runs.push(run);
        return run;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<SourceRunRow>;
        }) => {
          const run = state.runs.find((row) => row.id === where.id);
          if (!run) throw new Error(`run not found: ${where.id}`);
          Object.assign(run, data);
          return run;
        },
      ),
    },
    listing: {
      findFirst: vi.fn(async ({ where }: { where: Partial<ListingRow> }) => {
        return withImages(
          state.listings.find(
            (row) =>
              row.sourceId === where.sourceId &&
              row.externalId === where.externalId,
          ),
        );
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { fingerprint?: string; id?: string } }) => {
          return withImages(
            state.listings.find(
              (row) =>
                (where.id ? row.id === where.id : false) ||
                (where.fingerprint
                  ? row.fingerprint === where.fingerprint
                  : false),
            ),
          );
        },
      ),
      create: vi.fn(async ({ data }: { data: Partial<ListingRow> }) => {
        const listing: ListingRow = {
          id: `listing-${state.listings.length + 1}`,
          firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
          lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
          attributes: {},
          status: "active",
          ...data,
        } as ListingRow;
        state.listings.push(listing);
        return listing;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<ListingRow>;
        }) => {
          const listing = state.listings.find((row) => row.id === where.id);
          if (!listing) throw new Error(`listing not found: ${where.id}`);
          Object.assign(listing, data);
          return withImages(listing);
        },
      ),
    },
    $executeRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = Array.from(strings).join("?");
        if (sql.includes('SET "geo" = ST_SetSRID')) {
          const [lng, lat, listingId] = values;
          const listing = state.listings.find((row) => row.id === listingId);
          if (!listing) throw new Error(`listing not found: ${listingId}`);
          listing.geo = { lat: Number(lat), lng: Number(lng) };
        }
        if (sql.includes('SET "geo" = NULL')) {
          const [listingId] = values;
          const listing = state.listings.find((row) => row.id === listingId);
          if (!listing) throw new Error(`listing not found: ${listingId}`);
          listing.geo = null;
        }
        if (sql.includes('SET "attributes" = "attributes" -')) {
          const [
            eventKey,
            versionKey,
            listingId,
            ,
            expectedEvent,
            ,
            expectedVersion,
          ] = values;
          const listing = state.listings.find((row) => row.id === listingId);
          if (!listing) throw new Error(`listing not found: ${listingId}`);
          const attributes = listing.attributes;
          const currentEvent = String(attributes[String(eventKey)] ?? "");
          const currentVersion = String(attributes[String(versionKey)] ?? "");
          if (
            currentEvent === String(expectedEvent) &&
            currentVersion === String(expectedVersion ?? "")
          ) {
            const {
              [String(eventKey)]: _event,
              [String(versionKey)]: _version,
              ...rest
            } = attributes;
            listing.attributes = rest;
          }
        }
        return 1;
      },
    ),
    $queryRaw: vi.fn(
      async (_strings: TemplateStringsArray, ...values: unknown[]) => {
        const [listingId] = values;
        const listing = state.listings.find((row) => row.id === listingId);
        return listing?.geo
          ? [{ lat: listing.geo.lat, lng: listing.geo.lng }]
          : [];
      },
    ),
    listingImage: {
      createMany: vi.fn(async ({ data }: { data: ImageRow[] }) => {
        for (const image of data) {
          state.images.push({
            ...image,
            id: image.id ?? `image-${state.images.length + 1}`,
          });
        }
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { listingId: string } }) => {
        const before = state.images.length;
        state.images = state.images.filter(
          (image) => image.listingId !== where.listingId,
        );
        return { count: before - state.images.length };
      }),
    },
    listingHistory: {
      createMany: vi.fn(async ({ data }: { data: HistoryRow[] }) => {
        state.histories.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ),
  };

  const matchQueue = createQueueMock();

  return { prisma, matchQueue, state };
}

export async function runCollectWith(
  connector: SourceConnector,
  harness = createCollectHarness(),
) {
  const deps: CollectDeps = {
    prisma: harness.prisma,
    matchQueue: harness.matchQueue,
    connectors: { get: vi.fn(() => connector) },
  };
  await runCollectJob(
    { data: { sourceSlug: collectHarnessSource.slug, cursor: "cursor-1" } },
    deps,
  );
  return harness;
}
