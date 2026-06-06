import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@suchewohnung/database";
import {
  ConnectorRegistry,
  MOCK_SOURCE_SLUG,
  type ConnectorContext,
  type FetchOptions,
  type HealthStatus,
  type NormalizedListing,
  type RawListing,
  type SourceConnector,
} from "@suchewohnung/shared";
import { createRedisConnection } from "../redis.js";
import { runCollectJob, type CollectDeps } from "../workers/collect.js";
import { runMatchJob } from "../workers/match.js";
import { runNotifyJob } from "../workers/notify.js";
import { createRedisTelegramRateLimiter } from "../workers/telegram-delivery.js";

const RUN_ID = `release-smoke-${randomUUID()}`;
const BULLMQ_PREFIX = RUN_ID;
const EXPECTED_DB_NAME = "suchewohnung_smoke";
const smokeDescribe =
  process.env.RUN_DB_REDIS_SMOKE === "1" ? describe : describe.skip;

let prisma: PrismaClient;
let redis: IORedis;
let collectQueue: Queue;
let matchQueue: Queue;
let notifyQueue: Queue;
let collectQueueEvents: QueueEvents;
let matchQueueEvents: QueueEvents;
let notifyQueueEvents: QueueEvents;
let collectWorker: Worker;
let matchWorker: Worker;
let notifyWorker: Worker;

type SmokeState = {
  userId?: string;
  profileId?: string;
  subscriptionId?: string;
  listingId?: string;
  matchId?: string;
  notificationId?: string;
  sourceRunId?: string;
  collectJobId?: string;
  matchJobId?: string;
  notifyJobId?: string;
};

const smokeState: SmokeState = {};

const disabledTelegramApi = {
  sendMessage: async () => {
    const error = new Error("smoke telegram stub disabled") as Error & {
      response: { error_code: number; description: string };
    };
    error.response = {
      error_code: 400,
      description: "Bad Request: smoke telegram stub disabled",
    };
    throw error;
  },
  sendPhoto: async () => {
    const error = new Error("smoke telegram stub disabled") as Error & {
      response: { error_code: number; description: string };
    };
    error.response = {
      error_code: 400,
      description: "Bad Request: smoke telegram stub disabled",
    };
    throw error;
  },
};

class DeterministicSmokeConnector implements SourceConnector {
  readonly slug = MOCK_SOURCE_SLUG;
  readonly type = "api" as const;

  async healthCheck(_ctx: ConnectorContext): Promise<HealthStatus> {
    return { healthy: true, detail: "release smoke connector healthy" };
  }

  async *fetch(
    _ctx: ConnectorContext,
    _opts: FetchOptions,
  ): AsyncIterable<RawListing> {
    yield {
      id: RUN_ID,
      url: `https://mock.suchewohnung.local/release-smoke/${RUN_ID}`,
      title: "Release smoke Berlin apartment",
      price: 900,
      warmRent: 1_050,
      area: 55,
      rooms: 2,
      city: "Berlin",
      bundesland: "Berlin",
      postal_code: "10115",
      balcony: true,
      provisionfrei: true,
    };
  }

  map(raw: RawListing): NormalizedListing {
    return {
      sourceSlug: MOCK_SOURCE_SLUG,
      externalId: String(raw.id),
      url: String(raw.url),
      title: String(raw.title),
      dealType: "rent",
      price: Number(raw.price),
      warmRent: Number(raw.warmRent ?? raw.warm_rent),
      area: Number(raw.area),
      rooms: Number(raw.rooms),
      city: String(raw.city),
      bundesland: "Berlin",
      postalCode: String(raw.postal_code),
      geo: { lat: 52.52, lng: 13.405 },
      attributes: {
        balcony: raw.balcony === true,
        provisionfrei: raw.provisionfrei === true,
      },
      images: [],
      raw,
    };
  }
}

function requireSmokeEnv(): void {
  if (process.env.RUN_DB_REDIS_SMOKE !== "1") {
    throw new Error(
      "RUN_DB_REDIS_SMOKE=1 is required for DB/Redis release smoke.",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for DB/Redis release smoke.");
  }
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is required for DB/Redis release smoke.");
  }
  if (!process.env.SMOKE_DATABASE_URL || !process.env.SMOKE_REDIS_URL) {
    throw new Error(
      "SMOKE_DATABASE_URL and SMOKE_REDIS_URL are required for DB/Redis release smoke.",
    );
  }
}

function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[/u, "").replace(/\]$/u, "");
}

function isLoopback(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(normalizeHost(hostname));
}

