import { Worker, Queue } from "bullmq";
import { prisma } from "../prisma.js";
import { createRedisConnection } from "../redis.js";
import {
  MockConnector,
  KleinanzeigenConnector,
  ConnectorRegistry,
  runQualityGate,
  computeFingerprint,
} from "@suchewohnung/shared";

const registry = new ConnectorRegistry();
registry.register(new MockConnector());
registry.register(new KleinanzeigenConnector());

const connection = createRedisConnection();
const matchQueue = new Queue("match", { connection });

async function runCollectJob(job: { data: { sourceSlug: string; cursor?: string } }): Promise<void> {
  const { sourceSlug } = job.data;
  const source = await prisma.source.findUnique({ where: { slug: sourceSlug } });
  if (!source || !source.isActive) {
    console.log(`[collect] Source ${sourceSlug} not found or inactive, skipping.`);
    return;
  }

  const connector = registry.get(sourceSlug);
  if (!connector) {
    throw new Error(`No connector registered for slug: ${sourceSlug}`);
  }

  const run = await prisma.sourceRun.create({
    data: { sourceId: source.id, status: "running" },
  });

  let fetched = 0;
  let newItems = 0;

  try {
    const ctx = {
      config: (source.config as Record<string, unknown>) ?? {},
      http: {
        get: async () => ({ status: 200, headers: {}, text: async () => "", json: async () => ({}) }),
        post: async () => ({ status: 200, headers: {}, text: async () => "", json: async () => ({}) }),
      },
      browser: { withPage: async <T>(fn: (page: unknown) => Promise<T>) => fn({}) },
      logger: {
        debug: (msg: string) => console.log(`[${sourceSlug}] ${msg}`),
        info: (msg: string) => console.log(`[${sourceSlug}] ${msg}`),
        warn: (msg: string) => console.warn(`[${sourceSlug}] ${msg}`),
        error: (msg: string) => console.error(`[${sourceSlug}] ${msg}`),
      },
      signal: new AbortController().signal,
      credentials: undefined,
    };

    const maxItems = (ctx.config.itemsPerRun as number) ?? 25;
    const iterable = connector.fetch(ctx as any, { maxItems });

    for await (const raw of iterable) {
      fetched++;
      const normalized = connector.map(raw);
      const quality = runQualityGate(normalized);
      if (!quality.ok) {
        console.warn(`[collect] Quality gate failed for ${normalized.externalId}:`, quality.issues);
        continue;
      }

      const fingerprint = computeFingerprint(normalized);
      const existing = await prisma.listing.findUnique({ where: { fingerprint } });

      if (!existing) {
        const listing = await prisma.listing.create({
          data: {
            sourceId: source.id,
            externalId: normalized.externalId,
            fingerprint,
            url: normalized.url,
            title: normalized.title ?? null,
            price: normalized.price ?? null,
            warmRent: normalized.warmRent ?? null,
            area: normalized.area ?? null,
            rooms: normalized.rooms ?? null,
            city: normalized.city ?? null,
            bundesland: normalized.bundesland ?? null,
            postalCode: normalized.postalCode ?? null,
            attributes: normalized.attributes as object,
            status: "active",
            raw: raw as object,
          },
        });
        newItems++;
        await matchQueue.add("match", { listingId: listing.id, event: "created" }, { removeOnComplete: 5000, removeOnFail: 5000 });
      } else {
        await prisma.listing.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date() },
        });
      }
    }

    await prisma.sourceRun.update({
      where: { id: run.id },
      data: { status: "success", itemsFetched: fetched, itemsNew: newItems, finishedAt: new Date() },
    });
  } catch (err) {
    const _message = err instanceof Error ? err.message : String(err);
    await prisma.sourceRun.update({
      where: { id: run.id },
      data: { status: "failed", itemsFetched: fetched, finishedAt: new Date() },
    });
    throw err;
  }
}

const worker = new Worker("collect", async (job) => runCollectJob(job), { connection, concurrency: 2 });

worker.on("completed", (job) => console.log(`[collect] completed ${job.id}`));
worker.on("failed", (job, err) => console.error(`[collect] failed ${job?.id}`, err));

console.log("[collect] Worker started");
