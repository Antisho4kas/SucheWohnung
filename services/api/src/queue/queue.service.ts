import { Injectable, OnModuleDestroy, Global, Module } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAMES = ["collect", "match", "notify", "telegram"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * Queue access (§06.2.3 BullMQ, §05.4). The API only *enqueues* and inspects;
 * workers consume (services/worker). Queue names per VALIDATION C6.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queues: Map<string, Queue>;

  constructor() {
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queues = new Map(
      QUEUE_NAMES.map((n) => [n, new Queue(n, { connection: this.connection as any })]),
    );
  }

  private q(name: string): Queue {
    const queue = this.queues.get(name);
    if (!queue) throw new Error(`Unknown queue: ${name}`);
    return queue;
  }

  async enqueueCollect(sourceSlug: string, cursor?: string): Promise<void> {
    await this.q("collect").add(
      "collect",
      { sourceSlug, cursor },
      { removeOnComplete: 1000, removeOnFail: 5000, attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );
  }

  async enqueueMatch(listingId: string, event: "created" | "changed"): Promise<void> {
    await this.q("match").add(
      "match",
      { listingId, event },
      { removeOnComplete: 5000, removeOnFail: 5000, attempts: 5, backoff: { type: "exponential", delay: 3000 } },
    );
  }

  async enqueueNotify(matchId: string, delayMs = 0): Promise<void> {
    await this.q("notify").add(
      "notify",
      { matchId },
      { delay: delayMs, removeOnComplete: 5000, removeOnFail: 5000, attempts: 5, backoff: { type: "exponential", delay: 3000 } },
    );
  }

  async enqueueTelegramUpdate(update: unknown): Promise<void> {
    await this.q("telegram").add("update", { update }, { removeOnComplete: 1000, removeOnFail: 1000, attempts: 3 });
  }

  async getCounts(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const [name, queue] of this.queues) {
      out[name] = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
      );
    }
    return out;
  }

  async retryFailed(name: string): Promise<number> {
    const queue = this.q(name);
    const failed = await queue.getFailed(0, 1000);
    let n = 0;
    for (const job of failed) {
      await job.retry();
      n++;
    }
    return n;
  }

  async onModuleDestroy(): Promise<void> {
    for (const queue of this.queues.values()) await queue.close();
    await this.connection.quit();
  }
}

@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