function isAllowedSmokeDatabaseTarget(url: URL): boolean {
  const hostname = normalizeHost(url.hostname);
  const port = url.port || "5432";
  if (hostname === "postgres-smoke" && port === "5432") return true;
  if (isLoopback(hostname) && port === "55432") return true;
  return (
    process.env.CI_SMOKE_DB_IS_EPHEMERAL === "1" &&
    isLoopback(hostname) &&
    port === "5432"
  );
}

function isAllowedSmokeRedisTarget(url: URL): boolean {
  const hostname = normalizeHost(url.hostname);
  const port = url.port || "6379";
  if (hostname === "redis-smoke" && port === "6379") return true;
  if (isLoopback(hostname) && port === "56379") return true;
  return (
    process.env.CI_SMOKE_REDIS_IS_EPHEMERAL === "1" &&
    isLoopback(hostname) &&
    port === "6379"
  );
}

function assertSafeDatabaseUrl(): void {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.DATABASE_URL !== process.env.SMOKE_DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must match SMOKE_DATABASE_URL for release smoke.",
    );
  }
  if (!isAllowedSmokeDatabaseTarget(url)) {
    throw new Error(
      `Refusing to run release smoke against DB ${url.hostname}:${url.port || "5432"}.`,
    );
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (dbName !== EXPECTED_DB_NAME) {
    throw new Error(
      `Refusing to run release smoke against database "${dbName}"; expected "${EXPECTED_DB_NAME}".`,
    );
  }
}

function assertSafeRedisUrl(): void {
  const url = new URL(process.env.REDIS_URL ?? "");
  if (process.env.REDIS_URL !== process.env.SMOKE_REDIS_URL) {
    throw new Error("REDIS_URL must match SMOKE_REDIS_URL for release smoke.");
  }
  if (!isAllowedSmokeRedisTarget(url)) {
    throw new Error(
      `Refusing to run release smoke against Redis ${url.hostname}:${url.port || "6379"}.`,
    );
  }
}

function createSmokeRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry();
  registry.register(new DeterministicSmokeConnector());
  return registry;
}

async function cleanupSmokeData(): Promise<void> {
  await prisma.notification.deleteMany({
    where: {
      match: {
        listing: {
          externalId: RUN_ID,
          source: { is: { slug: MOCK_SOURCE_SLUG } },
        },
      },
    },
  });
  await prisma.match.deleteMany({
    where: {
      listing: {
        externalId: RUN_ID,
        source: { is: { slug: MOCK_SOURCE_SLUG } },
      },
    },
  });
  if (smokeState.notificationId) {
    await prisma.notification.deleteMany({
      where: { id: smokeState.notificationId },
    });
  }
  if (smokeState.matchId) {
    await prisma.match.deleteMany({ where: { id: smokeState.matchId } });
  }
  if (smokeState.sourceRunId) {
    await prisma.sourceRun.deleteMany({
      where: { id: smokeState.sourceRunId },
    });
  }
  await prisma.user.deleteMany({
    where: { email: `release-smoke-${RUN_ID}@example.invalid` },
  });
  await prisma.listing.deleteMany({
    where: { externalId: RUN_ID, source: { is: { slug: MOCK_SOURCE_SLUG } } },
  });
}

async function cleanupSmokeQueues(): Promise<void> {
  const jobs = [
    { queue: collectQueue, jobId: smokeState.collectJobId },
    { queue: matchQueue, jobId: smokeState.matchJobId },
    { queue: notifyQueue, jobId: smokeState.notifyJobId },
  ];
  for (const item of jobs) {
    if (!item.jobId) continue;
    const job = await item.queue.getJob(item.jobId);
    await job?.remove();
  }
}

async function createSmokeProfile(): Promise<void> {
  const [cityDef, priceDef, locationDef] = await Promise.all([
    prisma.filterDefinition.findUniqueOrThrow({ where: { key: "city" } }),
    prisma.filterDefinition.findUniqueOrThrow({ where: { key: "price" } }),
    prisma.filterDefinition.findUniqueOrThrow({ where: { key: "location" } }),
  ]);

  const user = await prisma.user.create({
    data: {
      email: `release-smoke-${RUN_ID}@example.invalid`,
      passwordHash: "release-smoke-not-a-real-password-hash",
      status: "active",
      searchProfiles: {
        create: {
          name: "Release smoke profile",
          notify: true,
          criteria: { releaseSmokeRunId: RUN_ID },
          filters: {
            create: [
              { filterDefId: cityDef.id, operator: "eq", value: "Berlin" },
              { filterDefId: priceDef.id, operator: "lte", value: 1_200 },
              {
                filterDefId: locationDef.id,
                operator: "within",
                value: { lat: 52.5, lng: 13.4, radius_km: 5 },
              },
            ],
          },
        },
      },
      telegramSubscriptions: {
        create: {
          chatId: BigInt("900719925474099"),
          enabled: true,
        },
      },
    },
    include: {
      searchProfiles: true,
      telegramSubscriptions: true,
    },
  });

  smokeState.userId = user.id;
  smokeState.profileId = user.searchProfiles[0]?.id;
  smokeState.subscriptionId = user.telegramSubscriptions[0]?.id;
  if (!smokeState.profileId || !smokeState.subscriptionId) {
    throw new Error(
      "Failed to create smoke profile and Telegram subscription.",
    );
  }
}

