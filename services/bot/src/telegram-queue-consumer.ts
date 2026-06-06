import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { TELEGRAM_QUEUE_NAME } from "@suchewohnung/telegram";

export type ProcessTelegramUpdate = (update: unknown) => Promise<void>;

export async function runTelegramUpdateJob(
  job: Pick<Job, "data">,
  processUpdate: ProcessTelegramUpdate,
): Promise<void> {
  const update = (job.data as { update?: unknown } | undefined)?.update;
  if (!update) {
    throw new Error("Invalid Telegram update job payload");
  }
  await processUpdate(update);
}

export function createRedisConnection(): any {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export function createTelegramWorkerOptions(
  options: { connection: any },
): { connection: any; concurrency: number } {
  return { ...options, concurrency: 1 };
}

export function startTelegramQueueConsumer(
  processUpdate: ProcessTelegramUpdate,
  connection = createRedisConnection(),
): { worker: Worker; connection: any } {
  const worker = new Worker(
    TELEGRAM_QUEUE_NAME,
    async (job) => runTelegramUpdateJob(job, processUpdate),
    createTelegramWorkerOptions({ connection }),
  );

  worker.on("completed", (job) => console.log(`[telegram] completed ${job.id}`));
  worker.on("failed", (job, err) => console.error(`[telegram] failed ${job?.id}`, err));

  return { worker, connection };
}
