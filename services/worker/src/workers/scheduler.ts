import { Queue, Worker } from "bullmq";
import { prisma } from "../prisma.js";
import { createRedisConnection } from "../redis.js";
import {
  COLLECT_JOB_NAME,
  COLLECT_JOB_OPTIONS,
  COLLECT_QUEUE_NAME,
  SCHEDULE_SOURCE_JOB_NAME,
  SCHEDULER_QUEUE_NAME,
  SCHEDULER_TICK_JOB_OPTIONS,
  SOURCES_SYNC_JOB_OPTIONS,
  SOURCES_SYNC_SCHEDULER_ID,
  SYNC_SOURCES_JOB_NAME,
  getCollectJobId,
  getSourceSchedulerId,
} from "../queue-options.js";

const SOURCE_LOCK_TTL_MS = 10 * 60 * 1_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const SOURCE_SCHEDULER_SYNC_INTERVAL_MS = 60_000;

const sourceSchedulerSelect = {
  id: true,
  slug: true,
  isActive: true,
  scheduleCron: true,
  rateLimitRpm: true,
};

type SourceRecord = {
  id: string;
  slug: string;
  isActive: boolean;
  scheduleCron: string;
  rateLimitRpm: number;
};

type QueueAuditStatus =
  | "queued"
  | "rate_limited"
  | "schedule_failed"
  | "skipped_active"
  | "skipped_duplicate"
  | "skipped_inactive"
  | "skipped_locked";

type SourceTick = {
  sourceId: string;
  sourceSlug: string;
};

type SchedulerDeps = {
  schedulerQueue: Pick<
    Queue,
    "getJobSchedulers" | "removeJobScheduler" | "upsertJobScheduler"
  >;
  collectQueue: Pick<Queue, "add" | "getJob">;
  connection: {
    eval: (...args: unknown[]) => Promise<unknown>;
    incr: (key: string) => Promise<number>;
    pexpire: (key: string, milliseconds: number) => Promise<unknown>;
    set: (...args: unknown[]) => Promise<unknown>;
  };
  prisma: {
    source: {
      findMany: (args?: unknown) => Promise<SourceRecord[]>;
      findUnique: (args: unknown) => Promise<SourceRecord | null>;
    };
    jobQueueAudit: {
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    };
  };
  now: () => Date;
};

type EnqueueResult = {
  status: QueueAuditStatus;
  jobId: string;
};

const protectedCollectStates = new Set([
  "active",
  "delayed",
  "paused",
  "prioritized",
  "waiting",
  "waiting-children",
]);

function createLockToken(sourceId: string, now: Date): string {
  return `${sourceId}:${now.getTime()}:${Math.random().toString(36).slice(2)}`;
}

function getLockKey(sourceId: string): string {
  return `scheduler:source:${sourceId}:lock`;
}

function getRateLimitKey(sourceId: string, now: Date): string {
  return `scheduler:source:${sourceId}:rpm:${Math.floor(now.getTime() / RATE_LIMIT_WINDOW_MS)}`;
}

function getSchedulerJsonId(scheduler: unknown): string | undefined {
  if (!scheduler || typeof scheduler !== "object") return undefined;
  const value = scheduler as Record<string, unknown>;
  if (typeof value.key === "string") return value.key;
  if (typeof value.id === "string") return value.id;
  if (typeof value.name === "string") return value.name;
  return undefined;
}

function getDuplicateStatus(state: string): QueueAuditStatus {
  return state === "active" ? "skipped_active" : "skipped_duplicate";
}

function createDefaultDeps(): SchedulerDeps {
  const connection = createRedisConnection();
  return {
    schedulerQueue: new Queue(SCHEDULER_QUEUE_NAME, {
      connection,
      defaultJobOptions: SCHEDULER_TICK_JOB_OPTIONS,
    }),
    collectQueue: new Queue(COLLECT_QUEUE_NAME, {
      connection,
      defaultJobOptions: COLLECT_JOB_OPTIONS,
    }),
    connection,
    prisma: prisma as unknown as SchedulerDeps["prisma"],
    now: () => new Date(),
  };
}