async function waitForQueueJob(
  queue: Queue,
  queueEvents: QueueEvents,
  jobId: string | number | undefined,
): Promise<void> {
  if (!jobId) throw new Error("Cannot wait for a BullMQ job without an id.");
  const queuedJob = await queue.getJob(String(jobId));
  if (!queuedJob) {
    throw new Error(
      `BullMQ job ${jobId} was not found in queue ${queue.name}.`,
    );
  }
  await queuedJob.waitUntilFinished(queueEvents, 30_000);
}

smokeDescribe("DB/Redis release smoke", () => {
  beforeAll(async () => {
    requireSmokeEnv();
    assertSafeDatabaseUrl();
    assertSafeRedisUrl();

    prisma = new PrismaClient();
    redis = createRedisConnection();
    collectQueue = new Queue("collect", {
      connection: redis,
      prefix: BULLMQ_PREFIX,
    });
    matchQueue = new Queue("match", {
      connection: redis,
      prefix: BULLMQ_PREFIX,
    });
    notifyQueue = new Queue("notify", {
      connection: redis,
      prefix: BULLMQ_PREFIX,
    });
    collectQueueEvents = new QueueEvents("collect", {
      connection: createRedisConnection(),
      prefix: BULLMQ_PREFIX,
    });
    matchQueueEvents = new QueueEvents("match", {
      connection: createRedisConnection(),
      prefix: BULLMQ_PREFIX,
    });
    notifyQueueEvents = new QueueEvents("notify", {
      connection: createRedisConnection(),
      prefix: BULLMQ_PREFIX,
    });
    await Promise.all([
      redis.ping(),
      collectQueueEvents.waitUntilReady(),
      matchQueueEvents.waitUntilReady(),
      notifyQueueEvents.waitUntilReady(),
    ]);

    const collectDeps: CollectDeps = {
      prisma: prisma as never,
      matchQueue,
      connectors: createSmokeRegistry(),
    };
    collectWorker = new Worker(
      "collect",
      async (job) => runCollectJob(job as never, collectDeps),
      {
        connection: createRedisConnection(),
        concurrency: 1,
        prefix: BULLMQ_PREFIX,
      },
    );
    matchWorker = new Worker(
      "match",
      async (job) =>
        runMatchJob(job as never, {
          prisma: prisma as never,
          notifyQueue,
        }),
      {
        connection: createRedisConnection(),
        concurrency: 1,
        prefix: BULLMQ_PREFIX,
      },
    );
    notifyWorker = new Worker(
      "notify",
      async (job, token) =>
        runNotifyJob(job as never, token, {
          prisma: prisma as never,
          telegramApi: disabledTelegramApi,
          rateLimiter: createRedisTelegramRateLimiter(redis),
          now: () => new Date(),
        }),
      {
        connection: createRedisConnection(),
        concurrency: 1,
        prefix: BULLMQ_PREFIX,
      },
    );
    await Promise.all([
      collectWorker.waitUntilReady(),
      matchWorker.waitUntilReady(),
      notifyWorker.waitUntilReady(),
    ]);

    await cleanupSmokeData();
    await createSmokeProfile();
  });

  afterAll(async () => {
    const cleanupQueues = cleanupSmokeQueues().catch((error) => {
      console.warn("[release-smoke] Queue cleanup failed", error);
    });
    const cleanupData = cleanupSmokeData().catch((error) => {
      console.warn("[release-smoke] DB cleanup failed", error);
    });
    await Promise.all([cleanupQueues, cleanupData]);
    await Promise.allSettled([
      collectWorker?.close(),
      matchWorker?.close(),
      notifyWorker?.close(),
      collectQueueEvents?.close(),
      matchQueueEvents?.close(),
      notifyQueueEvents?.close(),
      collectQueue?.close(),
      matchQueue?.close(),
      notifyQueue?.close(),
      redis?.quit(),
      prisma?.$disconnect(),
    ]);
  });

  it("verifies clean migrations and idempotent seed baseline", async () => {
    const [postgis] = await prisma.$queryRaw<Array<{ installed: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed
    `;
    expect(postgis?.installed).toBe(true);

    const [geoColumn] = await prisma.$queryRaw<
      Array<{ udt_name: string; data_type: string }>
    >`
      SELECT udt_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'geo'
      LIMIT 1
    `;
    expect(geoColumn).toMatchObject({ udt_name: "geography" });

    const [sourceCount, filterCount, mockSource] = await Promise.all([
      prisma.source.count(),
      prisma.filterDefinition.count(),
      prisma.source.findUnique({ where: { slug: MOCK_SOURCE_SLUG } }),
    ]);
    const [sourceSlugs, filterKeys] = await Promise.all([
      prisma.source.findMany({ select: { slug: true } }),
      prisma.filterDefinition.findMany({ select: { key: true } }),
    ]);
    expect(sourceCount).toBeGreaterThanOrEqual(1);
    expect(filterCount).toBeGreaterThanOrEqual(16);
    expect(new Set(sourceSlugs.map((source) => source.slug)).size).toBe(
      sourceSlugs.length,
    );
    expect(new Set(filterKeys.map((filter) => filter.key)).size).toBe(
      filterKeys.length,
    );
    expect(mockSource).toMatchObject({
      isActive: true,
      integrationType: "api",
    });
  });

  it("collects mock listings, matches a seeded profile, and records a notification via real Redis queues", async () => {
    const collectJob = await collectQueue.add(
      "collect",
      { sourceSlug: MOCK_SOURCE_SLUG },
      { jobId: RUN_ID, removeOnComplete: 5_000, removeOnFail: 5_000 },
    );
    smokeState.collectJobId = String(collectJob.id);
    await waitForQueueJob(collectQueue, collectQueueEvents, collectJob.id);

    const listing = await prisma.listing.findFirstOrThrow({
      where: { externalId: RUN_ID, source: { slug: MOCK_SOURCE_SLUG } },
      include: { source: true, images: true },
    });
    smokeState.listingId = listing.id;
    expect(listing).toMatchObject({
      city: "Berlin",
      postalCode: "10115",
      status: "active",
      source: { slug: MOCK_SOURCE_SLUG },
    });
    const [persistedGeo] = await prisma.$queryRaw<
      Array<{ lat: number | string | null; lng: number | string | null }>
    >`
      SELECT ST_Y("geo"::geometry) AS lat, ST_X("geo"::geometry) AS lng
      FROM "listings"
      WHERE "id" = ${listing.id}::uuid AND "geo" IS NOT NULL
      LIMIT 1
    `;
    expect(Number(persistedGeo?.lat)).toBeCloseTo(52.52, 6);
    expect(Number(persistedGeo?.lng)).toBeCloseTo(13.405, 6);

    const sourceRun = await prisma.sourceRun.findFirst({
      where: { sourceId: listing.sourceId },
      orderBy: { startedAt: "desc" },
    });
    smokeState.sourceRunId = sourceRun?.id;
    expect(sourceRun).toMatchObject({
      status: "success",
      itemsFetched: 1,
      itemsNew: 1,
      errors: 0,
    });

    const matchJobs = await matchQueue.getJobs(
      ["waiting", "delayed", "prioritized", "active", "completed", "failed"],
      0,
      20,
      false,
    );
    const matchJob = matchJobs.find(
      (job) => job.data?.listingId === listing.id,
    );
    expect(matchJob).toBeDefined();
    smokeState.matchJobId = matchJob?.id ? String(matchJob.id) : undefined;
    await waitForQueueJob(matchQueue, matchQueueEvents, matchJob?.id);

    const match = await prisma.match.findFirstOrThrow({
      where: { listingId: listing.id, profileId: smokeState.profileId },
    });
    smokeState.matchId = match.id;
    expect(["pending", "notified"]).toContain(match.state);

    const notifyJobs = await notifyQueue.getJobs(
      ["waiting", "delayed", "prioritized", "active", "completed", "failed"],
      0,
      20,
      false,
    );
    const notifyJob = notifyJobs.find((job) => job.data?.matchId === match.id);
    expect(notifyJob).toBeDefined();
    smokeState.notifyJobId = notifyJob?.id ? String(notifyJob.id) : undefined;
    await waitForQueueJob(notifyQueue, notifyQueueEvents, notifyJob?.id);

    const notification = await prisma.notification.findFirstOrThrow({
      where: { matchId: match.id, subscriptionId: smokeState.subscriptionId },
    });
    smokeState.notificationId = notification.id;
    expect(notification).toMatchObject({
      channel: "telegram",
      status: "failed",
    });
    expect(notification.error).toContain("telegram_permanent:400");

    const notifiedMatch = await prisma.match.findUniqueOrThrow({
      where: { id: match.id },
    });
    expect(notifiedMatch.state).toBe("notified");
  });
});
