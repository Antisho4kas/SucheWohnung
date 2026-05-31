import { Queue } from "bullmq";
import { prisma } from "../prisma.js";
import { createRedisConnection } from "../redis.js";

const connection = createRedisConnection();
const collectQueue = new Queue("collect", { connection });

async function scheduleSources(): Promise<void> {
  const sources = await prisma.source.findMany({ where: { isActive: true } });
  for (const source of sources) {
    // Simple dedup: check if a job for this source is already waiting
    const jobs = await collectQueue.getJobs(["waiting", "delayed"], 0, 100);
    const alreadyQueued = jobs.some((j) => j.data.sourceSlug === source.slug);
    if (alreadyQueued) {
      console.log(`[scheduler] Source ${source.slug} already queued, skipping`);
      continue;
    }
    await collectQueue.add(
      "collect",
      { sourceSlug: source.slug },
      { removeOnComplete: 1000, removeOnFail: 5000, attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );
    console.log(`[scheduler] Enqueued collect for ${source.slug}`);
  }
}

async function main(): Promise<void> {
  console.log("[scheduler] Starting scheduler loop");
  // Run immediately, then every 60 seconds
  await scheduleSources();
  setInterval(() => {
    void scheduleSources();
  }, 60_000);
}

main().catch((err) => {
  console.error("[scheduler] Fatal error", err);
  process.exit(1);
});
