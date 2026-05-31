import { Worker, Queue } from "bullmq";
import { prisma } from "../prisma.js";
import { createRedisConnection } from "../redis.js";
import { buildFilterIndex, SEED_FILTER_DEFINITIONS, evaluateProfile } from "@suchewohnung/shared";

const connection = createRedisConnection();
const notifyQueue = new Queue("notify", { connection });

const filterIndex = buildFilterIndex(SEED_FILTER_DEFINITIONS);

async function runMatchJob(job: { data: { listingId: string; event: "created" | "changed" } }): Promise<void> {
  const { listingId } = job.data;
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { source: true },
  });
  if (!listing) {
    console.warn(`[match] Listing ${listingId} not found`);
    return;
  }
  if (listing.status !== "active" && listing.status !== "updated") {
    console.log(`[match] Listing ${listingId} status=${listing.status}, skipping`);
    return;
  }

  // Coarse SQL prefilter: active profiles with matching city/price/rooms from criteria snapshot
  const profiles = await prisma.searchProfile.findMany({
    where: {
      isActive: true,
      notify: true,
      criteria: {
        // Prisma JSONB querying is limited; we fetch all active and filter in-memory for now
        // In production, this would use raw SQL with GIN index (§10.3)
        not: {},
      },
    },
    include: { filters: { include: { definition: true } }, user: { include: { telegramSubscriptions: true } } },
  });

  let matched = 0;

  for (const profile of profiles) {
    // Build precise filters
    const profileFilters = profile.filters.map((f) => ({
      key: f.definition.key,
      operator: f.operator as any,
      value: f.value as any,
    }));

    const listingNormalized = {
      sourceSlug: listing.source.slug,
      externalId: listing.externalId,
      url: listing.url,
      title: listing.title ?? undefined,
      dealType: "rent" as const,
      price: listing.price ? Number(listing.price) : undefined,
      warmRent: listing.warmRent ? Number(listing.warmRent) : undefined,
      area: listing.area ? Number(listing.area) : undefined,
      rooms: listing.rooms ? Number(listing.rooms) : undefined,
      city: listing.city ?? undefined,
      bundesland: listing.bundesland as any,
      postalCode: listing.postalCode ?? undefined,
      geo: undefined,
      attributes: (listing.attributes as Record<string, unknown>) ?? {},
      images: [],
      raw: undefined,
    };

    const result = evaluateProfile(listingNormalized, profileFilters, filterIndex);
    if (result.matched) {
      try {
        const match = await prisma.match.create({
          data: {
            profileId: profile.id,
            listingId: listing.id,
            state: "pending",
          },
        });
        matched++;
        // Enqueue notification
        await notifyQueue.add(
          "notify",
          { matchId: match.id },
          { removeOnComplete: 5000, removeOnFail: 5000, attempts: 5, backoff: { type: "exponential", delay: 3000 } },
        );
      } catch (err) {
        // ON CONFLICT (profile_id, listing_id) will throw; ignore duplicates
        if ((err as any)?.code === "P2002") {
          console.log(`[match] Duplicate match for profile=${profile.id} listing=${listing.id}`);
        } else {
          throw err;
        }
      }
    }
  }

  console.log(`[match] Listing ${listingId} matched ${matched} profiles`);
}

const worker = new Worker("match", async (job) => runMatchJob(job), { connection, concurrency: 5 });

worker.on("completed", (job) => console.log(`[match] completed ${job.id}`));
worker.on("failed", (job, err) => console.error(`[match] failed ${job?.id}`, err));

console.log("[match] Worker started");