async function writeQueueAudit(
  deps: SchedulerDeps,
  status: QueueAuditStatus,
  source: Pick<SourceRecord, "id" | "slug">,
  jobId: string,
  payload: Record<string, unknown>,
  queue = COLLECT_QUEUE_NAME,
): Promise<void> {
  await deps.prisma.jobQueueAudit.create({
    data: {
      queue,
      jobId,
      sourceId: source.id,
      status,
      attempts: 0,
      payload,
    },
  });
}

async function tryWriteQueueAudit(
  deps: SchedulerDeps,
  status: QueueAuditStatus,
  source: Pick<SourceRecord, "id" | "slug">,
  jobId: string,
  payload: Record<string, unknown>,
  queue = COLLECT_QUEUE_NAME,
): Promise<void> {
  try {
    await writeQueueAudit(deps, status, source, jobId, payload, queue);
  } catch (err) {
    console.error(
      `[scheduler] Failed to audit ${status} for ${source.slug}`,
      err,
    );
  }
}

async function acquireSourceLock(
  deps: SchedulerDeps,
  sourceId: string,
): Promise<string | null> {
  const token = createLockToken(sourceId, deps.now());
  const result = await deps.connection.set(
    getLockKey(sourceId),
    token,
    "PX",
    SOURCE_LOCK_TTL_MS,
    "NX",
  );
  return result === "OK" ? token : null;
}

async function releaseSourceLock(
  deps: SchedulerDeps,
  sourceId: string,
  token: string,
): Promise<void> {
  await deps.connection.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    getLockKey(sourceId),
    token,
  );
}

async function consumeRateLimit(
  deps: SchedulerDeps,
  source: SourceRecord,
): Promise<boolean> {
  if (source.rateLimitRpm <= 0) return false;

  const key = getRateLimitKey(source.id, deps.now());
  const count = await deps.connection.incr(key);
  if (count === 1) {
    await deps.connection.pexpire(key, RATE_LIMIT_WINDOW_MS + 1_000);
  }

  return count <= source.rateLimitRpm;
}

async function getExistingProtectedState(
  deps: SchedulerDeps,
  jobId: string,
): Promise<string | null> {
  const existingJob = await deps.collectQueue.getJob(jobId);
  if (!existingJob) return null;

  const getState = (existingJob as { getState?: () => Promise<string> })
    .getState;
  if (!getState) return "waiting";

  const state = await getState.call(existingJob);
  return protectedCollectStates.has(state) ? state : null;
}

export async function syncSourceSchedulers(
  deps: SchedulerDeps = createDefaultDeps(),
): Promise<void> {
  const sources = await deps.prisma.source.findMany({
    select: sourceSchedulerSelect,
  });
  const activeSources = sources.filter((source) => source.isActive);
  const scheduledSourceIds = new Set<string>();

  for (const source of activeSources) {
    const schedulerId = getSourceSchedulerId(source.id);
    try {
      await deps.schedulerQueue.upsertJobScheduler(
        schedulerId,
        { pattern: source.scheduleCron },
        {
          name: SCHEDULE_SOURCE_JOB_NAME,
          data: { sourceId: source.id, sourceSlug: source.slug },
          opts: SCHEDULER_TICK_JOB_OPTIONS,
        },
      );
      scheduledSourceIds.add(schedulerId);
      console.log(
        `[scheduler] Scheduled source ${source.slug} with ${source.scheduleCron}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.schedulerQueue.removeJobScheduler(schedulerId);
      await tryWriteQueueAudit(
        deps,
        "schedule_failed",
        source,
        schedulerId,
        {
          sourceSlug: source.slug,
          scheduleCron: source.scheduleCron,
          error: message,
        },
        SCHEDULER_QUEUE_NAME,
      );
      console.error(
        `[scheduler] Failed to schedule source ${source.slug}`,
        err,
      );
    }
  }

  const existingSchedulers = await deps.schedulerQueue.getJobSchedulers(
    0,
    -1,
    true,
  );
  for (const schedulerJson of existingSchedulers) {
    const schedulerId = getSchedulerJsonId(schedulerJson);
    if (!schedulerId?.startsWith("source-")) continue;
    if (scheduledSourceIds.has(schedulerId)) continue;

    await deps.schedulerQueue.removeJobScheduler(schedulerId);
    console.log(`[scheduler] Removed inactive scheduler ${schedulerId}`);
  }
}

export async function enqueueCollectForSource(
  deps: SchedulerDeps = createDefaultDeps(),
  tick: SourceTick,
): Promise<EnqueueResult> {
  const source = await deps.prisma.source.findUnique({
    where: { id: tick.sourceId },
    select: sourceSchedulerSelect,
  });
  const jobId = getCollectJobId(tick.sourceId);
  const auditSource = { id: tick.sourceId, slug: tick.sourceSlug };

  if (!source || !source.isActive) {
    await tryWriteQueueAudit(deps, "skipped_inactive", auditSource, jobId, {
      sourceSlug: tick.sourceSlug,
      reason: source ? "inactive" : "not_found",
    });
    return { status: "skipped_inactive", jobId };
  }

  const lockToken = await acquireSourceLock(deps, source.id);
  if (!lockToken) {
    await tryWriteQueueAudit(deps, "skipped_locked", source, jobId, {
      sourceSlug: source.slug,
      reason: "per_source_lock_held",
    });
    return { status: "skipped_locked", jobId };
  }

  try {
    const existingState = await getExistingProtectedState(deps, jobId);
    if (existingState) {
      const status = getDuplicateStatus(existingState);
      await tryWriteQueueAudit(deps, status, source, jobId, {
        sourceSlug: source.slug,
        existingState,
      });
      return { status, jobId };
    }

    const withinRateLimit = await consumeRateLimit(deps, source);
    if (!withinRateLimit) {
      await tryWriteQueueAudit(deps, "rate_limited", source, jobId, {
        sourceSlug: source.slug,
        rateLimitRpm: source.rateLimitRpm,
      });
      return { status: "rate_limited", jobId };
    }

    const job = await deps.collectQueue.add(
      COLLECT_JOB_NAME,
      { sourceSlug: source.slug, rateLimitRpm: source.rateLimitRpm },
      { ...COLLECT_JOB_OPTIONS, jobId },
    );
    const enqueuedJobId = String(job.id ?? jobId);
    await tryWriteQueueAudit(deps, "queued", source, enqueuedJobId, {
      sourceSlug: source.slug,
      rateLimitRpm: source.rateLimitRpm,
      scheduleCron: source.scheduleCron,
      attempts: COLLECT_JOB_OPTIONS.attempts,
      backoff: COLLECT_JOB_OPTIONS.backoff,
    });
    console.log(`[scheduler] Enqueued collect for ${source.slug}`);
    return { status: "queued", jobId: enqueuedJobId };
  } finally {
    await releaseSourceLock(deps, source.id, lockToken);
  }
}

export async function upsertSourceSchedulerSync(
  deps: SchedulerDeps = createDefaultDeps(),
): Promise<void> {
  await deps.schedulerQueue.upsertJobScheduler(
    SOURCES_SYNC_SCHEDULER_ID,
    { every: SOURCE_SCHEDULER_SYNC_INTERVAL_MS },
    {
      name: SYNC_SOURCES_JOB_NAME,
      data: {},
      opts: SOURCES_SYNC_JOB_OPTIONS,
    },
  );
}

export async function startScheduler(
  deps: SchedulerDeps = createDefaultDeps(),
): Promise<Worker> {
  await syncSourceSchedulers(deps);
  await upsertSourceSchedulerSync(deps);

  const worker = new Worker(
    SCHEDULER_QUEUE_NAME,
    async (job) => {
      if (job.name === SYNC_SOURCES_JOB_NAME) {
        await syncSourceSchedulers(deps);
        return;
      }
      if (job.name !== SCHEDULE_SOURCE_JOB_NAME) return;
      await enqueueCollectForSource(deps, job.data as SourceTick);
    },
    {
      connection: deps.connection as never,
      concurrency: Number(process.env.SCHEDULER_CONCURRENCY ?? 5),
    },
  );

  worker.on("completed", (job) =>
    console.log(`[scheduler] completed ${job.id}`),
  );
  worker.on("failed", (job, err) =>
    console.error(`[scheduler] failed ${job?.id}`, err),
  );
  console.log("[scheduler] Worker started");
  return worker;
}

function shouldRunMain(): boolean {
  const entry = process.argv[1]?.replace(/\\/g, "/");
  return (
    entry?.endsWith("/scheduler.js") === true ||
    entry?.endsWith("/scheduler.ts") === true
  );
}

if (shouldRunMain()) {
  startScheduler().catch((err) => {
    console.error("[scheduler] Fatal error", err);
    process.exit(1);
  });
}
